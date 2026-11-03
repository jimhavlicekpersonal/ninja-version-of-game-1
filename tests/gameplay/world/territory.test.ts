/** The world map: conquest, no Honor farming, tribute, AI reclaim (sim/world/territory.ts). */
import { describe, expect, it } from 'vitest';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BaseLayout, BattleSetup, Deployment } from '../../../src/gameplay/sim/battle/types';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { createRng } from '../../../src/gameplay/sim/rng';
import type { VillageState } from '../../../src/gameplay/sim/types';
import { applyCommand, battleArmy, hallLevel } from '../../../src/gameplay/sim/village';
import { troopLevels } from '../../../src/gameplay/sim/research';
import { advanceClans } from '../../../src/gameplay/sim/world/clans';
import { expandStep, settlementBase, tributeQuote } from '../../../src/gameplay/sim/world/territory';
import { dayIndex } from '../../../src/gameplay/sim/pass';
import { data, newGame } from '../sim/helpers';

const HOUR = 3_600_000;

function strongPlayer(): { state: VillageState; now: number } {
  const g = newGame({ acorns: 100_000, dew: 100_000 });
  const s = g.state;
  // A big army is enough to flatten a Bamboo shrine.
  s.army = { hedgehog_roller: 60, frog_lobber: 40, beetle_brute: 10 };
  s.research.levels = { hedgehog_roller: 3, frog_lobber: 3, beetle_brute: 3 };
  s.world.firstRaidDone = true;
  return { state: s, now: g.clock.now() };
}

function attack(state: VillageState, base: BaseLayout, _now: number): { setup: BattleSetup; deployments: Deployment[] } {
  const army = battleArmy(state);
  const levels = troopLevels(state, data);
  const setup = { seed: 7, base, army, levels };
  const probe = createBattle(setup, data);
  return { setup, deployments: botDeployments(probe.deployable, probe.grid.size, army, createRng(3), data, levels) };
}

