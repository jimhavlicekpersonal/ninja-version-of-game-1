// Beast Mode OPS-02 (local builds): source maps never ship inside the iPhone or Android app. CI deletes them before
// `cap sync`; the local `npm run cap:*` scripts run this (cross-platform, no `find`) between the build and the sync.
//   node tools/release/strip-maps.mjs [dir]   (default dist)
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Deletes every *.map file under dir; returns how many. */
export function stripMaps(dir) {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) n += stripMaps(p);
    else if (e.name.endsWith('.map')) {
      rmSync(p);
      n++;
    }
  }
  return n;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const dir = process.argv[2] ?? 'dist';
  console.log(`Removed ${stripMaps(dir)} source map(s) from ${dir} (they are uploaded privately to Sentry by CI, never shipped).`);
}
