// Per-raid economics of defending, read from what the game really does: the raid's record (loot taken, reward banked).
// Compares today's shipped rules with a candidate (carry by stars, per-star hold reward) on the same villages and raids.
// Run from the repo root:
//   node --experimental-transform-types --import ./tools/balance/lab/register.mjs <this file> <keeps> <n> <fill> [carry] [share]
const REPO = process.env.REPO ?? process.cwd();
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const R = await import(`${REPO}/src/gameplay/sim/rng`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const RES = await import(`${REPO}/src/gameplay/sim/resources`);

const keeps = (process.argv[2] ?? '5,9,12,15').split(',').map(Number);
const N = Number(process.argv[3] ?? 24);
const FILL = Number(process.argv[4] ?? 0.3);
const CARRY = (process.argv[5] ?? '0.2,0.5,0.8,1').split(',').map(Number);
const SHARE = Number(process.argv[6] ?? 0.15);
const now = Date.UTC(2026, 5, 1, 12, 0, 0);
type Variant = 'lvl1' | 'b0' | 'b50' | 'b100';
const variants: Variant[] = ['lvl1', 'b0', 'b50', 'b100'];

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
    if (variant === 'lvl1' && cat === 'hedge') continue;
    const level = variant === 'lvl1' && isDef ? 1 : b.level;
    out.push({ id: `b${id++}`, type: b.type, level, x: b.x, y: b.y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: now - 6 * 3_600_000 } : null });
  }
  st.buildings = out;
  st.nextId = id;
  const cap = RES.capacity(st, data);
  st.resources.acorns = Math.floor(cap.acorns * FILL);
  st.resources.dew = Math.floor(cap.dew * FILL);
  st.shieldUntil = 0;
  st.stats.defensesFaced = 99;
  st.trophies = 0;
  st.seed = seed;
  return st;
}

function run(K: number, variant: Variant, data: any) {
  const hist = [0, 0, 0, 0];
  let loss = 0, rew = 0, frac = 0;
  for (let i = 0; i < N; i++) {
    const st = village(K, variant, 4000 + i * 7 + K * 131, data);
    const rec = D.raidVillage(st, now, R.createRng(900 + i), data).record;
    hist[rec.result.stars]++;
    loss += (rec.result.loot.acorns ?? 0) + (rec.result.loot.dew ?? 0);
    rew += (rec.banked?.acorns ?? 0) + (rec.banked?.dew ?? 0);
    if (!Number.isInteger(st.resources.acorns) || !Number.isInteger(st.resources.dew)) frac++;
  }
  return { hist, loss: loss / N, rew: rew / N, frac };
}

const k = (x: number) => (Math.round(x / 1000) + 'k').padStart(8);
console.log(`storages ${Math.round(FILL * 100)}% full, 6 h in collectors, n=${N}; candidate: carry ${CARRY.join('/')} share ${SHARE} per star`);
console.log('Keep build | stars 0/1/2/3      | TODAY loss  reward     net | NEW loss  reward     net | net as % of a full hold reward (new)');
for (const K of keeps) {
  const today = structuredClone(defaultData);
  delete (today.raids as any).carryByStars;
  today.raids.defenseWin = { shareOfRaidLoot: 0.05 } as any;
  const next = structuredClone(defaultData);
  (next.raids as any).carryByStars = CARRY;
  next.raids.defenseWin = { ...next.raids.defenseWin, shareOfRaidLoot: SHARE, perStar: true } as any;
  const hold = 2 * Math.floor(next.battle.generatedLootByHall[K - 1].min * SHARE);
  for (const v of variants) {
    const a = run(K, v, today), b = run(K, v, next);
    console.log(`K${String(K).padEnd(2)} ${v.padEnd(5)} | ${a.hist.map((h) => Math.round((100 * h) / N) + '%').join('/').padEnd(17)} | ${k(a.loss)} ${k(a.rew)} ${k(a.rew - a.loss)} | ${k(b.loss)} ${k(b.rew)} ${k(b.rew - b.loss)} | ${Math.round((100 * (b.rew - b.loss)) / hold)}%${b.frac ? '  FRACTIONAL x' + b.frac : ''}`);
  }
}
