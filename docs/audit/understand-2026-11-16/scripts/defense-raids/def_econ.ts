// Read-only measurement: per-raid economics of defending, today's rules against a proposed rule set,
// computed from the same battles (carry by stars and the per-star reward are post-battle arithmetic).
// Run: node --experimental-transform-types --import <repo>/tools/balance/lab/register.mjs def_econ.ts <keeps> <n> <lo> <hi>
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const RES = await import(`${REPO}/src/gameplay/sim/resources`);

const keeps = (process.argv[2] ?? '5,9').split(',').map(Number);
const N = Number(process.argv[3] ?? 8);
const lo = Number(process.argv[4] ?? -1), hi = Number(process.argv[5] ?? -1);
const now = Date.UTC(2026, 5, 1, 12, 0, 0);
const CARRY = (process.env.CARRY ?? '0.2,0.5,0.8,1').split(',').map(Number);
const SHARE = Number(process.env.SHARE ?? 0.15);

type Variant = 'none' | 'lvl1' | 'b0' | 'b50' | 'b100';
const variants: Variant[] = (process.env.VARIANTS ?? 'lvl1,b0,b50,b100').split(',') as Variant[];

function village(K: number, variant: Variant, seed: number, data: any) {
  const bias = variant === 'b0' ? 0 : variant === 'b100' ? 1 : 0.5;
  const gen = G.generateOpponent(seed, K, data, { levelBias: bias });
  const st = V.createNewVillage(now, data);
  const out: any[] = [];
  let id = 1;
  for (const b of gen.buildings) {
    const def = data.buildings[b.type];
    const cat = def.category;
    const isDef = cat === 'defense' || cat === 'trap' || cat === 'hedge' || cat === 'support';
    if (variant === 'none' && isDef) continue;
    if (variant === 'lvl1' && cat === 'hedge') continue;
    const level = variant === 'lvl1' && isDef ? 1 : b.level;
    out.push({ id: `b${id++}`, type: b.type, level, x: b.x, y: b.y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: now - 6 * 3_600_000 } : null });
  }
  st.buildings = out;
  st.nextId = id;
  const cap = RES.capacity(st, data);
  st.resources.acorns = cap.acorns;
  st.resources.dew = cap.dew;
  st.shieldUntil = 0;
  st.stats.defensesFaced = 99;
  st.trophies = 0;
  st.seed = seed;
  return st;
}

console.log(`raider strength = Keep + U(${lo}, ${hi}); carry by stars ${CARRY.join('/')}; proposed held share ${SHARE} per star denied; storages full, 6 h in collectors; n=${N}`);
for (const K of keeps) {
  const data = structuredClone(defaultData);
  (data.raids as any).raiderMatch = { lo, hi };
  const min = data.battle.generatedLootByHall[K - 1].min;
  const rewardToday = 2 * Math.floor(min * data.raids.defenseWin.shareOfRaidLoot);
  for (const variant of variants) {
    const hist = [0, 0, 0, 0];
    let lossToday = 0, lossNew = 0, rewToday = 0, rewNew = 0, avail = 0, des = 0;
    for (let i = 0; i < N; i++) {
      const st = village(K, variant, 4000 + i * 7 + K * 131, data);
      const tot = G.totalLoot(D.villageToBase(st, now, data));
      avail += (tot.acorns ?? 0) + (tot.dew ?? 0);
      const r = D.raidVillage(st, now, R.createRng(900 + i), data).record.result;
      const lost = (r.loot.acorns ?? 0) + (r.loot.dew ?? 0);
      hist[r.stars]++;
      des += r.destruction;
      lossToday += lost;
      lossNew += lost * CARRY[r.stars];
      if (r.stars === 0) rewToday += rewardToday;
      rewNew += 2 * Math.floor(min * SHARE * (3 - r.stars) / 3);
    }
    const k = (x: number) => (x / N / 1000).toFixed(0).padStart(6) + 'k';
    console.log(`K${String(K).padEnd(2)} ${variant.padEnd(5)} stars 0/1/2/3 = ${hist.map((h) => Math.round(100 * h / N) + '%').join('/').padEnd(16)} destr ${(des / N).toFixed(0)}% | at risk ${k(avail)} | TODAY lost ${k(lossToday)} reward ${k(rewToday)} net ${k(rewToday - lossToday)} | PROPOSED lost ${k(lossNew)} reward ${k(rewNew)} net ${k(rewNew - lossNew)}`);
  }
}
