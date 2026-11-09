/**
 * Dimension defence_math, step 4: the building economy (data arithmetic, no battles).
 * Run: node scratch/run.mjs scratch/defence_math/economy.ts
 */
import { defaultData as data } from '../../src/gameplay/sim/data';
import { expectedArmyPower } from '../../src/gameplay/sim/progression';

const costOf = (c: Record<string, number> | undefined) => Object.values(c ?? {}).reduce((a, b) => a + b, 0);
const f = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '-');
const pad = (s: string | number, w: number) => String(s).padStart(w);
const H = 3600;

export default function main() {
  const mint = data.buildings.acorn_orchard;
  const cap = data.economy.collectorHoursCap;
  console.log('== Table E1: collector upgrade payback per level (Coin Mint = Terraced Farm numbers; Mint costs Provisions, Farm costs Coins)');
  console.log('naive = cost / (rate gain per hour); stop = production lost while the timer runs (rate(L-1) x timer; village.ts upgrade() sets collector.accrueFrom = endsAt, resources.ts collectorAmount counts from accrueFrom)');
  console.log('true = (cost + lost) / gain. "collected every 8h" assumes the player never let the 8 h cap fill; a once-a-day player loses at most 8 h of production per day of timer: lost1/day = min(timer, 8h x days)');
  console.log(pad('L', 2), pad('cost', 9), pad('rate', 7), pad('gain', 6), pad('timer h', 8), pad('naive h', 8), pad('lost (stop)', 11), pad('true h', 8), pad('x naive', 7), pad('lost 1/day', 10), pad('true1 h', 8), pad('Keep', 4));
  for (let i = 1; i < mint.levels.length; i++) {
    const L = mint.levels[i];
    const P = mint.levels[i - 1];
    const gain = (L.ratePerHour ?? 0) - (P.ratePerHour ?? 0);
    const cost = costOf(L.cost as Record<string, number>);
    const timerH = L.buildSeconds / H;
    const lost = (P.ratePerHour ?? 0) * timerH;
    const days = Math.ceil(timerH / 24);
    const lost1 = (P.ratePerHour ?? 0) * Math.min(timerH, cap * days);
    const keep = data.hall.levels.find((h) => (h.limits.acorn_orchard?.maxLevel ?? 0) >= L.level)?.level ?? '-';
    console.log(pad(L.level, 2), pad(cost, 9), pad(L.ratePerHour ?? 0, 7), pad(gain, 6), pad(f(timerH), 8), pad(f(cost / gain, 0), 8), pad(Math.round(lost), 11), pad(f((cost + lost) / gain, 0), 8), pad(f((cost + lost) / cost, 2), 7), pad(Math.round(lost1), 10), pad(f((cost + lost1) / gain, 0), 8), pad(keep, 4));
  }

  console.log('\n== Table E2: per Keep: storage vs next Keep, Keep cost in hours of max income, builder-days of newly allowed upgrades, 7-day levels');
  console.log('income = count x rate at the Keep caps (one resource); storage = count x storage at caps + Keep storage; builder-days = sum of timers of every upgrade newly allowed at this Keep (new buildings from level 1; walls excluded, Keep timer excluded and listed apart)');
  console.log(pad('K', 2), pad('next Keep', 10), pad('Keep timer d', 12), pad('income/h', 9), pad('storage', 10), pad('Keep/storage', 12), pad('h of income', 11), pad('builder-d new', 13), pad('7d levels', 9), pad('cum builder-d', 13), pad('defence b-d', 11), pad('econ b-d', 9), pad('army b-d', 8), pad('armyPow', 8));
  let cumB = 0;
  const prevCaps: Record<string, { count: number; maxLevel: number }> = {};
  for (const h of data.hall.levels) {
    const K = h.level;
    const next = data.buildings.elder_toadstool.levels[K];
    const col = h.limits.acorn_orchard;
    const income = col ? col.count * (data.buildings.acorn_orchard.levels[col.maxLevel - 1].ratePerHour ?? 0) : 0;
    const st = h.limits.acorn_silo;
    const storage = (st ? st.count * (data.buildings.acorn_silo.levels[st.maxLevel - 1].storage?.acorns ?? 0) : 0) + (data.buildings.elder_toadstool.levels[K - 1].storage?.acorns ?? 0);
    let bd = 0;
    let n7 = 0;
    let bdDef = 0;
    let bdEcon = 0;
    let bdArmy = 0;
    for (const [t, lim] of Object.entries(h.limits)) {
      const b = data.buildings[t];
      if (!b || b.category === 'hedge' || b.category === 'decor' || b.category === 'builder' || b.category === 'obstacle') continue;
      const prev = prevCaps[t] ?? { count: 0, maxLevel: 0 };
      let secs = 0;
      // Existing buildings: new levels prev.maxLevel+1..lim.maxLevel. New buildings: levels 1..lim.maxLevel.
      for (let L = prev.maxLevel + 1; L <= lim.maxLevel; L++) {
        const s = b.levels[L - 1]?.buildSeconds ?? 0;
        secs += s * prev.count;
        if (s >= 604800) n7 += prev.count;
      }
      for (let L = 1; L <= lim.maxLevel; L++) {
        const s = b.levels[L - 1]?.buildSeconds ?? 0;
        secs += s * (lim.count - prev.count);
        if (s >= 604800) n7 += lim.count - prev.count;
      }
      bd += secs;
      if (['defense', 'trap', 'support'].includes(b.category)) bdDef += secs;
      else if (['collector', 'storage'].includes(b.category)) bdEcon += secs;
      else if (b.category === 'military') bdArmy += secs;
      prevCaps[t] = { count: lim.count, maxLevel: lim.maxLevel };
    }
    cumB += bd / 86400;
    console.log(pad(K, 2), pad(next ? costOf(next.cost as Record<string, number>) : '-', 10), pad(next ? f(next.buildSeconds / 86400) : '-', 12), pad(income, 9), pad(storage, 10), pad(next ? f(costOf(next.cost as Record<string, number>) / storage, 2) : '-', 12), pad(next ? f(costOf(next.cost as Record<string, number>) / income, 0) : '-', 11), pad(f(bd / 86400), 13), pad(n7, 9), pad(f(cumB, 0), 13), pad(f(bdDef / 86400), 11), pad(f(bdEcon / 86400), 9), pad(f(bdArmy / 86400), 8), pad(f(expectedArmyPower(K), 0), 8));
  }

  console.log('\n== Table E3: levels at the 7-day cap (progression.json buildings.maxSeconds = 604800) per building');
  for (const [t, b] of Object.entries(data.buildings)) {
    const seven = b.levels.map((l, i) => (l.buildSeconds >= 604800 ? i + 1 : 0)).filter(Boolean);
    if (seven.length) {
      const firstKeep = data.hall.levels.find((h) => (h.limits[t]?.maxLevel ?? 0) >= seven[0])?.level;
      console.log(`${t.padEnd(22)} 7-day from level ${seven[0]} of ${b.levels.length} (first allowed at Keep ${firstKeep}); timer at the level before: ${f(b.levels[seven[0] - 2]?.buildSeconds / 86400, 1)} d`);
    }
  }

  console.log('\n== Table E4: Coin and Provision building budgets at caps per Keep (cumulative cost of every building at the Keep caps, by currency and category)');
  console.log(pad('K', 2), pad('Coins: Keep', 11), pad('defences', 11), pad('walls', 10), pad('traps', 8), pad('counters', 9), pad('Farms', 10), pad('ProvStore', 10), pad('Lodge', 9), pad('Coins total', 12), pad('| Prov: Mints', 12), pad('Treasury', 10), pad('camps', 10), pad('Dojo', 9), pad('Prov total', 11));
  for (const h of data.hall.levels) {
    const K = h.level;
    const sum = (types: string[], res: 'acorns' | 'dew') => types.reduce((s, t) => {
      const lim = h.limits[t];
      if (!lim) return s;
      return s + lim.count * data.buildings[t].levels.slice(0, lim.maxLevel).reduce((a, l) => a + ((l.cost as any)?.[res] ?? 0), 0);
    }, 0);
    const keep = data.buildings.elder_toadstool.levels.slice(0, K).reduce((a, l) => a + ((l.cost as any)?.acorns ?? 0), 0);
    const def = sum(['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'kite_cutter_ballista', 'longbow_yagura'], 'acorns');
    const walls = sum(['bramble_hedge'], 'acorns');
    const traps = sum(['thorn_snare', 'sap_puddle'], 'acorns');
    const ctr = sum(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner'], 'acorns');
    const farms = sum(['dewdrop_well'], 'acorns');
    const pst = sum(['dew_cistern'], 'acorns');
    const lodge = sum(['grove_lodge'], 'acorns');
    const mints = sum(['acorn_orchard'], 'dew');
    const tre = sum(['acorn_silo'], 'dew');
    const camps = sum(['army_camp'], 'dew');
    const dojo = sum(['burrow_barracks'], 'dew');
    console.log(pad(K, 2), pad(keep, 11), pad(def, 11), pad(walls, 10), pad(traps, 8), pad(ctr, 9), pad(farms, 10), pad(pst, 10), pad(lodge, 9), pad(keep + def + walls + traps + ctr + farms + pst + lodge, 12), pad(mints, 12), pad(tre, 10), pad(camps, 10), pad(dojo, 9), pad(mints + tre + camps + dojo, 11));
  }

  console.log('\n== Table E5: loot exposure per Keep: 20% of storage vs storageLootCapByHall vs generated loot vs Keep cost');
  console.log(pad('K', 2), pad('storage(cap)', 12), pad('20% stored', 10), pad('lootCap', 9), pad('binding', 8), pad('gen min', 9), pad('gen max', 9), pad('max loss/raid %Keep', 19), pad('8h collector 50%', 16));
  for (const h of data.hall.levels) {
    const K = h.level;
    const st = h.limits.acorn_silo;
    const storage = (st ? st.count * (data.buildings.acorn_silo.levels[st.maxLevel - 1].storage?.acorns ?? 0) : 0) + (data.buildings.elder_toadstool.levels[K - 1].storage?.acorns ?? 0);
    const lootCap = data.raids.storageLootCapByHall[K - 1];
    const gen = data.battle.generatedLootByHall[K - 1];
    const col = h.limits.acorn_orchard;
    const income = col ? col.count * (data.buildings.acorn_orchard.levels[col.maxLevel - 1].ratePerHour ?? 0) : 0;
    const next = data.buildings.elder_toadstool.levels[K];
    const maxLoss = Math.min(storage * 0.2, lootCap);
    console.log(pad(K, 2), pad(storage, 12), pad(Math.round(storage * 0.2), 10), pad(lootCap, 9), pad(storage * 0.2 < lootCap ? '20%' : 'cap', 8), pad(gen.min, 9), pad(gen.max, 9), pad(next ? f((maxLoss / costOf(next.cost as Record<string, number>)) * 100, 1) + '%' : '-', 19), pad(Math.round(income * 8 * 0.5), 16));
  }
}
