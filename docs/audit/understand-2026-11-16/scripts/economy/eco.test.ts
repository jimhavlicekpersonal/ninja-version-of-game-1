// Scratch reproductions for the economy investigator. Reads the repo's sim; writes nothing.
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/data';
import { applyCommand, createNewVillage, advance, topUpQuote, trainingSkipQuote } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/village';
import { productGrantsFor } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/monetization';
import { passSeasonEndsAt, passPremiumValue, unlockedTier } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/pass';
import { capacity } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/resources';
import { attackerStrength, opponentFor, attackerFor } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/matchmaking';
import { createRng } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/rng';
import type { VillageState } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/types';

const DAY = 86_400_000;
const T0 = data.pass.epoch + 400 * DAY + 3 * 3_600_000; // some season, day 10 of a 30-day season (400 % 30 = 10)

function village(keep: number, patch: Partial<VillageState> = {}): VillageState {
  const v = createNewVillage(T0 - 30 * DAY, data);
  const lim = data.hall.levels[keep - 1].limits;
  const buildings = v.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle').map((b) => (b.type === 'elder_toadstool' ? { ...b, level: keep } : b));
  let id = 9000;
  for (const t of ['acorn_silo', 'dew_cistern', 'army_camp', 'burrow_barracks', 'acorn_orchard', 'dewdrop_well']) {
    const l = lim[t];
    if (!l) continue;
    for (let i = 0; i < l.count; i++) buildings.push({ id: `x${id++}`, type: t, x: 2 + (i % 6) * 4, y: 2 + Math.floor(id % 7) * 4, level: l.maxLevel, ...(data.buildings[t].category === 'collector' ? { collector: { stored: 0, accrueFrom: T0 } } : {}) } as never);
  }
  return { ...v, buildings, profile: { ...v.profile, under18: false, ageBand: 'adult' } as never, ...patch };
}

describe('ECO scratch', () => {
  it('Season Scroll: unlocked-but-unclaimed tiers (free and paid premium) are dropped at the season roll', () => {
    let s = village(8);
    s = { ...s, pass: { ...s.pass, season: Math.floor((T0 - data.pass.epoch) / (30 * DAY)), points: 300 * 20 } };
    const buy = applyCommand(s, { type: 'grantPurchase', productId: data.pass.productId, transactionId: 'tx1', verified: true }, T0, data);
    expect(buy.ok).toBe(true);
    if (!buy.ok) return;
    s = buy.state;
    expect(s.pass.premium).toBe(true);
    expect(unlockedTier(s, data)).toBe(20);
    const jadeBefore = s.resources.moonstones;
    // the player never taps the 20 premium + 20 free claims; the season ends
    const after = advance(s, passSeasonEndsAt(T0, data) + 1000, data).state;
    console.log('PASS ROLL: premium before', s.pass.premium, 'unlocked', unlockedTier(s, data), 'claimedPremium', s.pass.claimedPremium.length, '| after roll: premium', after.pass.premium, 'points', after.pass.points, 'Jade delta', after.resources.moonstones - jadeBefore, 'coins delta', after.resources.acorns - s.resources.acorns);
    // premium Jade on tiers 1..20 = 100 + 80 + 80 = 260; free Jade 10+15+20+25 = 70
    expect(after.resources.moonstones - jadeBefore).toBe(0);
  });

  it('Offer resources: what each offer gives per Keep (scaled), in hours of production and as Jade if storage is full', () => {
    const rows: string[] = [];
    for (const keep of [2, 4, 5, 8, 10, 12, 15]) {
      const lim = data.hall.levels[keep - 1].limits;
      const prod = lim.acorn_orchard.count * data.buildings.acorn_orchard.levels[lim.acorn_orchard.maxLevel - 1].ratePerHour!;
      for (const id of ['offer_starter', 'offer_war_prep', 'offer_keep']) {
        const empty = village(keep, { resources: { acorns: 0, dew: 0, nightsap: 0, moonstones: 0 } });
        const cap = capacity(empty, data);
        const full = village(keep, { resources: { acorns: cap.acorns, dew: cap.dew, nightsap: 0, moonstones: 0 } });
        const g0 = productGrantsFor(empty, id, data)!;
        const g1 = productGrantsFor(full, id, data)!;
        rows.push(`K${keep} ${id}: empty storage -> ${JSON.stringify(g0.grants)} (coins = ${(((g0.grants.acorns ?? 0)) / prod).toFixed(2)} h of production, prov = ${((g0.grants.dew ?? 0) / prod).toFixed(2)} h) | full storage -> ${JSON.stringify(g1.grants)}`);
      }
    }
    console.log(rows.join('\n'));
  });

  it('Rushed Keep 15 with level-1 research: who it meets and who raids it', () => {
    const s = village(15);
    const st = attackerStrength(s, data);
    const opp = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => opponentFor(seed * 7919, s, data).hallLevel);
    const raiders = [1, 2, 3, 4, 5, 6].map((seed) => { const a = attackerFor(createRng(seed * 31), { ...s, stats: { ...s.stats, defensesFaced: 10 } }, data); return `K${a.hall} lv${Math.max(...Object.values(a.levels))} housing~${Object.entries(a.army).reduce((x, [t, n]) => x + n * data.troops[t].housing, 0)}`; });
    console.log('RUSH K15: attackerStrength', st, 'opponent Keeps', opp.join(','), '| raiders', raiders.join(' ; '));
    const s8 = village(8);
    console.log('RUSH K8: attackerStrength', attackerStrength(s8, data), 'opponent Keeps', [1, 2, 3, 4, 5, 6].map((seed) => opponentFor(seed * 7919, s8, data).hallLevel).join(','));
  });

  it('Pass honest value line by Keep (buying on day 1 of a season)', () => {
    for (const keep of [3, 5, 8, 10, 12, 15]) {
      const s = village(keep);
      const start = passSeasonEndsAt(T0, data);
      const v = passPremiumValue(advance(s, start + 1000, data).state, start + 1000, data);
      console.log(`PASS VALUE K${keep}: tiers ${v.tiers} jade ${v.jade} resourceJade ${v.resourceJade} total ${v.total} packJade ${v.packJade}`);
    }
  });

  it('Top-up quotes: Keep upgrade from empty storage and a full army Fill, per Keep', () => {
    for (const keep of [3, 5, 8, 10, 12, 14]) {
      const s = village(keep, { resources: { acorns: 0, dew: 0, nightsap: 0, moonstones: 100000 } });
      const hallB = s.buildings.find((b) => b.type === 'elder_toadstool')!;
      const q = topUpQuote(s, { type: 'upgrade', id: hallB.id }, T0, data);
      console.log(`TOPUP K${keep}: buy the whole next-Keep price ->`, q ? `${q.moonstones} Jade for ${JSON.stringify(q.missing)}` : 'not offered');
    }
  });
});
