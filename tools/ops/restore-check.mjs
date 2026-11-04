// Check a restored database before trusting it (roadmap step 44).
//   DATABASE_URL=<restored database> node tools/ops/restore-check.mjs
// - every migration this build knows is applied, none unknown;
// - the main tables answer, with row counts;
// - server-held villages are compared with their own ledger (the last balance of
//   each resource should be what the village holds); differences are listed as
//   warnings for a person to look at (a half-copied backup shows up here).
// Exits 1 on a problem. The weekly drill (.github/workflows/backup.yml) runs it
// on a fresh restore, then starts the server on it.
import { readdirSync } from 'node:fs';
import pg from 'pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('Set DATABASE_URL to the restored database.');
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: url, max: 1 });
const problems = [];
const warnings = [];
try {
  const files = readdirSync(new URL('../../server/migrations/', import.meta.url))
    .filter((f) => /^\d{4}_.*\.sql$/.test(f))
    .map((f) => f.replace(/\.sql$/, ''));
  const applied = new Set((await pool.query('select name from schema_migrations')).rows.map((r) => r.name));
  for (const f of files) if (!applied.has(f)) problems.push(`migration ${f} is not applied`);
  for (const a of applied) if (!files.includes(a)) problems.push(`migration ${a} is unknown to this build`);
  const counts = {};
  for (const t of ['players', 'villages', 'ledger', 'attacks', 'purchases', 'groves']) counts[t] = Number((await pool.query(`select count(*)::bigint as n from ${t}`)).rows[0].n);
  console.log('Rows:', counts);
  const { rows } = await pool.query(`
    select v.player_id, v.file, l.resource, l.balance
      from villages v
      join lateral (
        select distinct on (resource) resource, balance from ledger where player_id = v.player_id order by resource, id desc
      ) l on true`);
  let checked = 0;
  for (const r of rows) {
    const have = r.file?.village?.resources?.[r.resource];
    if (have === undefined) continue;
    checked++;
    if (Math.round(have) !== Number(r.balance)) warnings.push(`village ${r.player_id}: ${r.resource} is ${Math.round(have)} but its ledger says ${r.balance}`);
  }
  console.log(`Ledger balances checked: ${checked}.`);
} catch (e) {
  problems.push(e.message);
} finally {
  await pool.end();
}
if (warnings.length) console.warn(`Look at these (${warnings.length}):\n- ${warnings.slice(0, 50).join('\n- ')}`);
if (problems.length) {
  console.error(`The restored database has problems:\n- ${problems.join('\n- ')}`);
  process.exit(1);
}
console.log('The restored database looks complete.');
