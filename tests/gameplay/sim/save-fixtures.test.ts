/**
 * Beast Mode 2026-11-21 SAV-09: real saves written by each version's own code (tools/saves/make-fixture.mjs, run on a
 * checkout of the commit that introduced that SAVE_VERSION) load in today's build without losing progress. History in
 * this repository starts at save version 21, so older versions are covered by the synthetic saves in
 * migration-full.test.ts only. Each SAVE_VERSION bump adds the fixture of the version it leaves.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { computeOfflineProgress } from '../../../src/gameplay/sim/offline';
import { deserialize, SAVE_VERSION, serialize, validateVillage } from '../../../src/gameplay/sim/save';
import { RESOURCE_KINDS } from '../../../src/gameplay/sim/types';
import { hallLevel } from '../../../src/gameplay/sim/village';

const dir = resolve(__dirname, '../../fixtures/saves');
const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

describe('SAV-09: real save fixtures', () => {
  it('there is a fixture for every version this history can produce (21 to the current one), and a late-game village', () => {
    const versions = new Set(files.map((f) => Number(/^v(\d+)-/.exec(f)?.[1])));
    for (let v = 21; v <= SAVE_VERSION; v++) expect(versions.has(v), `missing tests/fixtures/saves/v${v}-*.json`).toBe(true);
    expect(files.some((f) => f.startsWith(`v${SAVE_VERSION}-`) && /keep1[0-5]/.test(f))).toBe(true);
  });

  for (const f of files) {
    it(`${f} loads, settles a day and round-trips without losing progress`, () => {
      const raw = JSON.parse(readFileSync(resolve(dir, f), 'utf8')) as { version: number; savedAt: number; village: { resources: Record<string, number>; buildings: { type: string; level: number }[] } };
      const keepBefore = Math.max(...raw.village.buildings.filter((b) => data.buildings[b.type]?.category === 'hall').map((b) => b.level));
      const s = deserialize(raw, data);
      expect(validateVillage(s, data)).toEqual([]);
      expect(hallLevel(s, data)).toBe(keepBefore);
      for (const k of RESOURCE_KINDS) expect(s.resources[k]).toBeGreaterThanOrEqual(Math.min(raw.village.resources[k] ?? 0, s.resources[k]));
      expect(s.buildings.length).toBe(raw.village.buildings.length);
      const { state } = computeOfflineProgress(s, raw.savedAt + 24 * 3_600_000, data, { botRaids: false });
      const again = deserialize(serialize(state, raw.savedAt + 24 * 3_600_000), data);
      expect(hallLevel(again, data)).toBe(keepBefore);
      expect(again.buildings.length).toBe(state.buildings.length);
    });
  }
});
