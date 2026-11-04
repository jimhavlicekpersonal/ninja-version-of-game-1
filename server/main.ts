/**
 * Server entry point. Env:
 * - PORT; DATABASE_URL (Postgres; memory if unset);
 * - CORS_ORIGIN: '*' or a comma-separated list of origins;
 * - MIGRATE_ON_BOOT=1: single-instance hosts only, apply pending migrations on
 *   start instead of in a release step;
 * - TRUST_PROXY: behind a load balancer (Render, Fly.io, Railway, …) set
 *   'true' (or a hop count, or the proxy addresses) so rate limits see each
 *   player's IP instead of the proxy's;
 * - RATE_LIMITS: optional JSON overriding rules of DEFAULT_RATE_LIMITS, e.g.
 *   {"register":{"limit":200,"windowMs":3600000}} on a staging server.
 * - ADMIN_TOKEN: a long random secret that turns on the staff API
 *   (/admin/v1/…: deletion requests, moderation queue). Unset: no staff API.
 * - REDIS_URL: redis:// or rediss:// (Upstash). Shares the leaderboard, match
 *   locks and rate-limit counters between instances. Unset: the database
 *   holds the leaderboard and locks, and each instance counts its own limits.
 * - SENTRY_DSN (+ SENTRY_ENVIRONMENT, default 'production'): server errors to Sentry.
 * - METRICS_TOKEN: serve Prometheus metrics at /metrics to this bearer token.
 * - LOG_LEVEL: debug | info (default) | warn | error.
 * - RELEASE: the build name shown by /healthz and Sentry (default: package version).
 * - SERVER_NOTICE: a message shown to every player in Settings (maintenance, an incident).
 * - HOST: the address to listen on (default '::', IPv6 and IPv4).
 * - DEPLOY_ENV: development (default) | staging | production (server/config.ts:
 *   what production requires; a database belongs to one deployment).
 * - Purchases (roadmap Phase 4, server/config.ts): APPLE_BUNDLE_IDS,
 *   APPLE_ROOT_CA_SHA256, APPLE_ENVIRONMENTS; GOOGLE_PLAY_PACKAGE,
 *   GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_RTDN_AUDIENCE, GOOGLE_RTDN_SERVICE_ACCOUNT.
 * - Push (step 40, server/push/push.ts): APNS_KEY, APNS_KEY_ID, APNS_TEAM_ID,
 *   APNS_TOPIC, APNS_SANDBOX; FCM_PROJECT_ID, FCM_SERVICE_ACCOUNT_JSON.
 * - Game versions (roadmap steps 73, 75; docs/SHIPPING.md "Releasing a balance
 *   change"): RETIRED_RULES ("1,2": archived battle-rule versions no longer
 *   accepted) and MIN_CLIENT_BUILD ("1.2.0": older games are asked to update).
 * - Balance bundles (step 76, docs/SHIPPING.md 3j): BALANCE_BUNDLE_FILE (a
 *   signed bundle made by tools/balance/bundle.mjs) and BALANCE_PUBLIC_KEY (the
 *   key games check it with). The server refuses to start with a bundle that
 *   does not check out.
 */
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { defaultData } from '../src/gameplay/sim/data';
import { buildServer } from './app';
import type { SharedStores } from './nodeContext';
import { PgRepo } from './pgRepo';
import { DEFAULT_RATE_LIMITS, type RateLimiter, type RateLimits } from './rateLimit';
import { RedisClient } from './redis';
import { MemoryRepo, type Repo } from './repo';
import { RedisLeaderboard, RedisLocks, RedisRateLimiter } from './shared';
import { PromMetrics, ServerSentry } from './observability';
import { ARCHIVED_ENGINES } from './rules/archive';
import { liveEngine, parseRetired, RulesRegistry } from './rules/registry';
import { readFileSync } from 'node:fs';
import { patchedData, verifyBundle, type BalanceBundle } from '../src/backend/net/balanceBundle';
import { SIM_RULES } from '../src/gameplay/sim/battle/battle';
import type { GameData } from '../src/gameplay/sim/types';
import { verifierFromEnv } from './identity/verify';
import { checkConfig, paymentsFromEnv } from './config';
import { pushTransportFromEnv, ServerPush } from './push/push';
import type { Fetch } from './payments/google';

