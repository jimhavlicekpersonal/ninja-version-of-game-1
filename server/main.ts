/**
 * Server entry point. Env:
 * - PORT; DATABASE_URL (Postgres; memory if unset);
 * - CORS_ORIGIN: '*' or a comma-separated list of origins;
 * - MIGRATE_ON_BOOT=1: single-instance hosts only, apply pending migrations on
 *   start instead of in a release step;
 * - TRUST_PROXY: how many proxies stand in front of the server ('1' behind
 *   one load balancer: Render, Fly.io, Railway, …), or their addresses/CIDRs,
 *   so rate limits see each player's IP instead of the proxy's; 'false' when
 *   players connect directly. Production requires it and refuses 'true'
 *   (which lets a client choose its IP through X-Forwarded-For);
 * - RATE_LIMIT_INSTANCES: how many API instances run (default 1). Limits counted on one instance
 *   (no REDIS_URL, or the fallback while Redis is down) are divided by it (backend A8). Keep it at the
 *   usual instance count; autoscaling above it loosens limits only while Redis is down.
 * - RATE_LIMITS: optional JSON overriding rules of DEFAULT_RATE_LIMITS, e.g.
 *   {"register":{"limit":200,"windowMs":3600000}} on a staging server.
 * - ADMIN_TOKENS: per-staff tokens "name:token,name2:token2" (each token at
 *   least 24 characters) that turn on the staff API (/admin/v1/…: deletion
 *   requests, moderation queue, player tools); the staff log names the token's
 *   holder. ADMIN_TOKEN: the legacy single shared token (actor from
 *   x-staff-name). ADMIN_ALLOW_IPS: optional addresses/CIDRs that alone may
 *   reach /admin…. None set: no staff API.
 * - Postgres (server/config.ts): PG_POOL_MAX (10), PG_CONNECT_TIMEOUT_MS
 *   (5000), PG_IDLE_TIMEOUT_MS (30000), PG_STATEMENT_TIMEOUT_MS (30000),
 *   PG_IDLE_TX_TIMEOUT_MS (60000); TLS: PG_CA_CERT (PEM or file) verifies the
 *   server, sslmode=verify-full verifies against system CAs,
 *   PG_SSL_ALLOW_UNVERIFIED=1 accepts sslmode=require without verification.
 * - REDIS_URL: redis:// or rediss:// (Upstash). Shares the leaderboard, match
 *   locks and rate-limit counters between instances. Unset: the database
 *   holds the leaderboard and locks, and each instance counts its own limits.
 *   While Redis is down the instance degrades (each instance counts its own
 *   limits, the database answers) and stays ready; REDIS_REQUIRED=1 makes
 *   /readyz fail instead. REDIS_TIMEOUT_MS (500): per-command timeout.
 * - SENTRY_DSN (+ SENTRY_ENVIRONMENT, default 'production'): server errors to Sentry.
 * - METRICS_TOKEN: serve Prometheus metrics at /metrics to this bearer token.
 * - LOG_LEVEL: debug | info (default) | warn | error.
 * - RELEASE: the build name shown by /healthz and Sentry (default: package version).
 * - SERVER_NOTICE: a message shown to every player in Settings (maintenance, an incident).
 * - SUPPORT_CONTACT: where players appeal moderation decisions (an email address or URL),
 *   named in moderation notices (re-audit, EU DSA art. 17).
 * - Sign in with Apple token revocation (re-audit, App Review 5.1.1(v)): APPLE_TEAM_ID,
 *   APPLE_KEY_ID, APPLE_PRIVATE_KEY (the .p8 PEM) with APPLE_CLIENT_IDS. Unset: refresh
 *   tokens are neither fetched nor revoked (logged).
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
 * - RESIM_WORKERS: re-simulation worker threads (step 57; default: CPU cores - 1,
 *   at least 1; 0 runs battles on the main thread). RESIM_QUEUE (default 200)
 *   battles may wait; more get 503 busy (the game retries).
 * - Event schedule (growth batch 2026-11-14): EVENT_SCHEDULE_FILE, an `EventSchedule`
 *   (src/backend/net/eventSchedule.ts) retiming the built-in events; refused at start if invalid.
 * - Balance bundles (step 76, docs/SHIPPING.md 3j): BALANCE_BUNDLE_FILE (a
 *   signed bundle made by tools/balance/bundle.mjs) and BALANCE_PUBLIC_KEY (the
 *   key games check it with). The server refuses to start with a bundle that
 *   does not check out. The file may hold a list instead: everyone's bundle
 *   plus experiment arms (`cohort`, report section 5 step 5), which may change
 *   only offer timing (`checkCohort`); each game picks its arm itself.
 * - Shutdown (server/shutdown.ts): on SIGTERM or SIGINT, /readyz answers 503
 *   for SHUTDOWN_DRAIN_MS (5000; match the load balancer's check interval),
 *   then requests in flight finish and the workers, Redis and the database
 *   close; SHUTDOWN_DEADLINE_MS (25000) later the process exits regardless.
 *   Keep the host's kill timeout above the deadline.
 * - Outbound calls (Google Play, FCM, sign-in key sets, Play Games) give up
 *   after OUTBOUND_TIMEOUT_MS (10000), body included (server/outbound.ts).
 * - Periodic jobs (retention, voided purchases, Gang War reminders) run on one
 *   instance at a time, through leases in the database (server/jobs.ts).
 * - Policy (backend batch 2026-11-13, server/config.ts policyFromEnv): SIGNIN_NONCE_REQUIRED=1
 *   (Apple/Google sign-ins must carry a server nonce; off by default so older games sign in),
 *   SESSION_IDLE_DAYS (400: another device's token unused this long is signed out),
 *   DORMANT_ACCOUNT_DAYS (730; 0 = off) and DORMANT_MAX_KEEP (3): anonymous accounts never seen for
 *   that long, with no purchase, link or staff role and no server-held village above that Keep, are
 *   deleted; SANDBOX_CREDIT_DAILY_CAP_USD (production: Sandbox/test purchases credited per day on the
 *   whole server); USD_RATES (JSON, USD per unit of a currency: local store prices count against the
 *   under-18 cap and in revenue reports); GAMECENTER_CA_PEM (the CA that must sign Game Center keys).
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { runLeased, type StillHeld } from './jobs';
import { OUTBOUND_TIMEOUT_MS, timedFetch } from './outbound';
import { gracefulShutdown, SHUTDOWN_DEADLINE_MS, SHUTDOWN_DRAIN_MS } from './shutdown';
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { WorkerResimulator, type Resimulator } from './resim/resim';
import { defaultData } from '../src/gameplay/sim/data';
import { buildServer } from './app';
import type { SharedStores } from './nodeContext';
import { PgRepo } from './pgRepo';
import { DEFAULT_RESIM_QUEUE } from './resim/resim';
import { DEFAULT_RATE_LIMITS, MemoryRateLimiter, shareOf, type RateLimiter, type RateLimits } from './rateLimit';
import { RedisClient } from './redis';
import { MemoryRepo, type Repo } from './repo';
import { RedisLeaderboard, RedisLocks, RedisRateLimiter, redisErrorReporter } from './shared';
import { PromMetrics, ServerSentry } from './observability';
import { ARCHIVED_ENGINES } from './rules/archive';
import { liveEngine, parseRetired, RulesRegistry } from './rules/registry';
import { readFileSync } from 'node:fs';
import { checkCohort, patchedData, verifyBundle, type BalanceBundle } from '../src/backend/net/balanceBundle';
import { applyEventSchedule, checkEventSchedule, type EventSchedule } from '../src/backend/net/eventSchedule';
import { SIM_RULES } from '../src/gameplay/sim/battle/battle';
import type { GameData } from '../src/gameplay/sim/types';
import { verifierFromEnv } from './identity/verify';
import { accountFromEnv } from './identity/appleTokens';
import { checkConfig, paymentsFromEnv, parseAdminTokens, parseTrustProxy, pgPoolSettings, policyFromEnv } from './config';
import { pushTransportFromEnv, ServerPush } from './push/push';
import type { Fetch } from './payments/google';

declare const __APP_VERSION__: string;

const release = process.env.RELEASE || `kagemura-server@${__APP_VERSION__}`;
const sentry = ServerSentry.fromDsn(process.env.SENTRY_DSN, release, process.env.SENTRY_ENVIRONMENT || 'production');
// Server tuning (quality Q20): named once, unchanged values.
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
/** A crash report gets this long to leave before the process exits. */
const CRASH_EXIT_DELAY_MS = 1000;
/** PORT when unset. */
const DEFAULT_PORT = 8787;
/** SERVER_NOTICE is cut to this many characters. */
const SERVER_NOTICE_MAX = 300;
/** Gang War pushes (battle day begins, 2 hours left) are checked this often. */
const GANG_WAR_REMINDERS_EVERY_MS = 5 * 60_000;
/** Google's Voided Purchases API is asked for this far back each hour (refunds a notification missed). */
const VOIDED_LOOKBACK_MS = 3 * DAY_MS;

