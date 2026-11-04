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
 */
import { defaultData } from '../src/gameplay/sim/data';
import { buildServer } from './app';
import { PgRepo } from './pgRepo';
import type { RateLimits } from './rateLimit';
import { MemoryRepo, type Repo } from './repo';

function trustProxy(v: string | undefined): boolean | number | string {
  if (!v || v === 'false' || v === '0') return false;
  if (v === 'true') return true;
  return /^\d+$/.test(v) ? Number(v) : v;
}

async function main(): Promise<void> {
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
    repo = pg;
  } else {
    console.warn('DATABASE_URL not set: using in-memory storage (data is lost on restart).');
    repo = new MemoryRepo();
  }
  const rateLimits = process.env.RATE_LIMITS ? (JSON.parse(process.env.RATE_LIMITS) as Partial<RateLimits>) : undefined;
  const app = buildServer({ repo, data: defaultData, corsOrigin: process.env.CORS_ORIGIN, logger: true, trustProxy: trustProxy(process.env.TRUST_PROXY), rateLimits });
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
  // Retention (30-day replays): hourly, starting at a random minute so instances spread out.
  const prune = () =>
    app.core.prune().then(
      (r) => app.log.info({ pruned: r }, 'retention'),
      (e) => app.log.error(e, 'retention failed'),
    );
  setTimeout(() => {
    void prune();
    setInterval(() => void prune(), 3_600_000).unref();
  }, Math.floor(Math.random() * 3_600_000)).unref();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
