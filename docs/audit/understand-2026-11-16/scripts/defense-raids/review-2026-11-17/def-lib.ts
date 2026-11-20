// Shared helpers for the DEF-01 review probes (review key: def). Read-only against the repo.
const REPO = process.env.REPO ?? process.cwd();
export const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
export const D = await import(`${REPO}/src/gameplay/sim/defense`);
export const G = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
export const B = await import(`${REPO}/src/gameplay/sim/battle/battle`);
export const R = await import(`${REPO}/src/gameplay/sim/rng`);
export const V = await import(`${REPO}/src/gameplay/sim/village`);
export const RES = await import(`${REPO}/src/gameplay/sim/resources`);
export const GRID = await import(`${REPO}/src/gameplay/sim/grid`);
export const SAVE = await import(`${REPO}/src/gameplay/sim/save`);
export const HOUR = 3_600_000;
export const T0 = Date.UTC(2026, 5, 1, 0, 0, 0);

export type Variant = 'none' | 'lvl1' | 'b0' | 'b50' | 'b100';

/** The published harness's village: a generated layout for the Keep at a build quality. */
export function genVillage(K: number, variant: Variant, seed: number, data: any, t0 = T0) {
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
  st.trophies = 0;
  st.seed = seed;
  st.lastSeenAt = t0;
  st.raidCheckAt = t0;
  st.resources.acorns = 0;
  st.resources.dew = 0;
  return st;
}

/**
 * A legal village for Keep K whose buildings leave no tile an attacker may deploy on: every building the Keep
 * allows (counts from hall.json), each at `level(type)` (default 1), walls filling the gaps. Returns null when the
 * Keep's building counts cannot cover the map. Legality: every placement goes through the game's own canPlace.
 */
export function blockedVillage(K: number, seed: number, data: any, levelOf: (type: string, max: number) => number = () => 1, t0 = T0) {
  const map = data.economy.mapSize;
  const limits = data.hall.levels[K - 1].limits as Record<string, { count: number; maxLevel: number }>;
  const st = V.createNewVillage(t0, data);
  st.buildings = [];
  let id = 1;
  const pool: { type: string; size: number; level: number }[] = [];
  const hallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hall')!;
  pool.push({ type: hallType, size: data.buildings[hallType].size, level: K });
  for (const [type, lim] of Object.entries(limits)) {
    const def = data.buildings[type];
    if (!def) continue;
    if (def.category === 'decor' || def.category === 'obstacle' || def.category === 'trap' || def.category === 'hedge') continue;
    for (let i = 0; i < lim.count; i++) pool.push({ type, size: def.size, level: Math.max(1, Math.min(lim.maxLevel, levelOf(type, lim.maxLevel))) });
  }
  pool.sort((a, b) => b.size - a.size);
  const wallType = Object.keys(data.buildings).find((t) => data.buildings[t].category === 'hedge')!;
  let walls = limits[wallType]?.count ?? 0;
  const wallLevel = Math.max(1, Math.min(limits[wallType]?.maxLevel ?? 1, levelOf(wallType, limits[wallType]?.maxLevel ?? 1)));
  const covered = new Uint8Array(map * map);
  const cover = (x: number, y: number, s: number) => {
    for (let yy = Math.max(0, y - 1); yy < Math.min(map, y + s + 1); yy++) for (let xx = Math.max(0, x - 1); xx < Math.min(map, x + s + 1); xx++) covered[yy * map + xx] = 1;
  };
  const put = (type: string, level: number, x: number, y: number): boolean => {
    if (!GRID.canPlace(st, data, type, x, y).ok) return false;
    const def = data.buildings[type];
    st.buildings.push({ id: `b${id++}`, type, level, x, y, upgrade: null, collector: def.produces ? { stored: 0, accrueFrom: t0 } : null });
    cover(x, y, def.size);
    return true;
  };
  for (let y = 0; y < map; y++) {
    for (let x = 0; x < map; x++) {
      if (covered[y * map + x]) continue;
      let done = false;
      for (let i = 0; i < pool.length && !done; i++) {
        const p = pool[i];
        const px = Math.min(x + 1, map - p.size);
        const py = Math.min(y + 1, map - p.size);
        if (px - 1 > x || py - 1 > y) continue;
        if (put(p.type, p.level, px, py)) {
          pool.splice(i, 1);
          done = true;
        }
      }
      if (!done && walls > 0) {
        if (put(wallType, wallLevel, Math.min(x + 1, map - 1), Math.min(y + 1, map - 1))) {
          walls--;
          done = true;
        }
      }
      if (!done) return null;
    }
  }
  st.nextId = id;
  st.shieldUntil = 0;
  st.stats.defensesFaced = 99;
  st.trophies = 0;
  st.seed = seed;
  st.lastSeenAt = t0;
  st.raidCheckAt = t0;
  st.resources.acorns = 0;
  st.resources.dew = 0;
  return { st, unusedBuildings: pool.length, unusedWalls: walls, placed: st.buildings.length };
}