// Crashes outside a request still reach Sentry (and the log) before the process exits.
process.on('unhandledRejection', (e) => {
  console.error('Unhandled rejection', e);
  sentry?.capture(e, { level: 'error', tags: { kind: 'unhandledRejection' } });
});
process.on('uncaughtException', (e) => {
  console.error('Uncaught exception', e);
  sentry?.capture(e, { level: 'fatal', tags: { kind: 'uncaughtException' } });
  setTimeout(() => process.exit(1), CRASH_EXIT_DELAY_MS).unref();
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
    const pg = PgRepo.fromUrl(url, pgPoolSettings(process.env));
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
  // Backend A8: how many API instances run behind the load balancer (default 1). Limits counted per
  // instance (no Redis, or while Redis is down) are divided by it, so N instances do not allow N times as much.
  const instances = Math.max(1, Math.floor(Number(process.env.RATE_LIMIT_INSTANCES)) || 1);
  const rateLimits = process.env.RATE_LIMITS ? (JSON.parse(process.env.RATE_LIMITS) as Partial<RateLimits>) : undefined;
  let shared: SharedStores | undefined;
  let rateLimiter: RateLimiter | undefined;
  const readiness: Record<string, () => Promise<unknown>> = {};
  const metrics = new PromMetrics();
  let redis: RedisClient | undefined;
  // Report section 5 step 2 (A9): a stopping instance says so before it stops accepting.
  let draining = false;
  readiness.draining = async () => {
    if (draining) throw new Error('shutting down');
  };
  if (process.env.REDIS_URL) {
    redis = RedisClient.fromUrl(process.env.REDIS_URL, process.env.REDIS_TIMEOUT_MS ? { timeoutMs: Number(process.env.REDIS_TIMEOUT_MS) } : {});
    // An instance without Redis still serves (degraded), so it stays ready unless REDIS_REQUIRED=1.
    if (process.env.REDIS_REQUIRED === '1') readiness.redis = () => redis!.command('PING');
    metrics.gauge('tk_redis_up', () => [{ labels: {}, value: redis!.available ? 1 : 0 }]);
    const onError = redisErrorReporter(metrics, (msg, fields) => console.warn(msg, fields));
    const board = new RedisLeaderboard(redis, undefined, { repo, onError });
    try {
      const added = await board.rebuildIfMissing(repo);
      if (added) console.log(`Leaderboard rebuilt in Redis from the database (${added} players).`);
    } catch (e) {
      console.warn('Redis is not reachable at start: the database serves the leaderboard until it is.', (e as Error).message);
      board.markStale();
    }
    shared = { board, locks: new RedisLocks(redis, undefined, onError) };
    // Backend A8: while Redis is down each instance counts on its own, so its share is the limit / instances.
    rateLimiter = new RedisRateLimiter(redis, { ...DEFAULT_RATE_LIMITS, ...rateLimits }, undefined, onError, new MemoryRateLimiter(shareOf({ ...DEFAULT_RATE_LIMITS, ...rateLimits }, instances)));
  } else if (instances > 1) {
    // Several instances without Redis: each counts its share.
    rateLimiter = new MemoryRateLimiter(shareOf({ ...DEFAULT_RATE_LIMITS, ...rateLimits }, instances));
  }
  // Every outbound call has a deadline, body included (report section 5 step 2, A10).
  const timed = timedFetch(globalThis.fetch, Number(process.env.OUTBOUND_TIMEOUT_MS) || OUTBOUND_TIMEOUT_MS);
  const fetchFn = timed as unknown as Fetch;
  // Account linking: whichever sign-in providers are configured (APPLE_CLIENT_IDS, GOOGLE_CLIENT_IDS, GAMECENTER_BUNDLE_IDS, PLAYGAMES_CLIENT_ID/SECRET).
  shared = { ...shared, identity: verifierFromEnv(process.env, timed as unknown as Parameters<typeof verifierFromEnv>[1]), account: accountFromEnv(process.env, undefined, undefined, (lvl, msg, fields) => console[lvl === 'info' ? 'log' : lvl](msg, fields ?? '')) };
  // Store receipts (Phase 4) and server push (step 40): whichever keys are configured.
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
  let balanceCohorts: BalanceBundle[] = [];
  if (process.env.BALANCE_BUNDLE_FILE) {
    // One bundle, or a list: at most one without a cohort (everyone's) plus experiment arms (report section 5 step 5).
    const raw = JSON.parse(readFileSync(process.env.BALANCE_BUNDLE_FILE, 'utf8')) as BalanceBundle | BalanceBundle[];
    const all = Array.isArray(raw) ? raw : [raw];
    for (const b of all) {
      if (!(await verifyBundle(b, process.env.BALANCE_PUBLIC_KEY ?? ''))) throw new Error(`BALANCE_BUNDLE_FILE: ${b?.id ?? 'a bundle'} is not signed by BALANCE_PUBLIC_KEY.`);
      const p = patchedData(defaultData, b, SIM_RULES);
      if ('error' in p) throw new Error(`BALANCE_BUNDLE_FILE refused ${b.id}: ${p.error}.`);
    }
    const mains = all.filter((b) => !b.cohort);
    if (mains.length > 1) throw new Error('BALANCE_BUNDLE_FILE: more than one bundle without a cohort.');
    balance = mains[0] ?? null;
    balanceCohorts = all.filter((b) => b.cohort);
    for (const b of balanceCohorts) {
      const why = checkCohort(b, balance);
      if (why) throw new Error(`BALANCE_BUNDLE_FILE refused arm ${b.id}: ${why}.`);
    }
    // The server plays everyone's numbers: arms change only what the device alone reads (offer timing).
    if (balance) {
      data = (patchedData(defaultData, balance, SIM_RULES) as { data: GameData }).data;
      console.log(`Balance bundle ${balance.id}: ${balance.changes.length} changes (data ${balance.dataVersion}).`);
    }
    for (const b of balanceCohorts) console.log(`Experiment arm ${b.id}: ${b.cohort!.experiment}:${b.cohort!.arm}, buckets ${b.cohort!.from}-${b.cohort!.to - 1}.`);
  }
  // Growth batch 2026-11-14 (retention audit G10): the operators' event timing, played by the server and sent in
  // /v1/hello; built-in events only, so a bad file stops the start like a bad balance bundle.
  let eventSchedule: EventSchedule | null = null;
  if (process.env.EVENT_SCHEDULE_FILE) {
    const s = checkEventSchedule(JSON.parse(readFileSync(process.env.EVENT_SCHEDULE_FILE, 'utf8')), data.events);
    if ('error' in s) throw new Error(`EVENT_SCHEDULE_FILE refused: ${s.error}.`);
    eventSchedule = s;
    data = { ...data, events: applyEventSchedule(data.events, s) };
    console.log(`Event schedule ${s.id}: ${s.entries.length} events every ${s.periodDays} days.`);
  }
  // Battle rules (step 73): today's, plus archived versions still in use by older games.
  const rules = new RulesRegistry(liveEngine(data), { archived: ARCHIVED_ENGINES.map((e) => e()), retired: parseRetired(process.env.RETIRED_RULES), minClientBuild: process.env.MIN_CLIENT_BUILD });
  // Re-simulation off the main thread (step 57): the same engines in each worker.
  const workers = process.env.RESIM_WORKERS !== undefined ? Math.max(0, Number(process.env.RESIM_WORKERS) || 0) : Math.max(1, availableParallelism() - 1);
  let resim: Resimulator | undefined;
  if (workers > 0) {
    const pool = new WorkerResimulator({
      size: workers,
      maxQueue: Number(process.env.RESIM_QUEUE) || DEFAULT_RESIM_QUEUE,
      spawn: () => new Worker(new URL('./resimWorker.js', import.meta.url), { workerData: { data } }) as never,
      log: (lvl, msg, f) => console[lvl](msg, f ?? {}),
    });
    metrics.gauge('tk_resim_queue', () => [{ labels: {}, value: pool.queued }]);
    resim = pool;
  }
  shared = { ...shared, payments, push, rules, balance, balanceCohorts, eventSchedule, resim, policy: policyFromEnv(process.env) };
  console.log(`Deployment: ${config.deploy}. Purchases: ${[payments.apple && 'App Store', payments.google && 'Google Play'].filter(Boolean).join(', ') || 'none'}. Push: ${transport ? transport.platforms.join(', ') : 'none'}. Re-simulation workers: ${workers || 'none (main thread)'}. Battle rules: ${rules.supportedRules().join(', ')}${rules.minClientBuild ? `; games from ${rules.minClientBuild}` : ''}.`);
  const level = (['debug', 'info', 'warn', 'error'] as const).find((l) => l === process.env.LOG_LEVEL) ?? 'info';
  const app = buildServer({
    repo,
    data,
    corsOrigin: process.env.CORS_ORIGIN,
    logger: level,
    trustProxy: parseTrustProxy(process.env.TRUST_PROXY),
    rateLimits,
    rateLimiter,
    shared,
    adminToken: process.env.ADMIN_TOKEN || undefined,
    adminTokens: process.env.ADMIN_TOKENS ? parseAdminTokens(process.env.ADMIN_TOKENS) : undefined,
    adminAllowIps: process.env.ADMIN_ALLOW_IPS ? process.env.ADMIN_ALLOW_IPS.split(',').map((x) => x.trim()).filter(Boolean) : undefined,
    metricsToken: process.env.METRICS_TOKEN || undefined,
    sentry,
    version: release,
    readiness,
    metrics,
    environment: config.deploy === 'production' ? undefined : config.deploy,
    notice: process.env.SERVER_NOTICE?.slice(0, SERVER_NOTICE_MAX) || undefined,
  });
  const port = Number(process.env.PORT ?? DEFAULT_PORT);
  // '::' takes IPv6 and IPv4 (step 45); a machine without IPv6 falls back to IPv4 only.
  try {
    await app.listen({ port, host: process.env.HOST || '::' });
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    if (process.env.HOST || (code !== 'EAFNOSUPPORT' && code !== 'EADDRNOTAVAIL')) throw e;
    console.warn('IPv6 is not available here: listening on IPv4 only.');
    await app.listen({ port, host: '0.0.0.0' });
  }
  // Unique names (step 59): players from before it get their name key once (idempotent; safe on every instance).
  void app.core.migrateNames().then(
    (n) => n && app.log.info({ named: n }, 'name migration'),
    (e) => app.log.error(e, 'name migration failed'),
  );
  // Periodic jobs run on one instance at a time (report section 5 step 2, A21): each run claims its lease first.
  const holder = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  const timers: ReturnType<typeof setInterval>[] = [];
  const job = (name: string, everyMs: number, run: (stillHeld: StillHeld) => Promise<unknown>) => () =>
    void runLeased(repo, holder, Date.now(), name, everyMs, run).catch((e) => app.log.error(e, `${name} failed`));
  // Retention (30-day replays): hourly, starting at a random minute so instances spread out.
  const prune = job('retention', HOUR_MS, (held) => app.core.prune(held).then((r) => app.log.info({ pruned: r }, 'retention')));
  // Dormant anonymous accounts (backend A23; DORMANT_ACCOUNT_DAYS, 0 = off): daily, a batch per run.
  const dormant = job('dormant-accounts', DAY_MS, (held) => app.core.pruneDormant(held).then((n) => n && app.log.info({ deleted: n }, 'dormant accounts')));
  // Gang War pushes (step 68): battle day begins, 2 hours left. Every 5 minutes; each sent once per war.
  const reminders = job('gang-war-reminders', GANG_WAR_REMINDERS_EVERY_MS, (held) => app.core.gangWarReminders(held));
  timers.push(setInterval(reminders, GANG_WAR_REMINDERS_EVERY_MS));
  // Google's Voided Purchases API (refunds that a notification missed): the last 3 days, hourly.
  const voided = job('voided-purchases', HOUR_MS, () => app.core.pollVoided(Date.now() - VOIDED_LOOKBACK_MS).then((n) => n && app.log.info({ revoked: n }, 'voided purchases')));
  // Shared play statistics (report section 5 step 5): the D1/D7/D30 and funnel table for the last 40 install days.
  const statsRollup = job('stats-rollup', HOUR_MS, () => app.core.rollupStats().then((r) => app.log.info({ stats: r }, 'stats rollup')));
  const firstHourly = setTimeout(() => {
    prune();
    voided();
    statsRollup();
    dormant();
    const hourly = setInterval(() => {
      prune();
      voided();
      statsRollup();
      dormant(); // its lease is a day long: one instance runs it once a day
    }, HOUR_MS);
    hourly.unref();
    timers.push(hourly);
  }, Math.floor(Math.random() * HOUR_MS));
  for (const t of timers) t.unref();
  firstHourly.unref();

  // Graceful shutdown (report section 5 step 2, A9).
  const onSignal = gracefulShutdown({
    drainMs: process.env.SHUTDOWN_DRAIN_MS !== undefined ? Math.max(0, Number(process.env.SHUTDOWN_DRAIN_MS) || 0) : SHUTDOWN_DRAIN_MS,
    deadlineMs: Number(process.env.SHUTDOWN_DEADLINE_MS) || SHUTDOWN_DEADLINE_MS,
    setDraining: () => {
      draining = true;
      clearTimeout(firstHourly);
      for (const t of timers) clearInterval(t);
    },
    steps: [
      { name: 'http', run: () => app.close() },
      ...(resim ? [{ name: 'resim', run: () => resim!.close() }] : []),
      ...(redis ? [{ name: 'redis', run: () => redis!.close() }] : []),
      ...(repo instanceof PgRepo ? [{ name: 'database', run: () => (repo as PgRepo).close() }] : []),
    ],
    log: (lvl, msg, fields) => app.log[lvl](fields ?? {}, msg),
    exit: (code) => process.exit(code),
  });
  for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => void onSignal(s));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
