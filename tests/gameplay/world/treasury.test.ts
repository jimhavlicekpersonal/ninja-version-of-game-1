/** Clan treasuries, layout variants, terrain, the rival window and signature warriors. */
import { describe, expect, it } from 'vitest';
import { totalLoot } from '../../../src/gameplay/sim/battle/basegen';
import { hallWindow } from '../../../src/gameplay/sim/matchmaking';
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { advanceClans } from '../../../src/gameplay/sim/world/clans';
import { factionRank, supportSquad } from '../../../src/gameplay/sim/world/factions';
import { aiCandidates } from '../../../src/gameplay/sim/world/opponents';
import { settlementBase, targetFor } from '../../../src/gameplay/sim/world/territory';
import { fullTreasury, payFromTreasury, refillTreasury, treasuryFill, treasuryLootFactor } from '../../../src/gameplay/sim/world/treasury';
import { clanDef, clanVillage, layoutVariant } from '../../../src/gameplay/sim/world/villagegen';
import { data, newGame } from '../sim/helpers';

const DAY = 86_400_000;
const sum = (b: BaseLayout) => (totalLoot(b).acorns ?? 0) + (totalLoot(b).dew ?? 0);

describe('the rivals board stays inside the matchmaking window', () => {
  it('at every Keep, even after the clans grew for two months', () => {
    for (const keep of [1, 2, 3, 4, 5, 6]) {
      for (let seed = 1; seed <= 25; seed++) {
        const g = newGame({}, { starter: true });
        const s = { ...g.state, trophies: (keep - 0.5) * data.ranks.matchmaking.trophiesPerHall };
        s.world.firstRaidDone = true;
        s.buildings.find((b) => b.type === 'elder_toadstool')!.level = keep;
        advanceClans(s.world, g.clock.now() + 60 * DAY, keep, data);
        const win = hallWindow(keep, data);
        for (const c of aiCandidates(seed * 7919, s, data)) {
          expect(c.base.hallLevel, `Keep ${keep} ${c.kind}`).toBeGreaterThanOrEqual(win.min);
          expect(c.base.hallLevel, `Keep ${keep} ${c.kind}`).toBeLessThanOrEqual(win.max);
          expect(c.strength).toBeLessThan(win.max);
        }
      }
    }
  });
});

describe('clan treasuries', () => {
  it('refill each step up to full, and pay out what the player takes', () => {
    const g = newGame({}, { starter: true });
    const clan = structuredClone(g.state.world.clans.iron_serpent);
    const full = fullTreasury(clan.strength, data);
    clan.resources = { acorns: 0, dew: 0 };
    expect(treasuryFill(clan, data)).toBe(0);
    for (let i = 0; i < 100; i++) refillTreasury(clan, data);
    expect(clan.resources).toEqual({ acorns: full, dew: full });
    payFromTreasury(clan, { acorns: full / 2, dew: 999_999_999 });
    expect(clan.resources).toEqual({ acorns: full / 2, dew: 0 });
  });

  it('a full treasury puts more loot in the rival-clan village; the matched rival is unaffected', () => {
    const g = newGame({}, { starter: true });
    const s = { ...g.state, trophies: 700 };
    s.world.firstRaidDone = true;
    s.buildings.find((b) => b.type === 'elder_toadstool')!.level = 3;
    const rich = structuredClone(s);
    const poor = structuredClone(s);
    for (const c of Object.values(rich.world.clans)) c.resources = { acorns: 1e9, dew: 1e9 };
    for (const c of Object.values(poor.world.clans)) c.resources = { acorns: 0, dew: 0 };
    const a = aiCandidates(42, rich, data);
    const b = aiCandidates(42, poor, data);
    expect(a[0].base).toEqual(b[0].base);
    const ra = a.find((c) => c.kind === 'rival')!;
    const rb = b.find((c) => c.kind === 'rival')!;
    expect(ra.clan).toBe(rb.clan);
    expect(sum(ra.base)).toBeGreaterThan(sum(rb.base) * (data.clans.treasury.maxLoot / data.clans.treasury.minLoot) * 0.9);
    expect(treasuryLootFactor(rich.world.clans[ra.clan!], data)).toBe(data.clans.treasury.maxLoot);
  });

  it('a world map battle takes its loot out of the clan treasury', async () => {
    const { applyCommand } = await import('../../../src/gameplay/sim/village');
    const { createBattle } = await import('../../../src/gameplay/sim/battle/battle');
    const { botDeployments } = await import('../../../src/gameplay/sim/defense');
    const { createRng } = await import('../../../src/gameplay/sim/rng');
    const g = newGame({ acorns: 0, dew: 0 });
    let s = g.state;
    s.army = { hedgehog_roller: 60, frog_lobber: 40 };
    s.world.firstRaidDone = true;
    const shrine = s.world.settlements.find((x) => x.province === 'bamboo_vale' && x.kind === 'shrine')!;
    const r0 = applyCommand(s, { type: 'targetSettlement', id: shrine.id }, g.clock.now(), data);
    s = r0.ok ? r0.state : s;
    const before = { ...s.world.clans.bamboo.resources };
    const base = settlementBase(s.world.target!, s.world, data);
    const setup = { seed: 3, base, army: s.army, levels: {} };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, s.army, createRng(2), data);
    const r = applyCommand(s, { type: 'worldBattleEnd', record: { at: g.clock.now(), opponentName: base.name, setup, deployments } }, g.clock.now(), data);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const loot = r.state.battleLog[r.state.battleLog.length - 1].result.loot;
    expect((loot.acorns ?? 0) + (loot.dew ?? 0)).toBeGreaterThan(0);
    const after = r.state.world.clans.bamboo.resources;
    expect(after.acorns).toBeLessThan(before.acorns);
  });
});