export interface DayOpts {
  days: number;
  /** Hours of the day the player opens the game (10 minutes each). */
  visits: number[];
  /** Storages are set to this share of capacity at the end of each visit (0 = spent before logging off). */
  fill: number;
  /** The player attacks at each visit, which ends the shield. */
  breakShield: boolean;
  /** Honor is put back to this at each visit (a player who loses attacks on purpose); undefined = left to move. */
  honor?: number;
  /** Clear the defense log at each visit, as daily_live.ts does (this switches exhaustion off). */
  clearLog?: boolean;
}

export function runDays(st0: any, data: any, o: DayOpts, t0 = T0) {
  let st = st0;
  let raids = 0, held = 0, loss = 0, rew = 0, stars = 0, shields = 0, noDeploy = 0, lossC = 0;
  const destr: number[] = [];
  for (let day = 0; day < o.days; day++) {
    for (const h of o.visits) {
      const t = t0 + day * 24 * HOUR + h * HOUR;
      const r = D.simulateOfflineRaids(st, t, data);
      st = r.state;
      for (const out of r.raids) {
        const res = out.record.result;
        raids++; stars += res.stars; if (res.stars === 0) held++;
        loss += (res.loot.acorns ?? 0) + (res.loot.dew ?? 0);
        lossC += (out.fromCollectors.acorns ?? 0) + (out.fromCollectors.dew ?? 0);
        rew += (out.record.banked?.acorns ?? 0) + (out.record.banked?.dew ?? 0);
        destr.push(res.destruction);
        if (D.shieldHoursFor(res.destruction, data) > 0) shields++;
        if (!out.record.deployments.length) noDeploy++;
      }
      const end = t + 10 * 60_000;
      st = V.advance(st, end, data).state;
      const cap = RES.capacity(st, data);
      st.resources.acorns = Math.floor(cap.acorns * o.fill);
      st.resources.dew = Math.floor(cap.dew * o.fill);
      for (const b of st.buildings) if (b.collector) b.collector = { stored: 0, accrueFrom: end };
      if (o.clearLog) st.defenseLog = [];
      if (o.breakShield) st.shieldUntil = Math.min(st.shieldUntil, end);
      if (o.honor !== undefined) st.trophies = o.honor;
      st.lastSeenAt = end;
      st.raidCheckAt = end;
    }
  }
  return { raids, held, loss, rew, stars, shields, noDeploy, lossC, destr, honorEnd: st.trophies, st };
}

export const M = (x: number) => (x / 1e6).toFixed(2) + 'M';
/** What the regular campaign player loots a day at these Keeps (docs/game-theory/CAMPAIGN.md: raids/days x loot per raid). */
export const REGULAR_DAILY: Record<number, number> = { 9: (20 / 5.0) * 673_142, 12: (54 / 13.4) * 1_668_270, 15: (80 / 20) * 6_213_993 };
/** Coins + Provisions the collectors make in a day at the levels the village has. */
export function collectorIncomePerDay(st: any, data: any): number {
  let sum = 0;
  for (const b of st.buildings) if (b.collector) sum += RES.collectorRatePerHour(b, b.level, data) * 24;
  return sum;
}
