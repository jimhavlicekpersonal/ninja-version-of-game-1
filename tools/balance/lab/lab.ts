// Real-simulator lab: armies x bases x seeds x deployment plans -> destruction and stars.
// Usage: REPO=/path node --import ./register.mjs lab.ts config.json out.json [shard n]
import { readFileSync, writeFileSync } from 'node:fs';
const REPO = process.env.REPO ?? '../../..';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const { createBattle, deploymentsByTick, result: battleResult, step } = await import(`${REPO}/src/gameplay/sim/battle/battle`);
const { LAYOUTS, generateOpponent } = await import(`${REPO}/src/gameplay/sim/battle/basegen`);
const { temperBase } = await import(`${REPO}/src/gameplay/sim/battle/temper`);
const { botDeployments } = await import(`${REPO}/src/gameplay/sim/defense`);
const { botArmy } = await import(`${REPO}/src/gameplay/sim/matchmaking`);
const { troopLevelCapAt } = await import(`${REPO}/src/gameplay/sim/research`);
const { createRng } = await import(`${REPO}/src/gameplay/sim/rng`);
const { maxHousingAtHall } = await import(`${REPO}/src/gameplay/sim/army`);
const lab = await import(`${REPO}/tools/balance/armyLab`);

const cfg = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const shard = Number(process.argv[4] ?? 0), shards = Number(process.argv[5] ?? 1);
const data = structuredClone(defaultData);
for (const [path, value] of Object.entries(cfg.patch ?? {})) {
  const keys = path.split('.'); let o: any = data;
  for (const k of keys.slice(0, -1)) { if (o[k] === undefined) o[k] = {}; o = o[k]; }
  o[keys.at(-1)!] = value;
}
const roster = JSON.parse(readFileSync(`${REPO}/src/gameplay/data/roster.json`, 'utf8')).warriors as any[];
const roleOf: Record<string, string> = {};
for (const w of roster) roleOf[w.liveTroop ?? w.id] = w.role;
function newestOfRole(role: string, keep: number): string | null {
  const ids = Object.keys(data.troops).filter((t) => roleOf[t] === role && lab.troopKeep(t, data) <= keep);
  ids.sort((x, y) => lab.troopKeep(y, data) - lab.troopKeep(x, data));
  return ids[0] ?? null;
}
function roleArmy(shares: Record<string, number>, keep: number, scale = 1): Record<string, number> | null {
  const housing = Math.floor(maxHousingAtHall(keep, data) * scale);
  const out: Record<string, number> = {}; let used = 0; const picks: string[] = [];
  const total = Object.values(shares).reduce((s, v) => s + v, 0);
  for (const [role, share] of Object.entries(shares)) {
    if (share <= 0) continue;
    const t = newestOfRole(role, keep); if (!t) return null;
    const n = Math.floor((housing * share / total) / data.troops[t].housing);
    if (n > 0) { out[t] = (out[t] ?? 0) + n; used += n * data.troops[t].housing; }
    picks.push(t);
  }
  picks.sort((x, y) => data.troops[x].housing - data.troops[y].housing);
  for (let guard = 0; guard < 500; guard++) { const t = picks.find((x) => used + data.troops[x].housing <= housing); if (!t) break; out[t] = (out[t] ?? 0) + 1; used += data.troops[t].housing; picks.push(picks.shift()!); }
  return Object.keys(out).length ? out : null;
}
for (const [type, m] of Object.entries((cfg.buildingPatch ?? {}) as Record<string, { dmg?: number; interval?: number; hp?: number }>)) {
  const def = data.buildings[type] as any; if (!def) continue;
  for (const lv of def.levels) { if (m.dmg && lv.damage) lv.damage *= m.dmg; if (m.hp && lv.hp) lv.hp *= m.hp; }
  if (m.interval && def.combat) def.combat = { ...def.combat, fireIntervalTicks: Math.max(1, Math.round(def.combat.fireIntervalTicks * m.interval)) };
}
function army(spec: any, keep: number): Record<string, number> | null {
  if (spec.troops) return spec.troops;
  if (spec.roles) return roleArmy(spec.roles, keep, spec.scale ?? 1);
  if (spec.id === 'mixed' || spec.mixed) return botArmy(keep, 1, data);
  return lab.buildArmy({ id: spec.id, name: spec.id, shares: spec.shares }, keep, data);
}
if (cfg.troopPatch) for (const [id, mult] of Object.entries(cfg.troopPatch as Record<string, { hp?: number; dmg?: number }>)) {
  for (const t of Object.keys(data.troops)) {
    const def = data.troops[t];
    const fam = lab.familyOf(def);
    if (id !== 'all' && t !== id && fam !== id && `role:${roleOf[t]}` !== id) continue;
    for (const lv of def.levels) { if (mult.hp) lv.hp *= mult.hp; if (mult.dmg) lv.damage *= mult.dmg; }
  }
}
// Per-Keep tuning: a multiplier on the one level a warrior fights at when it is researched to that Keep's cap
// (levels are distinct per Keep, so this is a retuned level curve). First Keep to claim a level wins.
if (cfg.troopPatchByKeep) { const seen = new Set<string>();
  for (const [k, m] of Object.entries(cfg.troopPatchByKeep as Record<string, Record<string, number>>)) for (const [t, v] of Object.entries(m)) {
    const def = data.troops[t]; if (!def) continue;
    const li = Math.min(troopLevelCapAt(Number(k), data, t), def.levels.length) - 1; const key = `${t}|${li}`;
    if (seen.has(key)) continue; seen.add(key);
    def.levels[li].hp *= v; def.levels[li].damage *= v;
  } }