describe('clan layouts and terrain', () => {
  it('each clan has a fixed set of layouts: seeds that pick the same variant build the same village', () => {
    const n = data.clans.generator.variants;
    expect(n).toBe(50);
    const a = clanVillage('crimson_fang', 7, 1.5, data);
    const b = clanVillage('crimson_fang', 7 + n, 1.5, data);
    expect(layoutVariant(7, data)).toBe(layoutVariant(7 + n, data));
    expect(a.layoutVariant).toBe(7 % n);
    expect(b.buildings).toEqual(a.buildings);
    const shapes = new Set(Array.from({ length: 200 }, (_, i) => JSON.stringify(clanVillage('crimson_fang', i, 1.5, data).buildings.map((x) => [x.type, x.x, x.y]))));
    expect(shapes.size).toBeLessThanOrEqual(n);
    expect(shapes.size).toBeGreaterThan(n / 2);
  });

  it('terrain packs a gorge settlement tighter than a plateau one', () => {
    const c = data.economy.mapSize / 2;
    const spread = (b: BaseLayout) => b.buildings.reduce((a, x) => a + Math.max(Math.abs(x.x - c), Math.abs(x.y - c)), 0) / b.buildings.length;
    const gorge = data.world.provinces.find((p) => p.id === 'crimson_gorge')!;
    const plateau = data.world.provinces.find((p) => p.id === 'emperors_shadow')!;
    expect(gorge.ringScale).toBeLessThan(1);
    expect(plateau.ringScale).toBeGreaterThan(1);
    let tight = 0;
    let wide = 0;
    for (let seed = 0; seed < 20; seed++) {
      tight += spread(clanVillage('thunder_lotus', seed, 4.5, data, { ringScale: gorge.ringScale }));
      wide += spread(clanVillage('thunder_lotus', seed, 4.5, data, { ringScale: plateau.ringScale }));
    }
    expect(tight).toBeLessThan(wide);
  });

  it('settlement villages use their province terrain and treasury, frozen at scouting', () => {
    const g = newGame({}, { starter: true });
    const w = g.state.world;
    const st = w.settlements.find((x) => x.province === 'crimson_gorge' && x.kind === 'village')!;
    const t = targetFor(st, w, 1, data);
    expect(t.lootFactor).toBeCloseTo(treasuryLootFactor(w.clans.crimson_fang, data), 9);
    expect(settlementBase(t, w, data)).toEqual(settlementBase(t, w, data));
  });
});

describe('faction signature warriors', () => {
  it('from Jonin the squad brings the clan signature warrior even before the Dojo unlocks it', () => {
    const g = newGame({}, { starter: true });
    const s = g.state;
    s.world.faction.id = 'silent_moon';
    const sig = clanDef(data, 'silent_moon').signature;
    s.world.faction.reputation = data.world.factions.ranks[data.world.factions.signatureRank - 1].reputation;
    expect(supportSquad(s, data)[sig]).toBeUndefined();
    s.world.faction.reputation = data.world.factions.ranks[data.world.factions.signatureRank].reputation;
    const squad = supportSquad(s, data);
    expect(squad[sig]).toBeGreaterThan(0);
    const housing = Object.entries(squad).reduce((a, [t, n]) => a + data.troops[t].housing * n, 0);
    expect(housing).toBeLessThanOrEqual(factionRank(s.world.faction.reputation, data).supportHousing);
    expect(squad[sig] * data.troops[sig].housing).toBeLessThanOrEqual(housing * data.world.factions.signatureShare + data.troops[sig].housing);
  });
});
