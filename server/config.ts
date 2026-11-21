/**
 * Which deployment this server is (roadmap step 42) and the settings that
 * must differ between them. `DEPLOY_ENV` is development (default), staging
 * or production.
 *
 * - production refuses to start without a database, a staff token or an
 *   explicit CORS list, and with sandbox push or Xcode-signed purchases;
 * - staging accepts test purchases (Apple sandbox, Google license testers)
 *   and APNs sandbox tokens from development builds;
 * - each database remembers which deployment first used it
 *   (`server_meta.environment`, migration 0012), and a server of another kind
 *   refuses to start on it: a staging server can never write to the
 *   production database, or the other way round.
 */
import { readFileSync } from 'node:fs';
import type { ConnectionOptions } from 'node:tls';
import { AppleVerifier } from './payments/apple';
import { parseCidrs } from './rateLimit';
import { GoogleVerifier, type Fetch, type ServiceAccount } from './payments/google';
import { parseUnder13Mode } from '../src/backend/net/compliance';
import { DEFAULT_POLICY as DEFAULT_POLICY_FOR_LOG } from './core/context';

export type DeployEnv = 'development' | 'staging' | 'production';

export function deployEnv(env: Record<string, string | undefined>): DeployEnv {
  const v = env.DEPLOY_ENV ?? 'development';
  if (v !== 'development' && v !== 'staging' && v !== 'production') throw new Error(`DEPLOY_ENV must be development, staging or production (got "${v}").`);
  return v;
}

const list = (v: string | undefined) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);

/** proxy-addr's named ranges, accepted in TRUST_PROXY next to addresses and CIDRs. */
const PROXY_RANGES = new Set(['loopback', 'linklocal', 'uniquelocal']);

/**
 * TRUST_PROXY for Fastify: unset/"false"/"0" → false (players connect
 * directly), a hop count ("1": one load balancer in front) → number, or a
 * comma list of the proxies' addresses/CIDRs → string. "true" trusts every
 * X-Forwarded-For entry, so a client can pick its own IP: refused in
 * production (checkConfig). Throws on anything else.
 */
export function parseTrustProxy(v: string | undefined): boolean | number | string {
  if (v === undefined || v === '' || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  if (/^\d+$/.test(v)) return Number(v);
  const items = list(v);
  parseCidrs(items.filter((x) => !PROXY_RANGES.has(x)));
  return items.join(',');
}

/** ADMIN_TOKENS "name:token,name2:token2" → { name: token }. Each token ≥ 24 characters; names are what the staff log shows. */
export function parseAdminTokens(v: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const item of list(v)) {
    const i = item.indexOf(':');
    const name = i > 0 ? item.slice(0, i).trim() : '';
    const token = i > 0 ? item.slice(i + 1).trim() : '';
    if (!/^[\p{L}\p{N} ._-]{1,40}$/u.test(name)) throw new Error('ADMIN_TOKENS must be "name:token" pairs separated by commas (names of letters, digits, space, . _ -; at most 40).');
    if (token.length < 24) throw new Error(`ADMIN_TOKENS: the token for "${name}" must be at least 24 characters.`);
    if (out[name] !== undefined) throw new Error(`ADMIN_TOKENS names "${name}" twice.`);
    if (Object.values(out).includes(token)) throw new Error('ADMIN_TOKENS: every staff member needs their own token.');
    out[name] = token;
  }
  return out;
}

/** Postgres pool settings (re-audit): bounded, with timeouts so a stuck query or transaction cannot hold the pool. */
export interface PgPoolSettings {
  /** PG_POOL_MAX (default 10): connections per instance. Instances × this must stay under the database's max_connections. */
  max: number;
  /** PG_CONNECT_TIMEOUT_MS (default 5,000): wait at most this long for a connection (from the pool or a new one). */
  connectionTimeoutMillis: number;
  /** PG_IDLE_TIMEOUT_MS (default 30,000): close idle connections after this. */
  idleTimeoutMillis: number;
  /** PG_STATEMENT_TIMEOUT_MS (default 30,000; 0 = none): the database cancels a longer statement. Migrations run without it. */
  statement_timeout?: number;
  /** PG_IDLE_TX_TIMEOUT_MS (default 60,000; 0 = none): the database ends a transaction left idle this long, freeing its row locks. */
  idle_in_transaction_session_timeout?: number;
}