// warrior class for tuned towers: flyer, vanguard (guardian role), backline (range >= 3), melee
for (const t of Object.keys(data.troops)) {
  const d = data.troops[t] as any;
  d.cls = cfg.classes === 'role' ? (d.air ? 'flyer' : roleOf[t] === 'guardian' ? 'vanguard' : d.range >= 3 ? 'backline' : 'melee') : (d.air ? 'flyer' : d.housing <= 1 ? 'light' : d.housing === 2 ? 'skirmisher' : 'heavy');
}
// Formation (lab): an army with at least `threshold` of its housing in one class gets `bonus` on that class.
function formationData(arm: Record<string, number>): any {
  const f = cfg.formation; if (!f) return data;
  const share: Record<string, number> = {}; let total = 0;
  for (const [t, n] of Object.entries(arm)) { const d = data.troops[t] as any; share[d.cls] = (share[d.cls] ?? 0) + d.housing * n; total += d.housing * n; }
  const cls = Object.keys(share).find((c) => share[c] / total >= f.threshold);
  if (!cls) return data;
  const out = { ...data, troops: { ...data.troops } };
  for (const t of Object.keys(arm)) { const d = data.troops[t] as any; if (d.cls !== cls) continue; out.troops[t] = { ...d, levels: d.levels.map((lv: any) => ({ ...lv, hp: lv.hp * (1 + f.bonus), damage: lv.damage * (1 + f.bonus) })) }; }
  return out;
}
// ---- plan bot: deployment plans a player could choose between -------------------------------------------
const { troopDef, troopLevel } = await import(`${REPO}/src/gameplay/sim/data`).then((m: any) => m).catch(() => ({} as any));
function planList(): { id: string; focus: number; shape: string; order: string; smoke: string }[] {
  const out = [];
  for (let f = 0; f < 6; f++) for (const shape of cfg.shapes ?? ['cluster']) for (const order of cfg.orders ?? ['tanks']) for (const smoke of cfg.smokes ?? ['none'])
    out.push({ id: `f${f}|${shape}|${order}|${smoke}`, focus: f, shape, order, smoke });
  return out;
}
function planDeploy(sim: any, arm: Record<string, number>, levels: Record<string, number>, d: any, plan: any): any[] {
  const entry = sim.entry; if (!entry) return [];
  const P = entry.points; const np = P.length; const f = plan.focus % np;
  const size = sim.grid.size; const cx = size / 2, cy = size / 2;
  // order points clockwise by angle so "adjacent" means neighbours on the rim
  const ang = P.map((p: any, i: number) => ({ i, a: Math.atan2(p.y - cy, p.x - cx) })).sort((x: any, y: any) => x.a - y.a).map((x: any) => x.i);
  const at = (k: number) => ang[((k % np) + np) % np];
  const groups: number[][] = plan.shape === 'pincer' ? [[at(f), at(f + 1)], [at(f + 3), at(f + 4)]] : plan.shape === 'point' ? [[at(f)]] : [[at(f), at(f + 1), at(f - 1)]];
  const tough = (t: string) => d.troops[t].levels[(levels[t] ?? 1) - 1].hp / d.troops[t].housing;
  const order = Object.keys(arm).filter((t) => arm[t] > 0).sort((a, b) => tough(b) - tough(a) || (a < b ? -1 : 1));
  const used = P.map((p: any) => p.used);
  const out: any[] = []; let tick = 0; let g = 0;
  const totalH = order.reduce((s2, t) => s2 + d.troops[t].housing * arm[t], 0); let placedH = 0;
  for (const troop of order) {
    const h = d.troops[troop].housing;
    for (let k = 0; k < arm[troop]; k++) {
      const grp = groups[g % groups.length]; g++;
      const fits = (i: number) => used[i] + h <= entry.cover;
      let pick = -1;
      for (const i of grp) if (fits(i) && (pick < 0 || used[i] < used[pick])) pick = i;
      if (pick < 0) { const near = [...Array(np).keys()].sort((x, y) => Math.hypot(P[x].x - P[grp[0]].x, P[x].y - P[grp[0]].y) - Math.hypot(P[y].x - P[grp[0]].x, P[y].y - P[grp[0]].y)); pick = near.find(fits) ?? -1; }
      if (pick < 0) break;
      used[pick] += h; placedH += h;
      const late = plan.order === 'reserve' && placedH > totalH * 0.65 ? 300 : 0;
      const t0 = plan.order === 'rush' ? Math.floor(k / 4) : tick + Math.floor(k / 2);
      out.push({ tick: t0 + late, troop, x: Math.floor(P[pick].x), y: Math.floor(P[pick].y) });
    }
    if (plan.order !== 'rush') tick += Math.ceil(arm[troop] / 2) + 10;
  }
  if (plan.smoke !== 'none') {
    const p0 = P[groups[0][0]]; const dist = Math.hypot(cx - p0.x, cy - p0.y); const n3 = sim.charges?.smoke_bomb ?? 0;
    const fr = plan.smoke === 'core' ? [0.75, 0.85, 0.95] : [0.3, 0.55, 0.8];
    for (let k = 0; k < n3; k++) {
      const fx = fr[k] ?? 0.8; const arrive = Math.round((dist * fx) / 0.14);
      out.push({ tick: Math.max(1, arrive - 10 + (plan.smoke === 'core' ? k * 75 : 0)), troop: 'smoke_bomb', x: Math.floor(p0.x + (cx - p0.x) * fx), y: Math.floor(p0.y + (cy - p0.y) * fx) });
    }
  }
  return out;
}
const rows: any[] = [];
let n = 0; const t0 = Date.now();
for (const keep of cfg.keeps) {
  for (const a of cfg.armies) {
    const arm = army(a, keep); if (!arm) continue;
    const levels = Object.fromEntries(Object.keys(arm).map((t) => [t, troopLevelCapAt(keep, data, t)]));
    const adata = formationData(arm);
    for (const b of cfg.bases) {
      const layout = LAYOUTS.find((l: any) => l.id === b.layout);
      for (let i = (cfg.seedBase ?? 0); i < (cfg.seedBase ?? 0) + cfg.seeds; i++) {
        if ((n++) % shards !== shard) continue;
        const base = generateOpponent(5000 + (i + (b.seedOffset ?? 0)) * 7919 + keep * 131, keep, data, { levelBias: b.levelBias ?? 0.5, layout });
        if (b.temper) temperBase(base, b.temper, data);
        if (b.wallPower !== undefined) (base as any).wallPower = b.wallPower;
        const plans = cfg.planner === 'search' ? planList() : null;
        for (let p = 0; p < (plans ? plans.length : (cfg.plans ?? 1)); p++) {
          const sim = createBattle({ seed: 77 + i, base, army: arm, levels, infiltration: true }, adata);
          const byTick = deploymentsByTick(plans ? planDeploy(sim, arm, levels, adata, plans[p]) : botDeployments(sim.deployable, sim.grid.size, arm, createRng(13 + i + p * 1009), adata, levels, sim.entry));
          while (!sim.ended) step(sim, byTick.get(sim.tick));
          const r = battleResult(sim);
          rows.push({ keep, army: a.id, base: b.id, seed: i, plan: plans ? plans[p].id : p, d: Math.round(r.destruction * 10) / 10, s: r.stars, left: sim.troops.filter((t: any) => !t.dead).length, dep: sim.troops.length });
        }
      }
    }
  }
}
if (shard === 0) {
  const meta: any = {};
  for (const keep of cfg.keeps) for (const a of cfg.armies) { const arm = army(a, keep); if (arm) meta[`${keep}|${a.id}`] = arm; }
  writeFileSync(process.argv[3].replace(/\.\d+$/, '') + '.meta', JSON.stringify(meta));
}
writeFileSync(process.argv[3], JSON.stringify(rows));
console.error(`${rows.length} battles in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
