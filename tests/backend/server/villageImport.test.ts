/** Moving a device village to the server with sanity limits for its Keep (roadmap step 25). */
import { describe, expect, it } from 'vitest';
import { importProblem, IMPORT_MAX_JADE } from '../../../server/core/villageImport';
import { ServerError } from '../../../src/backend/net/ports';
import { serialize } from '../../../src/gameplay/sim/save';
import { economyHash } from '../../../src/gameplay/sim/serverEconomy';
import { capacity } from '../../../src/gameplay/sim/resources';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { emulator, placeCollector, placeType } from './economyHarness';
import { HOUR, world } from './harness';
import { repoFactories } from './pg';

const T = Date.UTC(2026, 3, 6, 12);

/** A village a player could really have: a few buildings, some troops in training. */
function played() {
  const game = emulator(serialize(createNewVillage(T, data), T), data);
  placeType(game, data, 'burrow_barracks', T);
  placeType(game, data, 'army_camp', T);
  placeCollector(game, data, T + 60_000, 'acorns'); // once a builder is free
  game.do({ type: 'train', troop: 'hedgehog_roller', count: 5 }, T + 60_000);
  return game.state;
}

describe('import sanity limits', () => {
  it('passes a real village and names what no village at its Keep could hold', () => {
    const now = T + HOUR;
    expect(importProblem(played(), now, data)).toBeNull();
    const rich = played();
    rich.resources.acorns = capacity(rich, data).acorns + 1;
    expect(importProblem(rich, now, data)).toMatch(/More acorns than the storages hold/);
    const jade = played();
    jade.resources.moonstones = IMPORT_MAX_JADE + 1;
    expect(importProblem(jade, now, data)).toMatch(/Jade/);
    const horde = played();
    horde.army = { hedgehog_roller: 999 };
    expect(importProblem(horde, now, data)).toMatch(/bigger army/);
    const sage = played();
    sage.research.levels = { hedgehog_roller: 9 };
    expect(importProblem(sage, now, data)).toMatch(/Research beyond/);
    const crowd = played();
    const camp = crowd.buildings.find((b) => b.type === 'army_camp')!;
    crowd.buildings.push({ ...camp, id: 'b999', x: camp.x + 6 });
    expect(importProblem(crowd, now, data)).toMatch(/Buildings: too many army_camp/);
    const slow = played();
    slow.buildings.find((b) => b.type === 'army_camp')!.upgrade = { startedAt: T, endsAt: T + 400 * 24 * HOUR, toLevel: 1 } as never;
    expect(importProblem(slow, now, data)).toMatch(/impossibly late/);
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`moving a village to the server on ${label} storage`, () => {
    it('keeps the village as it is (same economy), once, with an opening ledger; refuses an impossible one', async () => {
      const w = world({ repo: await makeRepo(), start: T + HOUR });
      const ann = await w.player('Ann');
      const village = played();
      const v = await ann.importVillage(serialize(village, w.now()));
      expect(v.stateHash).toBe(economyHash(village));
      expect((await ann.ledger(20)).entries.every((l) => l.reason === 'import')).toBe(true);
      await expect(ann.importVillage(serialize(village, w.now()))).rejects.toMatchObject({ code: 'conflict' });
      const ben = await w.player('Ben');
      const cheat = played();
      cheat.resources.moonstones = 999_999;
      const e = await ben.importVillage(serialize(cheat, w.now())).catch((x: ServerError) => x);
      expect(e).toMatchObject({ code: 'bad_request' });
      expect((e as ServerError).message).toMatch(/cannot move to the server: More Jade/);
      expect(await ben.getVillage()).toBeNull();
      await expect(ben.importVillage({ nonsense: true })).rejects.toMatchObject({ code: 'bad_request' });
    });
  });
}
