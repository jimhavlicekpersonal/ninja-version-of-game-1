// Shared helpers for read-only combat measurements (scratch, outside the repo).
export const REPO = process.env.REPO ?? '/home/user/ninja-version-of-game-1';
export const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
export const B = await import(`${REPO}/src/gameplay/sim/battle/battle`);
export const { LAYOUTS, generateOpponent } = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
export const { temperBase } = await import(`${REPO}/src/gameplay/sim/battle/temper`);
export const { botDeployments } = await import(`${REPO}/src/gameplay/sim/defense`);
export const { botArmy } = await import(`${REPO}/src/gameplay/sim/matchmaking`);
export const { troopLevelCapAt } = await import(`${REPO}/src/gameplay/sim/research`);
export const { createRng } = await import(`${REPO}/src/gameplay/sim/rng`);
export const { maxHousingAtHall } = await import(`${REPO}/src/gameplay/sim/army`);
export const { heroAtKeep } = await import(`${REPO}/src/gameplay/sim/heroes`);
export const lab = await import(`${REPO}/tools/balance/armyLab`);

export function levelsFor(army: Record<string, number>, keep: number, data = defaultData) {
  return Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
}
export function housingOf(army: Record<string, number>, data = defaultData) {
  return Object.entries(army).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
}
/** Fill an army from housing shares by troop id. */
export function armyFrom(shares: Record<string, number>, keep: number, data = defaultData) {
  const housing = maxHousingAtHall(keep, data);
  const total = Object.values(shares).reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  let used = 0;
  for (const [t, s] of Object.entries(shares)) {
    const n = Math.floor((housing * s) / total / data.troops[t].housing);
    if (n > 0) { out[t] = n; used += n * data.troops[t].housing; }
  }
  const ids = Object.keys(shares).sort((a, b) => data.troops[a].housing - data.troops[b].housing);
  for (let g = 0; g < 500; g++) { const t = ids.find((x) => used + data.troops[x].housing <= housing); if (!t) break; out[t] = (out[t] ?? 0) + 1; used += data.troops[t].housing; }
  return out;
}
export interface Plan { tick: number; troop: string; x: number; y: number }
/** Bot-style squads through the `minPoints` points starting at rim index `start` (toughest first). */
export function planFrom(sim: any, army: Record<string, number>, levels: Record<string, number>, pts: number[], data = defaultData, heroId?: string): Plan[] {
  const entry = sim.entry;
  const tough = (t: string) => data.troops[t].levels[(levels[t] ?? 1) - 1].hp / data.troops[t].housing;
  const order = Object.keys(army).filter((t) => army[t] > 0).sort((a, b) => tough(b) - tough(a) || (a < b ? -1 : 1));
  const used = entry.points.map(() => 0);
  const out: Plan[] = [];
  let tick = 0;
  for (const troop of order) {
    const h = data.troops[troop].housing;
    for (let k = 0; k < army[troop]; k++) {
      const fits = (i: number) => used[i] + h <= entry.cover;
      let pick = -1;
      for (const i of pts) if (fits(i) && (pick < 0 || used[i] < used[pick])) pick = i;
      if (pick < 0) { for (let i = 0; i < entry.points.length; i++) if (fits(i)) { pick = i; break; } }
      if (pick < 0) break;
      used[pick] += h;
      const p = entry.points[pick];
      out.push({ tick: tick + Math.floor(k / 2), troop, x: Math.floor(p.x), y: Math.floor(p.y) });
    }
    tick += Math.ceil(army[troop] / 2) + 10;
  }
  if (heroId) { const p = entry.points[pts[0]]; out.push({ tick: 5, troop: heroId, x: Math.floor(p.x), y: Math.floor(p.y) }); }
  return out;
}
export function run(setup: any, plan: Plan[], data = defaultData) {
  const sim = B.createBattle(setup, data);
  const byTick = B.deploymentsByTick(plan);
  while (!sim.ended) B.step(sim, byTick.get(sim.tick));
  return { sim, r: B.result(sim) };
}
/** Rim-ordered triples of points (each point with its two neighbours). */
export function triples(sim: any): number[][] {
  const pts = sim.entry.points; const n = pts.length; const c = sim.grid.size / 2;
  const rim = pts.map((p: any, i: number) => ({ i, a: Math.atan2(p.y - c, p.x - c) })).sort((a: any, b: any) => a.a - b.a).map((p: any) => p.i);
  return rim.map((_: number, k: number) => [rim[k], rim[(k + 1) % n], rim[(k + n - 1) % n]]);
}
export const mean = (a: number[]) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
