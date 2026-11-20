// Read-only measurement, from the raid records only (`result.loot` taken, `banked` reward): raids per day, resources
// lost per day and hold reward per day for a village of a given build quality, through the real offline raid schedule
// (slots, shields, exhaustion). At each visit the storages are set to FILL of their capacity and the collectors emptied.
// Modes: passive (one visit a day, no attack: the shield stays) and active (4 visits a day, each attack ends the shield).
// Run from the repo root:
//   node --experimental-transform-types --import ./tools/balance/lab/register.mjs <this file> <keeps> <days> <fill> [share] [carry]
// Without share and carry it measures the shipped rule.
const REPO = process.env.REPO ?? process.cwd();
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const D = await import(`${REPO}/src/gameplay/sim/defense`);
const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const V = await import(`${REPO}/src/gameplay/sim/village`);
const RES = await import(`${REPO}/src/gameplay/sim/resources`);

const keeps = (process.argv[2] ?? '12').split(',').map(Number);
const DAYS = Number(process.argv[3] ?? 30);
const FILL = Number(process.argv[4] ?? 0.3);
const HOUR = 3_600_000;
type Variant = 'none' | 'lvl1' | 'b0' | 'b50' | 'b100';
const variants: Variant[] = (process.env.VARIANTS ?? 'lvl1,b0,b50,b100').split(',') as Variant[];
const data = structuredClone(defaultData);
if (process.argv[5]) data.raids.defenseWin = { shareOfRaidLoot: Number(process.argv[5]), perStar: true };
if (process.argv[6]) data.raids.carryByStars = process.argv[6].split(',').map(Number);
const t0 = Date.UTC(2026, 5, 1, 0, 0, 0);

function village(K: number, variant: Variant, seed: number) {
  const bias = variant === 'b0' ? 0 : variant === 'b100' ? 1 : 0.5;
  const gen = G.generateOpponent(seed, K, data, { levelBias: bias });
  const st = V.createNewVillage(t0, data);
  const out: any[] = [];
  let id = 1;
  for (const b of gen.buildings) {
    const def = data.buildings[b.type];
    const cat = def.category;
    const isDef = cat === 'defense' || cat === 'trap' || cat === 'hedge' || cat === 'support';
    if (variant === 'none' && isDef) continue;
    if (variant === 'lvl1' && cat === 'hedge') continue;
    out.push({ id: `b${id++}`, type: b.type, level: variant === 'lvl1' && isDef ? 1 : b.level, x: b.x, y: b.y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: t0 } : null });
  }
  st.buildings = out;
  st.nextId = id;
  st.shieldUntil = 0;
  st.stats.defensesFaced = 99;
  // Honor of the regular campaign at this Keep is below the raider clamp, so the raider is Keep-1 at bias 0.
  st.trophies = 0;
  st.seed = seed;
  st.lastSeenAt = t0;
  st.raidCheckAt = t0;
  return st;
}
function refill(st: any, t: number) {
  const cap = RES.capacity(st, data);
  st.resources.acorns = Math.floor(cap.acorns * FILL);
  st.resources.dew = Math.floor(cap.dew * FILL);
  for (const b of st.buildings) if (b.collector) b.collector = { stored: 0, accrueFrom: t };
  st.defenseLog = [];
}

for (const K of keeps) {
  const min = data.battle.generatedLootByHall[K - 1].min;
  for (const mode of ['passive', 'active'] as const) {
    for (const variant of variants) {
      let raids = 0, held = 0, loss = 0, rew = 0, stars = 0;
      const seeds = (process.env.SEEDS ?? '11,22').split(',').map(Number);
      for (const seed of seeds) {
        let st = village(K, variant, 4000 + seed + K * 131);
        refill(st, t0);
        const visits = mode === 'passive' ? [18] : [8, 12.5, 18, 22];
        for (let day = 0; day < DAYS; day++) {
          for (const h of visits) {
            const t = t0 + day * 24 * HOUR + h * HOUR;
            const r = D.simulateOfflineRaids(st, t, data);
            st = r.state;
            for (const o of r.raids) {
              const res = o.record.result;
              const lost = (res.loot.acorns ?? 0) + (res.loot.dew ?? 0);
              raids++; stars += res.stars; if (res.stars === 0) held++;
              loss += lost;
              rew += (o.record.banked?.acorns ?? 0) + (o.record.banked?.dew ?? 0);
            }
            // The visit: 10 minutes with the game open; collect and (active) attack, which ends the shield.
            const end = t + 10 * 60_000;
            st = V.advance(st, end, data).state;
            refill(st, end);
            if (mode === 'active') st.shieldUntil = Math.min(st.shieldUntil, end);
            st.lastSeenAt = end;
            st.raidCheckAt = end;
          }
        }
      }
      const days = DAYS * seeds.length;
      const m = (x: number) => (x / days / 1e6).toFixed(2) + 'M';
      console.log(`K${K} ${mode.padEnd(7)} ${variant.padEnd(5)} raids/day ${(raids / days).toFixed(2)} held ${(100 * held / Math.max(1, raids)).toFixed(0)}% stars ${(stars / Math.max(1, raids)).toFixed(2)} | lost/day ${m(loss)} reward/day ${m(rew)} net/day ${m(rew - loss)} | one full hold pays ${(2 * Math.floor(min * (data.raids.defenseWin?.shareOfRaidLoot ?? 0)) / 1e6).toFixed(2)}M`);
    }
  }
}
