/**
 * Beast Mode SEC-01 (interim, policy off): a village kept on the device gains at most DEVICE_HONOR_PER_DAY honor per
 * UTC day from raids (its reports are client-trusted until REQUIRE_SERVER_VILLAGE). Server-held villages have no
 * such ceiling, and a ceiling of 0 turns it off.
 */
import { describe, expect, it } from 'vitest';
import { defaultData } from '../../../src/gameplay/sim/data';
import { baseAt, rush, startSeed, world } from './harness';

/** A base with no defences (raids win). */
function openBase(seed: number) {
  const b = baseAt(1, seed);
  b.buildings = b.buildings.filter((x) => defaultData.buildings[x.type].category !== 'defense');
  return b;
}

const T = Date.UTC(2026, 3, 6, 12);

async function setup(cap: number) {
  const w = world({ start: T, shared: { policy: { deviceHonorPerDay: cap } } as never });
  const a = await w.player('Ann', baseAt(1));
  const dot = await w.player('Dot', openBase(77));
  w.pastShields();
  await w.repo.updatePlayer(dot.id, { trophies: 500 });
  await w.repo.updatePlayer(a.id, { trophies: 480 });
  const win = async () => {
    const m = (await a.match())!;
    const seed = await startSeed(a, m.ticket);
    return a.submitAttack({ ticket: m.ticket, seed, ...rush(20) });
  };
  return { w, a, win };
}

describe('SEC-01: daily honor ceiling for device villages', () => {
  it('a win past the ceiling gains only what is left of it', async () => {
    const { w, a, win } = await setup(3);
    const first = await win();
    expect(first.result.stars).toBeGreaterThanOrEqual(1);
    expect(first.trophies).toBeGreaterThan(0);
    expect(first.trophies).toBeLessThanOrEqual(3);
    const after = (await w.repo.getPlayer(a.id))!;
    expect(after.trophies).toBe(480 + first.trophies);
    expect(after.honorGain).toEqual({ day: Math.floor(w.now() / 86_400_000), gained: first.trophies });
  });

  it('with the ceiling at 0 the gain is not limited', async () => {
    const { win } = await setup(0);
    const r = await win();
    expect(r.trophies).toBeGreaterThan(3);
  });
});
