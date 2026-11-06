/**
 * Report section 5 step 10 (quality 4): archived battle rules are snapshots, never edited by hand.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { archiveDigest } from '../../../server/rules/manifest';

const RULES = join(process.cwd(), 'server/rules');

describe('archived battle rules', () => {
  it('every archive matches the digest recorded when it was made', () => {
    const manifest = JSON.parse(readFileSync(join(RULES, 'manifest.json'), 'utf8')) as Record<string, string>;
    const archives = readdirSync(RULES).filter((f) => /^v\d+$/.test(f));
    expect(Object.keys(manifest).sort()).toEqual(archives.sort());
    for (const v of archives) expect(archiveDigest(join(RULES, v)), v).toBe(manifest[v]);
  });
});
