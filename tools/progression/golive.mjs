// SIM_RULES 10 (2026-11-25): make planned content live. Moves each named building or hero from data/planned.json into
// the live data exactly as `withPreview` defines it (sim/plannedContent.ts): buildings.json (the derived level table,
// with the reference building's build-time cap), hall.json (the Keep limits `buildingMaxLevelAt` gives a planned
// building), the catalog's `live` flag, battle.json `heroes`; then drops it from planned.json. `features` from
// planned.json moves into sim/data.ts by hand (the Hero Hall's `heroChoice`). Run `npm run rules:snapshot` BEFORE
// the SIM_RULES bump that this needs, then the go-live gate and the balance suite.
// Usage: node tools/progression/golive.mjs <id> [<id> ...]
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'vite';

const ids = process.argv.slice(2);
if (!ids.length) throw new Error('usage: golive.mjs <buildingOrHeroId> [...]');
const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p, v) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n');
/** planned.json's own style: an object or array whose one-line form fits 160 characters stays on one line. */
function compact(v, indent = '') {
  const flat = JSON.stringify(v, null, 1).replace(/\n\s*/g, ' ').replace(/\[ /g, '[').replace(/ \]/g, ']');
  if (typeof v !== 'object' || v === null || indent.length + flat.length <= 160) return flat;
  const inner = indent + '  ';
  if (Array.isArray(v)) return `[\n${v.map((x) => inner + compact(x, inner)).join(',\n')}\n${indent}]`;
  // Plain fields share a line ("ref": ..., "hpMult": ...); comments and nested objects take their own.
  const lines = [];
  let run = [];
  const flush = () => { if (run.length) lines.push(inner + run.join(', ')); run = []; };
  for (const [k, x] of Object.entries(v)) {
    const item = `${JSON.stringify(k)}: ${compact(x, inner)}`;
    if (k.startsWith('$') || (typeof x === 'object' && x !== null)) { flush(); lines.push(inner + item); } else run.push(item);
  }
  flush();
  return `{\n${lines.join(',\n')}\n${indent}}`;
}
const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error', configFile: false });
try {
  const pc = await server.ssrLoadModule('/src/gameplay/sim/plannedContent.ts');
  const prog = await server.ssrLoadModule('/src/gameplay/sim/progression.ts');
  const { defaultData: data } = await server.ssrLoadModule('/src/gameplay/sim/data.ts');
  const buildings = read('src/gameplay/data/buildings.json');
  const hall = read('src/gameplay/data/hall.json');
  const progression = read('src/gameplay/data/progression.json');
  const battle = read('src/gameplay/data/battle.json');
  const planned = read('src/gameplay/data/planned.json');
  for (const id of ids) {
    if (planned.buildings[id]) {
      const spec = planned.buildings[id];
      const def = pc.previewBuildingDef(id, data);
      const ref = data.buildings[spec.ref];
      const live = { name: def.name, $comment: `Live from SIM_RULES 10 (2026-11-25): derived from ${spec.ref} as planned.json described (${spec.$comment ?? 'hpMult/damageMult/costMult'}).`, ...(ref.buildCapSeconds ? { buildCapSeconds: ref.buildCapSeconds } : {}), ...def };
      buildings[id] = live;
      const entry = prog.BUILDINGS.find((b) => b.id === id);
      hall.levels.forEach((h, i) => {
        const max = prog.buildingMaxLevelAt(entry, i + 1);
        if (max > 0) h.limits[id] = { count: spec.count, maxLevel: max };
      });
      progression.buildingCatalog.find((b) => b.id === id).live = true;
      delete planned.buildings[id];
      console.log(`building ${id}: ${def.levels.length} levels, Keep ${entry.unlockKeep}+`);
    } else if (planned.heroes[id]) {
      battle.heroes[id] = pc.previewHeroDef(id, data);
      delete planned.heroes[id];
      console.log(`hero ${id}: ${battle.heroes[id].levels.length} levels from Keep ${battle.heroes[id].unlockKeep}`);
    } else throw new Error(`${id} is not in planned.json`);
  }
  write('src/gameplay/data/buildings.json', buildings);
  write('src/gameplay/data/hall.json', hall);
  write('src/gameplay/data/progression.json', progression);
  write('src/gameplay/data/battle.json', battle);
  writeFileSync('src/gameplay/data/planned.json', compact(planned) + '\n');
} finally {
  await server.close();
}