declare const __APP_VERSION__: string;

function trustProxy(v: string | undefined): boolean | number | string {
  if (!v || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}

const release = process.env.RELEASE || `kagemura-server@${__APP_VERSION__}`;
const sentry = ServerSentry.fromDsn(process.env.SENTRY_DSN, release, process.env.SENTRY_ENVIRONMENT || 'production');
// Crashes outside a request still reach Sentry (and the log) before the process exits.
process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection', e);
  sentry?.capture(e, { level: 'error', tags: { kind: 'unhandledRejection' } });
});
process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e);
  sentry?.capture(e, { level: 'fatal', tags: { kind: 'uncaughtException' } });
  setTimeout(() => process.exit(1), 1000).unref();
});

async function main(): Promise<void> {
  const config = checkConfig(process.env);
  for (const w of config.warnings) console.warn(w);
  if (config.errors.length) {
    for (const e of config.errors) console.error(e);
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  let repo: Repo;
  if (url) {
    const pg = PgRepo.fromUrl(url);
    // Migrations are a release step (npm run server:migrate), not part of every boot.
    const status = await pg.migrationStatus();
    if (status.unknown.length) console.warn(`The database has migrations this server does not know (${status.unknown.join(', ')}): it is newer than this build.`);
    if (status.pending.length) {
      if (process.env.MIGRATE_ON_BOOT === '1') {
        await pg.migrate((m) => console.log(m));
      } else {
        console.error(`The database needs migrations ${status.pending.map((m) => m.name).join(', ')}. Run "npm run server:migrate" as the release step before starting the server (or set MIGRATE_ON_BOOT=1 on a single-instance host).`);
        process.exit(1);
      }
    }
    // One database, one deployment: staging never writes to production's data (step 42).
    const owner = await pg.claimEnvironment(config.deploy);
    if (owner !== config.deploy) {
      console.error(`This database belongs to the ${owner} deployment; this server is ${config.deploy}. Check DATABASE_URL.`);
      process.exit(1);
    }
    repo = pg;
  } else {
    console.warn('DATABASE_URL not set: using in-memory storage (data is lost on restart).');
    repo = new MemoryRepo();
  }
  const rateLimits = process.env.RATE_LIMITS ? (JSON.parse(process.env.RATE_LIMITS) as Partial<RateLimits>) : undefined;
  let shared: SharedStores | undefined;
  let rateLimiter: RateLimiter | undefined;
  const readiness: Record<string, () => Promise<unknown>> = {};
  if (process.env.REDIS_URL) {
    const redis = RedisClient.fromUrl(process.env.REDIS_URL);
    readiness.redis = () => redis.command('PING');
    const board = new RedisLeaderboard(redis);
    const added = await board.rebuildIfMissing(repo);
    if (added) console.log(`Leaderboard rebuilt in Redis from the database (${added} players).`);
    shared = { board, locks: new RedisLocks(redis) };
    rateLimiter = new RedisRateLimiter(redis, { ...DEFAULT_RATE_LIMITS, ...rateLimits });
  }
  // Account linking: whichever sign-in providers are configured (APPLE_CLIENT_IDS, GOOGLE_CLIENT_IDS, GAMECENTER_BUNDLE_IDS, PLAYGAMES_CLIENT_ID/SECRET).
  shared = { ...shared, identity: verifierFromEnv(process.env) };
  // Store receipts (Phase 4) and server push (step 40): whichever keys are configured.
  const fetchFn = globalThis.fetch as unknown as Fetch;
  const metrics = new PromMetrics();
  // Gauges for alerts (step 47): database pool and event-loop delay.
  if (repo instanceof PgRepo) {
    const pgRepo = repo;
    metrics.gauge('tk_db_pool_connections', () => Object.entries(pgRepo.poolStats()).map(([state, value]) => ({ labels: { state }, value })));
  }
  const loop = monitorEventLoopDelay({ resolution: 20 });
  loop.enable();
  metrics.gauge('tk_event_loop_delay_ms', () => {
    const points = [0.5, 0.99, 1].map((q) => ({ labels: { quantile: String(q) }, value: Math.round((q === 1 ? loop.max : loop.percentile(q * 100)) / 1e6) }));
    loop.reset();
    return points;
  });
  const payments = paymentsFromEnv(process.env, fetchFn, Date.now);
  const transport = pushTransportFromEnv(process.env, fetchFn, Date.now);
  const push = transport ? new ServerPush({ repo, data: defaultData, transport, now: Date.now, metrics, log: (l, m, f) => console[l === 'info' ? 'log' : l](m, f ?? {}) }) : undefined;
  // Balance bundle (step 76): its numbers become the live data; a bad bundle stops the start.
  let data: GameData = defaultData;
  let balance: BalanceBundle | null = null;
  if (process.env.BALANCE_BUNDLE_FILE) {
    const b = JSON.parse(readFileSync(process.env.BALANCE_BUNDLE_FILE, 'utf8')) as BalanceBundle;
    if (!(await verifyBundle(b, process.env.BALANCE_PUBLIC_KEY ?? ''))) throw new Error('BALANCE_BUNDLE_FILE is not signed by BALANCE_PUBLIC_KEY.');
    const p = patchedData(defaultData, b, SIM_RULES);
    if ('error' in p) throw new Error(`BALANCE_BUNDLE_FILE refused: ${p.error}.`);
    data = p.data;
    balance = b;
    console.log(`Balance bundle ${b.id}: ${b.changes.length} changes (data ${b.dataVersion}).`);
  }
  // Battle rules (step 73): today's, plus archived versions still in use by older games.
  const rules = new RulesRegistry(liveEngine(data), { archived: ARCHIVED_ENGINES.map((e) => e()), retired: parseRetired(process.env.RETIRED_RULES), minClientBuild: process.env.MIN_CLIENT_BUILD });
  shared = { ...shared, payments, push, rules, balance };
  console.log(`Deployment: ${config.deploy}. Purchases: ${[payments.apple && 'App Store', payments.google && 'Google Play'].filter(Boolean).join(', ') || 'none'}. Push: ${transport ? transport.platforms.join(', ') : 'none'}. Battle rules: ${rules.supportedRules().join(', ')}${rules.minClientBuild ? `; games from ${rules.minClientBuild}` : ''}.`);
  const level = (['debug', 'info', 'warn', 'error'] as const).find((l) => l === process.env.LOG_LEVEL) ?? 'info';
  const app = buildServer({
    repo,
    data,
    corsOrigin: process.env.CORS_ORIGIN,
    logger: level,
    trustProxy: trustProxy(process.env.TRUST_PROXY),
    rateLimits,
    rateLimiter,
    shared,
    adminToken: process.env.ADMIN_TOKEN || undefined,
    metricsToken: process.env.METRICS_TOKEN || undefined,
    sentry,
    version: release,
    readiness,
    metrics,
    environment: config.deploy === 'production' ? undefined : config.deploy,
    notice: process.env.SERVER_NOTICE?.slice(0, 300) || undefined,
  });
  const port = Number(process.env.PORT ?? 8787);
  // '::' takes IPv6 and IPv4 (step 45); a machine without IPv6 falls back to IPv4 only.
  try {
    await app.listen({ port, host: process.env.HOST || '::' });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (process.env.HOST || (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL')) throw e;
    console.warn('IPv6 is not available here: listening on IPv4 only.');
    await app.listen({ port, host: '0.0.0.0' });
  }
  // Retention (30-day replays): hourly, starting at a random minute so instances spread out.
  const prune = () =>
    app.core.prune().then(
      (r) => app.log.info({ pruned: r }, 'retention'),
      (e) => app.log.error(e, 'retention failed'),
    );
  // Google's Voided Purchases API (refunds that a notification missed): the last 3 days, hourly.
  const voided = () =>
    app.core.pollVoided(Date.now() - 3 * 86_400_000).then(
      (n) => n && app.log.info({ revoked: n }, 'voided purchases'),
      (e) => app.log.error(e, 'voided purchases failed'),
    );
  setTimeout(() => {
    void prune();
    void voided();
    setInterval(() => {
      void prune();
      void voided();
    }, 3_600_000).unref();
  }, Math.floor(Math.random() * 3_600_000)).unref();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
