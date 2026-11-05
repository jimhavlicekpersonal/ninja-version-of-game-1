/**
 * Ledger audit (docs/audit/STATE_OF_THE_GAME.md, section 5 step 1), sim side.
 * A5: a refund takes back everything it gave; what was spent is a debt that
 * income pays back, that a raid cannot wipe, and that staff grants repay.
 */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { deserialize, migrate, SAVE_VERSION, serialize } from '../../../src/gameplay/sim/save';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, type Command } from '../../../src/gameplay/sim/village';

const T = Date.UTC(2026, 3, 6, 12);

function run(s: VillageState, cmd: Command, t = T): VillageState {
  const r = applyCommand(s, cmd, t, data);
  if (!r.ok) throw new Error(`${cmd.type}: ${r.message}`);
  return r.state;
}

describe('A5: refunds take back everything; what was spent is a debt', () => {
  const bought = () => {
    let s = createNewVillage(T, data);
    s = run(s, { type: 'grantPurchase', productId: 'offer_rebuild', transactionId: 'apple:1', verified: true });
    const grants = s.purchases.find((p) => p.id === 'apple:1')!.grants!;
    expect(grants.acorns).toBeGreaterThan(0);
    return { s, grants };
  };

  it('a refund after the coins were spent leaves a debt of exactly what was spent', () => {
    const { s: paid, grants } = bought();
    const before = structuredClone(paid.resources);
    // Spend all the coins and Jade (an upgrade, skips).
    paid.resources.acorns = 0;
    paid.resources.moonstones = 0;
    const s = run(paid, { type: 'revokePurchase', transactionId: 'apple:1' });
    expect(s.resources.acorns).toBe(-grants.acorns!);
    expect(s.resources.moonstones).toBe(-grants.moonstones!);
    expect(s.resources.dew).toBe(before.dew - grants.dew!);
    // A debt is a valid save (v17), and survives a round trip.
    const back = deserialize(serialize(s, T), data);
    expect(back.resources.acorns).toBe(-grants.acorns!);
  });

  it('a raid cannot wipe a debt, and takes nothing from it', () => {
    const { s: paid, grants } = bought();
    paid.resources.acorns = 0;
    let s = run(paid, { type: 'revokePurchase', transactionId: 'apple:1' });
    const record = { id: 'raid-1', at: T, kind: 'defense' as const, opponentName: 'Raider', setup: { seed: 1, base: { name: 'x', hallLevel: 1, buildings: [] }, army: {}, infiltration: true }, deployments: [], result: { stars: 1, destruction: 50, loot: { acorns: 9999 }, used: {}, hash: 'h' } as never, trophies: -10 };
    s = run(s, { type: 'applyDefense', record, lost: { acorns: 9999 }, trophies: 0, shieldUntil: T, fallen: [] });
    expect(s.resources.acorns).toBe(-grants.acorns!);
  });

  it('a reversed refund (a staff grant) pays the debt back instead of starting from zero', () => {
    const { s: paid, grants } = bought();
    paid.resources.acorns = 0;
    let s = run(paid, { type: 'revokePurchase', transactionId: 'apple:1' });
    s = run(s, { type: 'staffAdjust', resources: { acorns: grants.acorns! } });
    expect(s.resources.acorns).toBe(0);
    // A staff take never deepens a debt or creates one.
    s.resources.acorns = -500;
    s = run(s, { type: 'staffAdjust', resources: { acorns: -100 } });
    expect(s.resources.acorns).toBe(-500);
    s.resources.acorns = 50;
    s = run(s, { type: 'staffAdjust', resources: { acorns: -100 } });
    expect(s.resources.acorns).toBe(0);
  });

  it('save v17 changes no fields', () => {
    const s = createNewVillage(T, data);
    const old = { ...serialize(s, T), version: 16 };
    const out = migrate(structuredClone(old), data);
    expect(out.version).toBe(SAVE_VERSION);
    expect(SAVE_VERSION).toBe(17);
    expect(out.village).toEqual(old.village);
  });
});
