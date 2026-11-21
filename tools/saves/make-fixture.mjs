// Beast Mode 2026-11-21 SAV-09: write a real save fixture with the game code of one version.
//
//   node tools/saves/make-fixture.mjs <checkout-root> <out.json> [keep]
//
// <checkout-root> is a checkout of the commit whose SAVE_VERSION the fixture is for (a git worktree; give it a
// node_modules, e.g. a symlink to this one). The script loads that checkout's own simulation through Vite (no build)
// and plays a scripted village: Keep upgrades with the time they take, every building the Keep allows, warriors
// trained and saved as an army, the daily chest. Every command goes through that version's applyCommand, so the
// file is exactly what that version writes. Policy: each SAVE_VERSION bump adds the fixture of the version it leaves.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const [root, out, keepArg] = process.argv.slice(2);
if (!root || !out) throw new Error('usage: node tools/saves/make-fixture.mjs <checkout-root> <out.json> [keep]');
const targetKeep = Number(keepArg) || 8;
const server = await createServer({ root: resolve(root), configFile: false, logLevel: 'error', server: { middlewareMode: true, hmr: false }, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] } });
try {
  const load = (p) => server.ssrLoadModule(resolve(root, p));
  const { createNewVillage, applyCommand, advance, hallLevel } = await load('src/gameplay/sim/village.ts');
  const { serialize, SAVE_VERSION } = await load('src/gameplay/sim/save.ts');
  const { defaultData: data } = await load('src/gameplay/sim/data.ts');
  const { canPlace } = await load('src/gameplay/sim/grid.ts');
  let t = Date.UTC(2026, 9, 1, 9);
  let s = createNewVillage(t, data);
  const run = (cmd) => {
    const r = applyCommand(s, cmd, t, data);
    if (r.ok) s = r.state;
    return r.ok;
  };
  const wait = (ms) => {
    t += ms;
    s = advance(s, t, data).state;
  };
  run({ type: 'setProfile', under18: false, ageBand: 'adult' });
  run({ type: 'openDailyChest' });
  const rich = () => (s = { ...s, resources: { ...s.resources, acorns: 5e7, dew: 5e7, nightsap: 5e6, moonstones: Math.max(s.resources.moonstones, 300) } });
  const placeAll = () => {
    const hl = data.hall.levels[hallLevel(s, data) - 1];
    for (const [type, lim] of Object.entries(hl.limits)) {
      const have = s.buildings.filter((b) => b.type === type).length;
      for (let n = have; n < lim.count; n++) {
        let placed = false;
        for (let y = 0; y < data.economy.mapSize && !placed; y++) for (let x = 0; x < data.economy.mapSize && !placed; x++) if (canPlace(s, data, type, x, y).ok) placed = run({ type: 'place', buildingType: type, x, y });
        if (!placed) break;
        rich();
        wait(2 * 86_400_000);
      }
    }
  };
  for (let guard = 0; hallLevel(s, data) < targetKeep && guard < 60; guard++) {
    rich();
    placeAll();
    const keep = s.buildings.find((b) => data.buildings[b.type].category === 'hall');
    run({ type: 'upgrade', id: keep.id });
    wait(25 * 86_400_000);
  }
  rich();
  placeAll();
  const troop = Object.keys(data.troops)[0];
  run({ type: 'train', troop, count: 10 });
  wait(6 * 3_600_000);
  run({ type: 'saveArmyPreset', name: 'Army 1', army: { [troop]: 10 } });
  run({ type: 'openDailyChest' });
  const file = serialize(s, t);
  writeFileSync(out, `${JSON.stringify(file)}\n`);
  console.log(`wrote ${out}: save version ${SAVE_VERSION}, Keep ${hallLevel(s, data)}, ${s.buildings.length} buildings`);
} finally {
  await server.close();
}
