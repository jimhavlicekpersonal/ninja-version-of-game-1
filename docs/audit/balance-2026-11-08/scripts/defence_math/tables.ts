/**
 * Dimension defence_math, step 1: data tables for every live defence at each Keep's cap.
 * Run: node scratch/run.mjs scratch/defence_math/tables.ts
 * Pure data arithmetic (buildings.json, hall.json, progression.json); no battles.
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { expectedArmyPower } from '../../src/gameplay/sim/progression';

const DEF = ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura'];
const SHORT: Record<string, string> = {
  acorn_cannon: 'Kunai', wasp_nest: 'Shurik', pinecone_catapult: 'Mortar', firefly_tower: 'SkyBow', kite_cutter_ballista: 'Ballis', longbow_yagura: 'Yagura',
  thorn_snare: 'Spike', sap_puddle: 'Caltrop', bramble_hedge: 'Wall', paper_lantern_line: 'Lantern', clockwork_repairer: 'Crane', bitter_incense_burner: 'Brazier',
};
const costOf = (c: Record<string, number> | undefined) => Object.values(c ?? {}).reduce((a, b) => a + b, 0);
const cum = (type: string, level: number) => data.buildings[type].levels.slice(0, level).reduce((s, l) => s + costOf(l.cost as Record<string, number>), 0);
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);

export default function main() {
  console.log('== Table 1: live shooting defences at each Keep cap (hall.json limits x buildings.json levels)');
  console.log('cost = cumulative Coins to reach the cap level (one building); DPS = damage x 10 / fireIntervalTicks (single target; Mortar splash r=1.5 not counted)');
  console.log('HPxDPS/1M = (HP x DPS) / (cost / 1e6) as in FSR 3.4; pow/1M = sqrt(HP x DPS) / (cost/1e6) (Lanchester, additive over buildings); DPS/1M = DPS/(cost/1e6)');
  console.log(pad('K', 2), pad('type', 7), pad('n', 2), pad('cap', 3), pad('cost', 10), pad('HP', 7), pad('DPS', 7), pad('rng', 4), pad('HPxDPS/1M', 10), pad('pow/1M', 8), pad('DPS/1M', 8), pad('HP/1M', 8), pad('n*cost', 11), pad('n*DPS', 8));
  const totals: Record<number, { cost: number; dps: number; hp: number; pow: number; n: number }> = {};
  for (const h of data.hall.levels) {
    const K = h.level;
    totals[K] = { cost: 0, dps: 0, hp: 0, pow: 0, n: 0 };
    for (const t of DEF) {
      const lim = h.limits[t];
      if (!lim) continue;
      const b = data.buildings[t];
      const L = b.levels[lim.maxLevel - 1];
      const dps = (L.damage ?? 0) * 10 / (b.combat!.fireIntervalTicks ?? 10);
      const cost = cum(t, lim.maxLevel);
      const m = cost / 1e6;
      console.log(pad(K, 2), pad(SHORT[t], 7), pad(lim.count, 2), pad(lim.maxLevel, 3), pad(cost, 10), pad(L.hp, 7), pad(f(dps, 0), 7), pad(b.combat!.range, 4), pad(f(L.hp * dps / m / 1e6, 2), 10), pad(f(Math.sqrt(L.hp * dps) / m, 0), 8), pad(f(dps / m, 0), 8), pad(f(L.hp / m, 0), 8), pad(lim.count * cost, 11), pad(f(lim.count * dps, 0), 8));
      totals[K].cost += lim.count * cost;
      totals[K].dps += lim.count * dps;
      totals[K].hp += lim.count * L.hp;
      totals[K].pow += lim.count * Math.sqrt(L.hp * dps);
      totals[K].n += lim.count;
    }
  }
  console.log('\n== Table 2: whole defence at caps per Keep vs the expected attacking army (sim/progression.ts expectedArmyPower = housing x best power per housing)');
  console.log(pad('K', 2), pad('towers', 6), pad('def cost', 11), pad('sum DPS', 8), pad('sum HP', 8), pad('sum pow', 8), pad('armyPow', 8), pad('def/army', 8), pad('housing', 7), pad('DPS/housing', 11), pad('walls cost', 10), pad('traps+ctr', 10), pad('defence share of all Coin building cost', 6));
  for (const h of data.hall.levels) {
    const K = h.level;
    const T = totals[K];
    const ap = expectedArmyPower(K);
    const housing = (data as any).progression?.armyHousingByKeep?.[K - 1] ?? [20, 40, 80, 120, 180, 240, 255, 270, 285, 300, 300, 315, 330, 345, 360][K - 1];
    const wl = h.limits.bramble_hedge;
    const wallCost = wl ? wl.count * cum('bramble_hedge', wl.maxLevel) : 0;
    let other = 0;
    for (const t of ['thorn_snare', 'sap_puddle', 'paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner']) {
      const lim = h.limits[t];
      if (lim) other += lim.count * cum(t, lim.maxLevel);
    }
    // All Coin-priced building cost at caps (Keep, defences, walls, traps, counters, Farms, Provision Storehouses, Lodge).
    let coinAll = 0;
    for (const [t, lim] of Object.entries(h.limits)) {
      const b = data.buildings[t];
      if (!b || b.category === 'decor' || b.category === 'obstacle' || b.category === 'builder') continue;
      const c = b.levels.slice(0, lim.maxLevel).reduce((s, l) => s + ((l.cost as any)?.acorns ?? 0), 0);
      coinAll += lim.count * c;
    }
    coinAll += data.buildings.elder_toadstool.levels.slice(0, K).reduce((s, l) => s + ((l.cost as any)?.acorns ?? 0), 0);
    console.log(pad(K, 2), pad(T.n, 6), pad(T.cost, 11), pad(f(T.dps, 0), 8), pad(T.hp, 8), pad(f(T.pow, 0), 8), pad(f(ap, 0), 8), pad(f(T.pow / ap, 2), 8), pad(housing, 7), pad(f(T.dps / housing, 1), 11), pad(wallCost, 10), pad(other, 10), pad(f((T.cost + wallCost + other) / coinAll * 100, 0) + '%', 6));
  }

  console.log('\n== Table 3: traps at caps (one-shot; damage is applied once to every ground troop inside splashRadius)');
  console.log(pad('K', 2), pad('type', 7), pad('n', 2), pad('cap', 3), pad('cost', 8), pad('dmg', 7), pad('radius', 6), pad('dmg/1k Coins', 12), pad('n*cost', 9));
  for (const h of data.hall.levels) {
    for (const t of ['thorn_snare', 'sap_puddle']) {
      const lim = h.limits[t];
      if (!lim) continue;
      const b = data.buildings[t];
      const L = b.levels[lim.maxLevel - 1];
      const cost = cum(t, lim.maxLevel);
      console.log(pad(h.level, 2), pad(SHORT[t], 7), pad(lim.count, 2), pad(lim.maxLevel, 3), pad(cost, 8), pad(f(L.damage ?? 0, 0), 7), pad(b.combat!.splashRadius ?? 0, 6), pad(f((L.damage ?? 0) / (cost / 1000), 1), 12), pad(lim.count * cost, 9));
    }
  }

  console.log('\n== Table 4: walls at caps (instant build, no builder)');
  console.log(pad('K', 2), pad('n', 3), pad('cap', 3), pad('HP', 6), pad('cum cost', 8), pad('HP/Coin', 8), pad('all walls', 10), pad('wall share of defence cost', 6));
  for (const h of data.hall.levels) {
    const lim = h.limits.bramble_hedge;
    if (!lim) continue;
    const L = data.buildings.bramble_hedge.levels[lim.maxLevel - 1];
    const cost = cum('bramble_hedge', lim.maxLevel);
    console.log(pad(h.level, 2), pad(lim.count, 3), pad(lim.maxLevel, 3), pad(L.hp, 6), pad(cost, 8), pad(f(L.hp / cost, 3), 8), pad(lim.count * cost, 10), pad(f(lim.count * cost / totals[h.level].cost * 100, 0) + '%', 6));
  }

  console.log('\n== Table 5: counters at caps (effect parameters)');
  console.log(pad('K', 2), pad('type', 8), pad('n', 2), pad('cap', 3), pad('cost', 8), pad('HP', 6), 'effect');
  for (const h of data.hall.levels) {
    for (const t of ['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura']) {
      const lim = h.limits[t];
      if (!lim) continue;
      const b = data.buildings[t];
      const L = b.levels[lim.maxLevel - 1];
      console.log(pad(h.level, 2), pad(SHORT[t], 8), pad(lim.count, 2), pad(lim.maxLevel, 3), pad(cum(t, lim.maxLevel), 8), pad(L.hp, 6), JSON.stringify({ ...b.effect, ...(L.effect ?? {}) }));
    }
  }

  console.log('\n== Table 6: per-level marginal efficiency (the last level each Keep unlocks): dPower per 1M Coins of that one level');
  console.log(pad('type', 7), pad('L', 2), pad('cost', 9), pad('HP', 6), pad('DPS', 7), pad('pow', 7), pad('dPow', 6), pad('dPow/1M', 8), pad('dDPS/1M', 8), pad('days', 5));
  for (const t of DEF) {
    const b = data.buildings[t];
    let prevPow = 0;
    let prevDps = 0;
    b.levels.forEach((L, i) => {
      const dps = (L.damage ?? 0) * 10 / (b.combat!.fireIntervalTicks ?? 10);
      const pow = Math.sqrt(L.hp * dps);
      const c = costOf(L.cost as Record<string, number>);
      console.log(pad(SHORT[t], 7), pad(i + 1, 2), pad(c, 9), pad(L.hp, 6), pad(f(dps, 0), 7), pad(f(pow, 0), 7), pad(f(pow - prevPow, 0), 6), pad(f((pow - prevPow) / (c / 1e6), 0), 8), pad(f((dps - prevDps) / (c / 1e6), 0), 8), pad(f(L.buildSeconds / 86400, 1), 5));
      prevPow = pow;
      prevDps = dps;
    });
  }

  console.log('\n== Table 7: hall.json limit oddities (flat caps, jumps, levels never a cap, count table)');
  const names = Object.keys(data.hall.levels[14].limits);
  for (const t of names) {
    const b = data.buildings[t];
    if (!b || b.category === 'decor' || b.category === 'builder') continue;
    const caps = data.hall.levels.map((h) => h.limits[t]?.maxLevel ?? 0);
    const counts = data.hall.levels.map((h) => h.limits[t]?.count ?? 0);
    const flats: string[] = [];
    const jumps: string[] = [];
    for (let k = 1; k < 15; k++) {
      if (caps[k - 1] > 0 && caps[k] === caps[k - 1]) flats.push(`K${k}=K${k + 1}(${caps[k]})`);
      if (caps[k - 1] > 0 && caps[k] - caps[k - 1] >= 2) jumps.push(`K${k}->K${k + 1}:+${caps[k] - caps[k - 1]}`);
    }
    const never: number[] = [];
    for (let L = 1; L <= b.levels.length; L++) if (!caps.includes(L)) never.push(L);
    console.log(`${t.padEnd(22)} levels=${b.levels.length} capK15=${caps[14]} counts=[${counts.join(',')}] caps=[${caps.join(',')}]`);
    console.log(`   flat: ${flats.join(' ') || '-'} | jumps: ${jumps.join(' ') || '-'} | levels never a cap: ${never.join(',') || '-'}`);
  }
}
