/**
 * Review of the exploit fixes, 2026-11-17, through the server's own routes (the reviewer's reproductions).
 * R3-10: an honest raid from a server-held village that brought Lodge warriors was refused before it was looked
 * at. R3-02: a Season Scroll claim on a made-up track. R3-05: Lodge warriors that are not declared.
 */
import { describe, expect, it } from 'vitest';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createRng } from '../../../src/gameplay/sim/rng';
import { deserialize, serialize } from '../../../src/gameplay/sim/save';
import { trialBase } from '../../../src/gameplay/sim/trials';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { createNewVillage, type Command } from '../../../src/gameplay/sim/village';
import { baseAt, startSeed, world } from './harness';

const T = Date.UTC(2026, 10, 17, 12);

/** A Keep 2 village with ten Shinobi and five donated Kunai Adepts in its Lodge. */
function withLodge(): VillageState {
  const s = createNewVillage(T - 3_600_000, data);
  const base = generateOpponent(7, 2, data, { levelBias: 1 });
  s.buildings = base.buildings.map((b, i) => ({ id: `b${i + 1}`, type: b.type, level: b.level, x: b.x, y: b.y, upgrade: null, collector: data.buildings[b.type].produces ? { stored: 0, accrueFrom: T } : null }));
  s.nextId = base.buildings.length + 1;
  s.army = { hedgehog_roller: 10 };
  s.grove.reinforcements = { frog_lobber: 5 };
  s.grove.reinforcementLevels = { frog_lobber: 1 };
  return s;
}

describe('review 2026-11-17 through the server', () => {
  it('R3-10: a raid from a server-held village may bring its Lodge warriors, and they are spent', async () => {
    const w = world({ start: T });
    const ann = await w.player('Ann');
    await w.player('Dot', baseAt(2, 31, 500));
    await ann.importVillage(serialize(withLodge(), T));
    w.pastShields();
    await ann.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'scout', paid: false } as Command }] } as never);
    const m = (await ann.match())!;
    const seed = await startSeed(ann, m.ticket);
    const army = { hedgehog_roller: 10, frog_lobber: 5 };
    const reinforcements = { frog_lobber: { count: 5, level: 1 } };
    const setup = { seed, base: m.base, army, levels: {}, infiltration: true, reinforcements };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(1), data, {}, probe.entry);
    await ann.submitAttack({ ticket: m.ticket, seed, army, levels: {}, reinforcements, deployments } as never);
    const after = deserialize((await ann.getVillage())!.file, data);
    expect(after.grove.reinforcements.frog_lobber ?? 0).toBeLessThan(5);
    expect(after.army.hedgehog_roller ?? 0).toBeLessThan(10);
  });

  it('R3-10: the same raid with the Lodge counted in the army but not declared still spends the Lodge', async () => {
    // The server builds a raid's setup itself and leaves `reinforcements` out when none is declared, and a setup
    // without that field takes donated warriors first. So counting the Lodge is never a way to fight for free.
    const w = world({ start: T });
    const ann = await w.player('Ann');
    await w.player('Dot', baseAt(2, 31, 500));
    await ann.importVillage(serialize(withLodge(), T));
    w.pastShields();
    await ann.sendCommands({ stateHash: '', commands: [{ seq: 1, t: w.now(), command: { type: 'scout', paid: false } as Command }] } as never);
    const m = (await ann.match())!;
    const seed = await startSeed(ann, m.ticket);
    const army = { hedgehog_roller: 10, frog_lobber: 5 };
    const setup = { seed, base: m.base, army, levels: {}, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(1), data, {}, probe.entry);
    expect(deployments.filter((d) => d.troop === 'frog_lobber').length).toBeGreaterThan(0);
    await ann.submitAttack({ ticket: m.ticket, seed, army, levels: {}, reinforcements: {}, deployments } as never);
    const after = deserialize((await ann.getVillage())!.file, data);
    expect(after.grove.reinforcements.frog_lobber ?? 0).toBeLessThan(5);
  });

  it('R3-02 and R3-05 through a command batch: a made-up Scroll track and an undeclared Lodge earn nothing', async () => {
    const w = world({ start: T });
    const ann = await w.player('Ann');
    const s = withLodge();
    s.army = {};
    await ann.importVillage(serialize(s, T));
    const before = deserialize((await ann.getVillage())!.file, data);
    const base = trialBase(1, data, 0);
    const army = { frog_lobber: 5 };
    const setup = { seed: 3, base, army, levels: {}, infiltration: true, reinforcements: {} };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(3), data, {}, probe.entry);
    const r = await ann.sendCommands({
      stateHash: '',
      commands: [
        { seq: 1, t: w.now(), command: { type: 'claimTier', tier: 1, track: 'Premium' } as unknown as Command },
        { seq: 2, t: w.now(), command: { type: 'trialEnd', tier: 1, record: { at: w.now(), opponentName: 'x', setup, deployments } } as Command },
      ],
    } as never);
    expect(r.results.every((x: { ok: boolean }) => !x.ok)).toBe(true);
    const after = deserialize((await ann.getVillage())!.file, data);
    expect(after.resources).toEqual(before.resources);
    expect(after.trials.best).toBe(0);
    expect(after.grove.reinforcements.frog_lobber).toBe(5);
  });
});
