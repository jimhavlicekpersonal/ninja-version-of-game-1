/**
 * Release step: apply pending database migrations, then exit.
 *
 *   DATABASE_URL=postgres://… npm run server:migrate            apply
 *   DATABASE_URL=postgres://… npm run server:migrate -- --status list only
 *
 * Run it after `npm run server:build` and before the new server starts (a
 * "release command" / "pre-deploy command" on Render, Fly.io or Railway).
 * Several runners at once are safe: they take turns on an advisory lock.
 */
import { PgRepo } from './pgRepo';

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to the Postgres database to migrate.');
  const pg = PgRepo.fromUrl(url);
  try {
    if (process.argv.includes('--status')) {
      const s = await pg.migrationStatus();
      console.log(`Applied: ${s.applied.join(', ') || 'none'}`);
      console.log(`Pending: ${s.pending.map((m) => m.name).join(', ') || 'none'}`);
      if (s.unknown.length) console.log(`Unknown to this build (database is newer): ${s.unknown.join(', ')}`);
      return;
    }
    const done = await pg.migrate((m) => console.log(m));
    console.log(done.length ? `Applied ${done.length} migration(s).` : 'The database is up to date.');
  } finally {
    await pg.close();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
