/**
 * Archived battle rules must never change after `npm run rules:snapshot` (report section 5 step 10,
 * quality 4: `server/rules/v3/engine.ts` was edited after its snapshot). `archiveDigest` hashes every file
 * of an archive; `server/rules/manifest.json` keeps the digest recorded at snapshot time and
 * `tests/backend/server/rules-archive.test.ts` fails when an archive drifts from it.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));
}

/** SHA-256 over every file's path and bytes, in a fixed order. */
export function archiveDigest(dir: string): string {
  const h = createHash('sha256');
  for (const f of files(dir).sort()) {
    h.update(relative(dir, f).split('\\').join('/'));
    h.update('\0');
    h.update(readFileSync(f));
    h.update('\0');
  }
  return h.digest('hex');
}
