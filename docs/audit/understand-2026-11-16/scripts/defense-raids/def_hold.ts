// Read-only measurement: how often does a village of a given build quality hold a bot raid,
// and what does a lost raid take, at chosen Keeps and raider strengths.
// Run: node --experimental-transform-types --import <repo>/tools/balance/lab/register.mjs def_hold.ts <keeps> <n>
const REPO = '/home/user/ninja-version-of-game-1';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const RES = await import(`${REPO}/src/gameplay/sim/resources`);

const keeps = (process.argv[2] ?? '5,9').split(',').map(Number);
const N = Number(process.argv[3] ?? 8);
const now = Date.UTC(2026, 5, 1, 12, 0, 0);

type Variant = 'none' | 'lvl1' | 'b0' | 'b50' | 'b100';
const variants: Variant[] = (process.env.VARIANTS ?? 'none,lvl1,b0,b50,b100').split(',') as Variant[];
const offsets = (process.env.OFFS ?? '-1,-0.5,0,0.5').split(',').map(Number);

function village(K: number, variant: Variant, seed: number, data: any) {
  const bias = variant === 'b0' ? 0 : variant === 'b100' ? 1 : 0.5;
  const gen = G.generateOpponent(seed, K, data, { levelBias: bias });
  const st = V.createNewVillage(now, data);
  const out: any[] = [];
  let id = 1;
  for (const b of gen.buildings) {
    const def = data.buildings[b.type];
    const cat = def.category;
    const isDef = cat === 'defense' || cat === 'trap' || cat === 'hedge';
    if (variant === 'none' && isDef) continue;
    if (variant === 'lvl1' && (cat === 'hedge')) continue;
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
  st.trophies = (K - 1) * data.ranks.matchmaking.trophiesPerHall;
  st.seed = seed;
  return st;
}

for (const K of keeps) {
  for (const variant of variants) {
    let line = `K${K} ${variant.padEnd(5)}`;
    for (const off of offsets) {
      const data = structuredClone(defaultData);
      (data.raids as any).raiderMatch = { lo: off, hi: off };
      let d = 0, s = 0, held = 0, three = 0, lost = 0, avail = 0, lostHeld = 0, nHeld = 0, fromSt = 0, t0 = Date.now();
      for (let i = 0; i < N; i++) {
        const st = village(K, variant, 4000 + i * 7 + K * 131, data);
        const base = D.villageToBase(st, now, data);
        const tot = G.totalLoot(base);
        avail += (tot.acorns ?? 0) + (tot.dew ?? 0);
        const oc = D.raidVillage(st, now, R.createRng(900 + i), data); const r = oc.record.result; fromSt += (oc.fromStorage.acorns ?? 0) + (oc.fromStorage.dew ?? 0); if (r.stars === 0) { nHeld++; lostHeld += (r.loot.acorns ?? 0) + (r.loot.dew ?? 0); }
        d += r.destruction; s += r.stars; held += r.stars === 0 ? 1 : 0; three += r.stars === 3 ? 1 : 0;
        lost += (r.loot.acorns ?? 0) + (r.loot.dew ?? 0);
      }
      line += ` | off ${off >= 0 ? '+' : ''}${off}: ${(d / N).toFixed(0)}% ${(s / N).toFixed(2)}★ held ${(held / N * 100).toFixed(0)}% 3★ ${(three / N * 100).toFixed(0)}% lost ${(lost / N / 1000).toFixed(0)}k of ${(avail / N / 1000).toFixed(0)}k (${(100 * lost / Math.max(1, avail)).toFixed(0)}%; storage part ${(fromSt / N / 1000).toFixed(0)}k; lost when held ${nHeld ? (lostHeld / nHeld / 1000).toFixed(0) : '-'}k) [${((Date.now() - t0) / N).toFixed(0)}ms]`;
    }
    console.log(line);
  }
}
