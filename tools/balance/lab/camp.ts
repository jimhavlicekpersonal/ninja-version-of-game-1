// One model-player campaign with a data patch. Usage: camp.ts <campaign id> <patch.json|-> <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
const REPO = process.env.REPO ?? '../../..';
const { defaultData } = await import(`${REPO}/src/gameplay/sim/data`);
const c = await import(`./campaignLab`);
const data = structuredClone(defaultData);
if (process.argv[3] !== '-') for (const [path, value] of Object.entries(JSON.parse(readFileSync(process.argv[3], 'utf8')))) {
  const keys = path.split('.'); let o: any = data;
  for (const k of keys.slice(0, -1)) { if (o[k] === undefined) o[k] = {}; o = o[k]; }
  o[keys.at(-1)!] = value;
}
// Optional 5th argument: a lab rules file (battle patch, building patch, warrior strength by Keep). The overall
// strength multiplier applies only from the levels a Keep 6 player can reach, so the first five Keeps play as today.
if (process.argv[5]) {
  const R = JSON.parse(readFileSync(process.argv[5], 'utf8'));
  const { troopLevelCapAt } = await import(`${REPO}/src/gameplay/sim/research`);
  for (const [path, value] of Object.entries(R.patch ?? {})) { const keys = path.split('.'); let o: any = data; for (const k of keys.slice(0, -1)) { if (o[k] === undefined) o[k] = {}; o = o[k]; } o[keys.at(-1)!] = value; }
  for (const [type, m] of Object.entries((R.buildingPatch ?? {}) as Record<string, any>)) { const def: any = data.buildings[type]; if (!def) continue;
    for (const lv of def.levels) { if (m.dmg && lv.damage) lv.damage *= m.dmg; if (m.hp && lv.hp) lv.hp *= m.hp; }
    if (m.interval && def.combat) def.combat = { ...def.combat, fireIntervalTicks: Math.max(1, Math.round(def.combat.fireIntervalTicks * m.interval)) }; }
  const all = R.troopPatch?.all?.hp ?? 1; const seen = new Set<string>();
  for (const t of Object.keys(data.troops)) { const def: any = data.troops[t]; const from = Math.min(troopLevelCapAt(6, data, t), def.levels.length) - 1;
    for (let li = Math.max(0, from); li < def.levels.length; li++) { def.levels[li].hp *= all; def.levels[li].damage *= all; }
    def.cls = def.air ? 'flyer' : def.housing <= 1 ? 'light' : def.housing === 2 ? 'skirmisher' : 'heavy'; }
  for (const [k, m] of Object.entries((R.troopPatchByKeep ?? {}) as Record<string, Record<string, number>>)) for (const [t, v] of Object.entries(m)) { const def: any = data.troops[t]; if (!def) continue;
    const li = Math.min(troopLevelCapAt(Number(k), data, t), def.levels.length) - 1; const key = `${t}|${li}`; if (seen.has(key)) continue; seen.add(key); def.levels[li].hp *= v; def.levels[li].damage *= v; }
}
const spec0 = c.CAMPAIGNS.find((x: any) => x.id === process.argv[2]);
const spec = { ...spec0, opts: { ...spec0.opts, ...(process.env.PILOT ? { pilot: process.env.PILOT } : {}), ...(process.env.REP ? { rep: Number(process.env.REP) } : {}) } };
const t0 = Date.now();
const r = await c.runCampaign(spec, data);
writeFileSync(process.argv[4], JSON.stringify(r));
console.error(process.argv[2], 'done in', ((Date.now() - t0) / 1000).toFixed(0), 's; keys', Object.keys(r).join(','));
