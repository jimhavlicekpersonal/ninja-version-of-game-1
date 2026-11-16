const REPO = '../../..';
const { defaultData: data, levelDef } = await import(`${REPO}/src/gameplay/sim/data`);
const FORT = ['acorn_cannon', 'wasp_nest', 'pinecone_catapult', 'firefly_tower', 'thorn_snare', 'sap_puddle', 'paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura'];
const tot = (c: any) => Object.entries(c ?? {}).filter(([k]) => k === 'acorns' || k === 'dew').reduce((a, [, v]) => a + (v as number), 0);
let keepH = 0, defH = 0, keepC = 0, defC = 0; const rows: string[] = [];
for (let k = 1; k <= 14; k++) {
  let cost = 0, hours = 0;
  for (const t of FORT) {
    const now = data.hall.levels[k - 1].limits[t] ?? { count: 0, maxLevel: 0 }; const prev = data.hall.levels[k - 2]?.limits[t] ?? { count: 0, maxLevel: 0 };
    for (let i = 0; i < now.count; i++) for (let l = (i < prev.count ? prev.maxLevel : 0) + 1; l <= now.maxLevel; l++) { const d: any = levelDef(data, t, l); if (!d) continue; cost += tot(d.cost); hours += (d.buildSeconds ?? 0) / 3600; }
  }
  const hall: any = levelDef(data, 'elder_toadstool', k + 1);
  keepH += (hall?.buildSeconds ?? 0) / 3600; keepC += tot(hall?.cost); defH += hours; defC += cost;
  rows.push(`K${k}→${k + 1}: Keep ${(tot(hall?.cost) / 1e6).toFixed(1)}M ${((hall?.buildSeconds ?? 0) / 3600).toFixed(0)}h | defences ${(cost / 1e6).toFixed(1)}M ${hours.toFixed(0)} builder-h`);
}
console.log(rows.slice(8).join('\n'));
console.log(`total Keep 1→15: ${(keepC / 1e6).toFixed(0)}M, ${(keepH / 24).toFixed(1)} days of Keep building | all defences to Keep 14 cap: ${(defC / 1e6).toFixed(0)}M, ${(defH / 24).toFixed(0)} builder-days`);
