import { open } from './load.mjs';
const s = await open();
try {
  const { defaultData: data } = await s.load('/src/gameplay/sim/data.ts');
  const PC = await s.load('/src/gameplay/sim/plannedContent.ts');
  const P = await s.load('/src/gameplay/sim/progression.ts');
  const pv = PC.withPreview(data);
  const sum = (c) => Object.entries(c).map(([k, v]) => `${k}:${v}`).join(',');
  for (const id of PC.previewBuildingIds()) {
    const def = pv.buildings[id];
    const e = P.BUILDINGS.find((b) => b.id === id);
    const first = def.levels[0], last = def.levels[def.levels.length - 1];
    const limits = pv.hall.levels.map((h) => h.limits[id] ? `${h.limits[id].count}x L${h.limits[id].maxLevel}` : '-');
    console.log(`${id.padEnd(22)} cat ${def.category.padEnd(8)} size ${def.size} levels ${def.levels.length} L1 hp ${first.hp} dmg ${first.damage ?? '-'} cost ${sum(first.cost)} ${first.buildSeconds}s | Lmax hp ${last.hp} dmg ${last.damage ?? '-'} cost ${sum(last.cost)} ${Math.round(last.buildSeconds/3600)}h | combat ${JSON.stringify(def.combat ?? null)} | effect ${JSON.stringify(def.effect ?? null)}`);
    console.log(`   limits by Keep: ${limits.join(' ')}`);
  }
  for (const id of PC.previewHeroIds()) {
    const h = pv.battle.heroes[id];
    console.log(id, 'unlock', h.unlockKeep, 'air', h.air, 'range', h.range, 'speed', h.speed, 'interval', h.attackIntervalTicks, 'prefers', h.prefers, 'levels', h.levels.map((l) => `${l.hp}/${l.damage}`).join(' '));
  }
  const sc = data.battle.heroes.shadow_captain;
  console.log('shadow_captain', sc.levels.map((l) => `${l.hp}/${l.damage}`).join(' '));
  // live comparison: Kunai tower and shuriken at max
  for (const id of ['acorn_cannon', 'wasp_nest', 'bitter_incense_burner', 'paper_lantern_line', 'longbow_yagura', 'burrow_barracks', 'thorn_snare', 'bramble_hedge']) {
    const d = data.buildings[id]; const l = d.levels[d.levels.length - 1];
    console.log(`LIVE ${id.padEnd(22)} levels ${d.levels.length} Lmax hp ${l.hp} dmg ${l.damage ?? '-'} cost ${sum(l.cost)} combat ${JSON.stringify(d.combat ?? null)} effect ${JSON.stringify(d.effect ?? null).slice(0, 200)}`);
  }
  console.log('features in preview', JSON.stringify(pv.features), 'features in shipped', JSON.stringify(data.features));
} finally { await s.close(); }