describe('the world map', () => {
  it('starts with every province held by its AI clan', () => {
    const { state } = strongPlayer();
    const kinds = data.world.settlementKinds.reduce((a, k) => a + k.count, 0);
    expect(state.world.settlements).toHaveLength(data.world.provinces.length * kinds);
    for (const s of state.world.settlements) expect(s.owner).toBe(data.world.provinces.find((p) => p.id === s.province)!.clan);
  });

  it('a won battle takes the settlement, pays loot but no Honor, and the clan rebuilds', () => {
    let { state, now } = strongPlayer();
    const shrine = state.world.settlements.find((s) => s.province === 'bamboo_vale' && s.kind === 'shrine')!;
    let r = applyCommand(state, { type: 'targetSettlement', id: shrine.id }, now, data);
    expect(r.ok).toBe(true);
    state = r.ok ? r.state : state;
    const base = settlementBase(state.world.target!, state.world, data);
    const { setup, deployments } = attack(state, base, now);
    const trophies = state.trophies;
    r = applyCommand(state, { type: 'worldBattleEnd', record: { at: now, opponentName: base.name, setup, deployments } }, now, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const after = r.state;
    const rec = after.battleLog[after.battleLog.length - 1];
    expect(rec.result.stars).toBeGreaterThanOrEqual(data.world.conquestStars);
    expect(rec.conquered).toBe(true);
    expect(after.trophies).toBe(trophies);
    expect(after.world.settlements.find((s) => s.id === shrine.id)!.owner).toBe('player');
    expect(after.world.clans.bamboo.status).toBe('rebuilding');
    expect(after.world.counters.conquests).toBe(1);
    expect(after.world.target).toBeNull();
    // Tribute: once a day from held Shrines.
    const q = tributeQuote(after, dayIndex(now, data), hallLevel(after, data), data);
    expect(q.ready).toBe(true);
    const t1 = applyCommand(after, { type: 'claimTribute' }, now, data);
    expect(t1.ok).toBe(true);
    if (!t1.ok) return;
    expect(applyCommand(t1.state, { type: 'claimTribute' }, now + HOUR, data).ok).toBe(false);
    expect(applyCommand(t1.state, { type: 'claimTribute' }, now + 25 * HOUR, data).ok).toBe(true);
  });

  it('ignores a forged village: the settlement is rebuilt from the frozen target', () => {
    let { state, now } = strongPlayer();
    const fort = state.world.settlements.find((s) => s.province === 'emperors_shadow' && s.kind === 'fortress')!;
    const r0 = applyCommand(state, { type: 'targetSettlement', id: fort.id }, now, data);
    state = r0.ok ? r0.state : state;
    // A tiny forged base: just the Keep with all the loot in the world.
    const forged: BaseLayout = { name: 'fake', hallLevel: 1, buildings: [{ id: 'h', type: 'elder_toadstool', level: 1, x: 18, y: 18, loot: { acorns: 999_999 } }] };
    const { setup, deployments } = attack(state, forged, now);
    const r = applyCommand(state, { type: 'worldBattleEnd', record: { at: now, opponentName: 'fake', setup, deployments } }, now, data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const rec = r.state.battleLog[r.state.battleLog.length - 1];
    expect(rec.setup.base.name).toBe(fort.name);
    expect(rec.setup.base.clan).toBe('shadow_emperor');
    expect(rec.result.loot.acorns ?? 0).toBeLessThan(999_999);
  });

  it('a battle on a settlement that changed hands meanwhile is refused', () => {
    let { state, now } = strongPlayer();
    const s = state.world.settlements[3];
    const r0 = applyCommand(state, { type: 'targetSettlement', id: s.id }, now, data);
    state = r0.ok ? r0.state : state;
    state.world.settlements[3].variant++;
    const base = settlementBase({ ...state.world.target! }, state.world, data);
    const { setup, deployments } = attack(state, base, now);
    expect(applyCommand(state, { type: 'worldBattleEnd', record: { at: now, opponentName: 'x', setup, deployments } }, now, data).ok).toBe(false);
  });

  it('expanding clans take land from their rival and, after a while, back from the player', () => {
    const { state, now } = strongPlayer();
    const w = state.world;
    // The player holds every Crimson Fang settlement.
    for (const s of w.settlements) if (s.province === 'crimson_gorge') {
      s.owner = 'player';
      s.since = now;
    }
    // The same step hook advanceWorld uses.
    const w2 = structuredClone(w);
    advanceClans(w2, now + 60 * 24 * HOUR, 3, data, (clan, def, at, rng) => expandStep(w2, clan, def, at, rng, data));
    expect(w2.settlements.some((s) => s.province === 'crimson_gorge' && s.owner === 'crimson_fang')).toBe(true);
    expect(w2.counters.reclaimed).toBeGreaterThan(0);
    // (News keeps only the latest maxNews entries, so it is not checked after two months.)
    // Nobody reclaims before reclaimMinHeldHours.
    const w3 = structuredClone(w);
    advanceClans(w3, now + (data.clans.sim.reclaimMinHeldHours - 1) * HOUR, 3, data, (clan, def, at, rng) => expandStep(w3, clan, def, at, rng, data));
    expect(w3.counters.reclaimed).toBe(0);
  });
});

describe('shared territory (online region claims)', () => {
  it('marks settlements other players hold, returns ones the server gave to someone else, and takes them back on a confirmed win', () => {
    const g = newGame({}, { starter: true });
    let s = g.state;
    const now = g.clock.now();
    const a = s.world.settlements[0];
    const b = s.world.settlements[1];
    b.owner = 'player';
    s = (applyCommand(s, { type: 'syncRegionClaims', claims: [{ settlement: a.id, playerId: 'p2', name: 'Kaito' }, { settlement: b.id, playerId: 'p3', name: 'Rin' }], me: 'me' }, now, data) as { state: VillageState }).state;
    const sa = s.world.settlements.find((x) => x.id === a.id)!;
    const sb = s.world.settlements.find((x) => x.id === b.id)!;
    expect(sa.heldBy).toEqual({ id: 'p2', name: 'Kaito' });
    expect(sb.heldBy).toEqual({ id: 'p3', name: 'Rin' });
    expect(sb.owner).not.toBe('player');
    // An AI battle can't be started on a player-held settlement.
    expect(applyCommand(s, { type: 'targetSettlement', id: a.id }, now, data).ok).toBe(false);
    // The server confirms a won real-player battle: the settlement is ours, once.
    const before = s.world.counters.conquests;
    s = (applyCommand(s, { type: 'claimSettlement', id: a.id }, now, data) as { state: VillageState }).state;
    s = (applyCommand(s, { type: 'claimSettlement', id: a.id }, now, data) as { state: VillageState }).state;
    expect(s.world.settlements.find((x) => x.id === a.id)).toMatchObject({ owner: 'player', heldBy: null });
    expect(s.world.counters.conquests).toBe(before + 1);
    // Claims for this player never mark settlements as someone else's.
    s = (applyCommand(s, { type: 'syncRegionClaims', claims: [{ settlement: a.id, playerId: 'me', name: 'Me' }], me: 'me' }, now, data) as { state: VillageState }).state;
    expect(s.world.settlements.find((x) => x.id === a.id)).toMatchObject({ owner: 'player', heldBy: null });
  });

  it('settlement ids are the same in every region and validated', async () => {
    const { isSettlementId } = await import('../../../src/gameplay/sim/world/territory');
    const g = newGame({}, { starter: true });
    for (const st of g.state.world.settlements) expect(isSettlementId(st.id, data)).toBe(true);
    for (const bad of ['', 'bamboo_vale', 'bamboo_vale:shrine2', 'nowhere:village1', 'bamboo_vale:village0']) expect(isSettlementId(bad, data)).toBe(false);
  });
});
