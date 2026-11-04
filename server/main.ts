/**
 * Server entry point. Env: PORT, DATABASE_URL (Postgres; memory if unset),
 * CORS_ORIGIN ('*' or a comma-separated list of origins), MIGRATE_ON_BOOT=1
 * (single-instance hosts only: apply pending migrations on start instead of in
 * a release step).
 */
import { defaultData } from '../src/gameplay/sim/data';
import { buildServer } from './app';
import { PgRepo } from './pgRepo';
import { MemoryRepo, type Repo } from './repo';

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
  const app = buildServer({ repo, data: defaultData, corsOrigin: process.env.CORS_ORIGIN, logger: true });
  const port = Number(process.env.PORT ?? 8787);
  await app.listen({ port, host: '0.0.0.0' });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