const int = (v: string | undefined, dflt: number, name: string): number => {
  if (v === undefined || v === '') return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a whole number (got "${v}").`);
  return n;
};

export function pgPoolSettings(env: Record<string, string | undefined>, opts: { migrations?: boolean } = {}): PgPoolSettings {
  const statement = opts.migrations ? 0 : int(env.PG_STATEMENT_TIMEOUT_MS, 30_000, 'PG_STATEMENT_TIMEOUT_MS');
  const idleTx = int(env.PG_IDLE_TX_TIMEOUT_MS, 60_000, 'PG_IDLE_TX_TIMEOUT_MS');
  return {
    max: Math.max(1, int(env.PG_POOL_MAX, 10, 'PG_POOL_MAX')),
    connectionTimeoutMillis: int(env.PG_CONNECT_TIMEOUT_MS, 5_000, 'PG_CONNECT_TIMEOUT_MS'),
    idleTimeoutMillis: int(env.PG_IDLE_TIMEOUT_MS, 30_000, 'PG_IDLE_TIMEOUT_MS'),
    ...(statement ? { statement_timeout: statement } : {}),
    ...(idleTx ? { idle_in_transaction_session_timeout: idleTx } : {}),
  };
}

/**
 * How the Postgres adapter writes (PgRepo `options`). VILLAGE_PARTS=1 (backend A17, migration 0039): write
 * server-held villages in parts, so a command batch rewrites only what it changed. Off by default: switch
 * it on once every instance runs a build that reads parts (this one and later), and switch it off again
 * (each village is then written whole at its next batch) before rolling back to an older build.
 */
export function pgOptions(env: Record<string, string | undefined>): { villageParts: boolean } {
  return { villageParts: env.VILLAGE_PARTS === '1' };
}

/** URL parameters that choose TLS; they are taken out of the URL and applied as `ssl` (pg would otherwise let the URL override it). */
const TLS_PARAMS = ['sslmode', 'ssl', 'sslrootcert', 'sslcert', 'sslkey', 'uselibpqcompat'];

/**
 * How the server talks TLS to Postgres (re-audit: `sslmode=require` used to
 * mean "encrypt, check nothing"):
 *
 * - PG_CA_CERT (the PEM itself, or a file path) or `sslrootcert=` in the URL:
 *   verify the server's certificate against that CA (and its host name,
 *   except with `sslmode=verify-ca`);
 * - `sslmode=verify-full` without a CA: verify against the system's CAs;
 * - `sslmode=require` / `prefer` / `no-verify` without a CA: encrypted but
 *   unverified only with PG_SSL_ALLOW_UNVERIFIED=1 (production then warns);
 *   otherwise `require` and `prefer` verify against the system's CAs and
 *   `no-verify` is refused in production;
 * - no sslmode and no CA: plain TCP (a private network or a local socket);
 *   `sslmode=disable` too.
 */
export function pgTls(
  url: string,
  env: Record<string, string | undefined>,
  read: (path: string) => string = (p) => readFileSync(p, 'utf8'),
): { connectionString: string; ssl: false | ConnectionOptions; verified: boolean; mode: string } {
  let u: URL | null = null;
  try {
    u = new URL(url);
  } catch {
    // A libpq key=value string or a socket path: left to pg as it is.
  }
  const p = u?.searchParams;
  const mode = (p?.get('sslmode') ?? (p?.get('ssl') === 'true' || p?.get('ssl') === '1' ? 'require' : p?.get('ssl') === 'no-verify' ? 'no-verify' : '')).toLowerCase();
  const pem = (v: string) => (v.includes('-----BEGIN') ? v : read(v));
  const caSource = env.PG_CA_CERT || p?.get('sslrootcert') || '';
  const ca = caSource ? pem(caSource) : undefined;
  const cert = p?.get('sslcert') ? read(p.get('sslcert')!) : undefined;
  const key = p?.get('sslkey') ? read(p.get('sslkey')!) : undefined;
  if (u) for (const k of TLS_PARAMS) u.searchParams.delete(k);
  const connectionString = u ? u.toString() : url;
  const client = { ...(cert ? { cert } : {}), ...(key ? { key } : {}) };
  if (mode === 'disable' || (!mode && !ca)) return { connectionString, ssl: false, verified: false, mode: mode || 'none' };
  if (ca) return { connectionString, ssl: { ...client, ca, rejectUnauthorized: true, ...(mode === 'verify-ca' ? { checkServerIdentity: () => undefined } : {}) }, verified: true, mode: mode || 'verify-full' };
  const unverifiedOk = env.PG_SSL_ALLOW_UNVERIFIED === '1';
  if (mode === 'verify-full' || mode === 'verify-ca' || !unverifiedOk) {
    // no-verify without the opt-in also lands here (verified): checkConfig refuses it in production.
    return { connectionString, ssl: { ...client, rejectUnauthorized: true }, verified: true, mode };
  }
  return { connectionString, ssl: { ...client, rejectUnauthorized: false }, verified: false, mode };
}

/** Problems that stop the server from starting (errors) or deserve a line in the log (warnings). */
export function checkConfig(env: Record<string, string | undefined>): { deploy: DeployEnv; errors: string[]; warnings: string[] } {
  const deploy = deployEnv(env);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (deploy === 'production') {
    if (!env.DATABASE_URL) errors.push('DATABASE_URL is required in production (memory storage loses every player on restart).');
    if (!env.ADMIN_TOKEN && !env.ADMIN_TOKENS) errors.push('ADMIN_TOKENS (or the legacy ADMIN_TOKEN) is required in production (account-deletion requests must be handled).');
    if (env.ADMIN_TOKEN && !env.ADMIN_TOKENS) warnings.push('ADMIN_TOKEN is one shared staff token: the staff log trusts the name each person types. Prefer ADMIN_TOKENS (name:token per staff member).');
    // Rate limits by IP need the real client address (re-audit): never "true" (a client could choose its IP), never left unset by accident.
    if (env.TRUST_PROXY === undefined || env.TRUST_PROXY === '') errors.push('TRUST_PROXY must be set in production: the number of proxies in front of the server (e.g. "1" behind one load balancer), their addresses/CIDRs, or "false" when players connect directly.');
    else if (env.TRUST_PROXY === 'true') errors.push('TRUST_PROXY=true trusts every X-Forwarded-For entry, so any client can pick its IP address and dodge the limits. Set the hop count (e.g. "1") or the proxies\' CIDRs instead.');
    if (env.DATABASE_URL) {
      try {
        const tls = pgTls(env.DATABASE_URL, env);
        if (tls.mode === 'no-verify' && env.PG_SSL_ALLOW_UNVERIFIED !== '1') errors.push('DATABASE_URL asks for an unverified TLS connection (no-verify). Set PG_CA_CERT to the provider\'s CA, use sslmode=verify-full, or set PG_SSL_ALLOW_UNVERIFIED=1 to accept it knowingly.');
        else if (tls.ssl && !tls.verified) warnings.push('PG_SSL_ALLOW_UNVERIFIED=1: the connection to Postgres is encrypted but its certificate is not checked. Set PG_CA_CERT when the provider publishes its CA.');
        else if (!tls.ssl) warnings.push('DATABASE_URL has no sslmode: the connection to Postgres is not encrypted (fine only on a private network).');
      } catch (e) {
        errors.push(`DATABASE_URL / PG_CA_CERT: ${(e as Error).message}`);
      }
    }
    if (!env.CORS_ORIGIN || list(env.CORS_ORIGIN).includes('*')) errors.push('CORS_ORIGIN must list the game\'s origins in production (the web address, capacitor://localhost, https://localhost), not "*".');
    if (env.APNS_SANDBOX === '1') errors.push('APNS_SANDBOX=1 is for development builds (staging), not production.');
    if (list(env.APPLE_ENVIRONMENTS).includes('Xcode')) errors.push('Xcode-signed purchases are for local testing, not production.');
    if (env.GOOGLE_PLAY_ALLOW_TEST === '1') warnings.push('GOOGLE_PLAY_ALLOW_TEST=1: license-tester purchases are credited in production.');
    if (env.MIGRATE_ON_BOOT === '1') warnings.push('MIGRATE_ON_BOOT=1 in production: run "npm run server:migrate" as a release step instead when there is more than one instance.');
    // Beast Mode SEC-17: Redis counts limits for every instance together, but memory fallback counters are per instance.
    if (env.REDIS_URL && !env.RATE_LIMIT_INSTANCES) warnings.push('REDIS_URL is set without RATE_LIMIT_INSTANCES: when Redis is unreachable each instance falls back to its own counters at the full limit. Set RATE_LIMIT_INSTANCES to the number of API instances.');
    // Beast Mode SEC-12 / ECO-07 (P4): with store checks on, Sandbox/TestFlight purchases need a server-wide daily cap
    // (an explicit 0 credits none); otherwise each fresh sandbox account gets the per-buyer test credit on production.
    if ((env.APPLE_BUNDLE_IDS || env.GAMECENTER_BUNDLE_IDS || env.GOOGLE_PLAY_PACKAGE) && (env.SANDBOX_CREDIT_DAILY_CAP_USD === undefined || env.SANDBOX_CREDIT_DAILY_CAP_USD.trim() === '')) errors.push('SANDBOX_CREDIT_DAILY_CAP_USD must be set in production when store purchases are checked (e.g. 50; 0 credits no Sandbox or TestFlight purchase at all). App Review buys in the Sandbox against production, so 0 makes its purchases fail.');
    // Beast Mode SEC-01: device-held villages are trusted in ranked play until this is on (owner decision D8).
    if (env.REQUIRE_SERVER_VILLAGE === undefined || env.REQUIRE_SERVER_VILLAGE === '') warnings.push('REQUIRE_SERVER_VILLAGE is not set: villages kept on the device take part in ranked play (honor, loot, wars, both leaderboards) on trust. Set it to 1 after a release where the game has moved villages to the server, or to 0 to accept this knowingly.');
    if (env.UPLOAD_ACCOUNT_AGE === '0') warnings.push('UPLOAD_ACCOUNT_AGE=0 in production: a new account can upload a Keep 15 base and be ranked and matched there at once. Keep it for staging contract runs only.');
    // Beast Mode ECO-06: without rates, App Store local prices count at the catalog USD (the under-18 cap and revenue).
    if ((env.APPLE_BUNDLE_IDS || env.GAMECENTER_BUNDLE_IDS) && !/"[A-Z]{3}"/.test((env.USD_RATES ?? '').replace(/"USD"/g, ''))) warnings.push('USD_RATES has no currency besides USD: App Store purchases in other currencies count at the catalog USD price for the under-18 cap and revenue. Set it monthly (docs/SHIPPING.md).');
    // Beast Mode SEC-03 (defence in depth): a sign-in token relayed through another server is refused only with nonces required.
    if (env.SIGNIN_NONCE_REQUIRED !== '1') warnings.push('SIGNIN_NONCE_REQUIRED is not 1: Apple and Google sign-ins without a nonce are still accepted. Set it once every supported build sends nonces (docs/SHIPPING.md 3h).');
    if (!env.SENTRY_DSN) warnings.push('SENTRY_DSN is not set: server errors are only in the log.');
    if (!env.METRICS_TOKEN) warnings.push('METRICS_TOKEN is not set: there is no /metrics for alerts.');
    else if (env.METRICS_TOKEN.length < 24) errors.push('METRICS_TOKEN must be at least 24 characters in production (it is guessed like a staff token).');
  }
  if (deploy !== 'production' && env.TRUST_PROXY === 'true') warnings.push('TRUST_PROXY=true lets any client pick its IP address; set the hop count (e.g. "1") instead.');
  for (const [name, check] of [
    ['TRUST_PROXY', () => parseTrustProxy(env.TRUST_PROXY)],
    ['ADMIN_TOKENS', () => parseAdminTokens(env.ADMIN_TOKENS)],
    ['ADMIN_ALLOW_IPS', () => parseCidrs(list(env.ADMIN_ALLOW_IPS))],
    ['PG_POOL_MAX / PG_*_TIMEOUT_MS', () => pgPoolSettings(env)],
  ] as const) {
    try {
      check();
    } catch (e) {
      errors.push(`${name}: ${(e as Error).message}`);
    }
  }
  if (deploy !== 'development' && !env.RELEASE) warnings.push('RELEASE is not set: /healthz and Sentry show the package version instead of the build.');
  if (env.SENTRY_ENVIRONMENT && env.SENTRY_ENVIRONMENT !== deploy) warnings.push(`SENTRY_ENVIRONMENT (${env.SENTRY_ENVIRONMENT}) differs from DEPLOY_ENV (${deploy}).`);
  return { deploy, errors, warnings };
}

/**
 * Beast Mode SEC-17: the security switches as one boot log line (values only; no secrets, no tokens, no URLs).
 */
export function securitySwitches(env: Record<string, string | undefined>): Record<string, string | number | boolean | null> {
  const p = { ...DEFAULT_POLICY_FOR_LOG, ...policyFromEnv(env) };
  return {
    deploy: deployEnv(env),
    requireServerVillage: p.requireServerVillage,
    signInNonceRequired: p.signInNonceRequired,
    sandboxDailyCapUsd: p.sandboxDailyCapUsd,
    lateReportRule: p.lateReportRule,
    uploadAccountAge: p.uploadAccountAge,
    under13Mode: p.under13Mode,
    rateLimitInstances: env.RATE_LIMIT_INSTANCES ? Number(env.RATE_LIMIT_INSTANCES) : 1,
    redis: Boolean(env.REDIS_URL),
    trustProxy: env.TRUST_PROXY ?? null,
    adminAllowIps: Boolean(env.ADMIN_ALLOW_IPS),
    metricsToken: Boolean(env.METRICS_TOKEN),
    sentry: Boolean(env.SENTRY_DSN),
  };
}

/**
 * The store receipt checkers this deployment is set up for.
 * Apple: APPLE_BUNDLE_IDS (default: GAMECENTER_BUNDLE_IDS), optional
 * APPLE_ROOT_CA_SHA256 and APPLE_ENVIRONMENTS (default Production,Sandbox:
 * App Review buys in the sandbox against the production server).
 * Google: GOOGLE_PLAY_PACKAGE + GOOGLE_SERVICE_ACCOUNT_JSON (+ GOOGLE_RTDN_AUDIENCE
 * and GOOGLE_RTDN_SERVICE_ACCOUNT for notifications); test purchases on staging,
 * or with GOOGLE_PLAY_ALLOW_TEST=1.
 */
export function paymentsFromEnv(env: Record<string, string | undefined>, fetch: Fetch, now: () => number): { apple: AppleVerifier | null; google: GoogleVerifier | null; testCreditCapUsd?: number } {
  const deploy = deployEnv(env);
  const bundles = list(env.APPLE_BUNDLE_IDS ?? env.GAMECENTER_BUNDLE_IDS);
  const apple = bundles.length ? new AppleVerifier({ bundleIds: bundles, rootFingerprints: list(env.APPLE_ROOT_CA_SHA256), environments: list(env.APPLE_ENVIRONMENTS), now }) : null;
  let google: GoogleVerifier | null = null;
  if (env.GOOGLE_PLAY_PACKAGE && env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    google = new GoogleVerifier({
      packageName: env.GOOGLE_PLAY_PACKAGE,
      account: JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as ServiceAccount,
      fetch,
      now,
      allowTest: deploy !== 'production' || env.GOOGLE_PLAY_ALLOW_TEST === '1',
      rtdn: env.GOOGLE_RTDN_AUDIENCE && env.GOOGLE_RTDN_SERVICE_ACCOUNT ? { audience: env.GOOGLE_RTDN_AUDIENCE, serviceAccount: env.GOOGLE_RTDN_SERVICE_ACCOUNT } : null,
    });
  }
  // Re-audit: Sandbox/test purchases cost nothing (TestFlight, licence testers). On production they are
  // credited (App Review buys in the sandbox) only up to SANDBOX_CREDIT_CAP_USD per player (default $10).
  const cap = Number(env.SANDBOX_CREDIT_CAP_USD ?? 10);
  return { apple, google, ...(deploy === 'production' ? { testCreditCapUsd: Number.isFinite(cap) && cap >= 0 ? cap : 10 } : {}) };
}

/**
 * Server policy knobs from the environment (backend batch 2026-11-13; `ServerPolicy` in core/context.ts).
 * Anything unset keeps `DEFAULT_POLICY`.
 */
export function policyFromEnv(env: Record<string, string | undefined>): Partial<import('./core/context').ServerPolicy> {
  const out: Partial<import('./core/context').ServerPolicy> = {};
  const n = (v: string | undefined) => (v !== undefined && v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : undefined);
  if (env.SIGNIN_NONCE_REQUIRED !== undefined) out.signInNonceRequired = env.SIGNIN_NONCE_REQUIRED === '1';
  if (n(env.SESSION_IDLE_DAYS)) out.sessionIdleDays = n(env.SESSION_IDLE_DAYS)!;
  if (n(env.DORMANT_ACCOUNT_DAYS) !== undefined) out.dormantAccountDays = n(env.DORMANT_ACCOUNT_DAYS)!;
  if (n(env.DORMANT_MAX_KEEP) !== undefined) out.dormantMaxKeep = n(env.DORMANT_MAX_KEEP)!;
  if (n(env.SANDBOX_CREDIT_DAILY_CAP_USD) !== undefined) out.sandboxDailyCapUsd = n(env.SANDBOX_CREDIT_DAILY_CAP_USD)!;
  // Compliance switches 2026-11-14 (net/compliance.ts): unset keeps the safest default.
  if (env.UNDER13_MODE !== undefined && env.UNDER13_MODE.trim() !== '') {
    const m = parseUnder13Mode(env.UNDER13_MODE);
    if (!m) throw new Error('UNDER13_MODE must be offline, limited or families.');
    out.under13Mode = m;
  }
  // Beast Mode OPS-09: kill switches (comma lists).
  if (env.PRODUCTS_OFF !== undefined) out.productsOff = env.PRODUCTS_OFF.split(',').map((x) => x.trim()).filter(Boolean);
  if (env.FEATURES_OFF !== undefined) out.featuresOff = env.FEATURES_OFF.split(',').map((x) => x.trim()).filter(Boolean);
  if (env.LATE_REPORT_RULE !== undefined) out.lateReportRule = env.LATE_REPORT_RULE === '1';
  if (env.UPLOAD_ACCOUNT_AGE !== undefined && env.UPLOAD_ACCOUNT_AGE !== '') out.uploadAccountAge = env.UPLOAD_ACCOUNT_AGE !== '0';
  if (env.REQUIRE_SERVER_VILLAGE !== undefined) out.requireServerVillage = env.REQUIRE_SERVER_VILLAGE === '1';
  if (env.EU_JADE_VALUE !== undefined) out.euJadeValue = env.EU_JADE_VALUE === '1';
  if (env.APPLE_CONSUMPTION_RESPONSE !== undefined) out.appleConsumptionResponse = env.APPLE_CONSUMPTION_RESPONSE === '1';
  if (env.SIGNIFICANT_UPDATE_BUILD !== undefined && env.SIGNIFICANT_UPDATE_BUILD.trim() !== '') {
    const b = env.SIGNIFICANT_UPDATE_BUILD.trim();
    if (!/^\d+(\.\d+){0,3}$/.test(b)) throw new Error('SIGNIFICANT_UPDATE_BUILD must be a build number like 1.4.0.');
    out.significantUpdateBuild = b;
  }
  if (env.USD_RATES) {
    let raw: Record<string, unknown>;
    try {
      raw = JSON.parse(env.USD_RATES) as Record<string, unknown>;
    } catch {
      throw new Error('USD_RATES must be JSON like {"EUR":1.08,"INR":0.012}.');
    }
    out.usdRates = { USD: 1, ...Object.fromEntries(Object.entries(raw).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && typeof v === 'number' && v > 0 && Number.isFinite(v))) } as Record<string, number>;
  }
  return out;
}
