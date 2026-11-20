import { open } from './load.mjs';
const s = await open();
try {
  const { defaultData: data } = await s.load('/src/gameplay/sim/data.ts');
  const PC = await s.load('/src/gameplay/sim/plannedContent.ts');
  const pv = PC.withPreview(data);
  // storage capacity per Keep: sum over storage buildings at max count/level + keep storage
  const capAt = (keep) => {
    const out = {};
    const lim = data.hall.levels[keep - 1].limits;
    for (const [id, l] of Object.entries(lim)) {
      const def = data.buildings[id]; if (!def) continue;
      const lv = def.levels[Math.min(l.maxLevel, def.levels.length) - 1];
      const st = lv?.storage; if (!st) continue;
      for (const [k, v] of Object.entries(st)) out[k] = (out[k] ?? 0) + v * l.count;
    }
    return out;
  };
  for (const k of [7, 9, 12, 13, 14, 15]) console.log('Keep', k, 'max storage', JSON.stringify(capAt(k)));
  // which preview levels cost more than the storage cap of the Keep that unlocks them
  for (const id of PC.previewBuildingIds()) {
    const def = pv.buildings[id];
    const bad = [];
    for (let keep = 1; keep <= 15; keep++) {
      const lim = pv.hall.levels[keep - 1].limits[id]; if (!lim) continue;
      const prev = keep > 1 ? pv.hall.levels[keep - 2].limits[id]?.maxLevel ?? 0 : 0;
      const cap = capAt(keep);
      for (let L = prev + 1; L <= lim.maxLevel; L++) {
        const c = def.levels[L - 1].cost;
        for (const [r, v] of Object.entries(c)) if (v > (cap[r] ?? 0)) bad.push(`L${L}@K${keep} ${r} ${v} > cap ${cap[r]}`);
      }
    }
    const total = {}; for (const lv of def.levels) for (const [r, v] of Object.entries(lv.cost)) total[r] = (total[r] ?? 0) + v;
    const count = pv.hall.levels[14].limits[id]?.count ?? 0;
    const days = def.levels.reduce((a, l) => a + l.buildSeconds, 0) / 86400;
    console.log(id.padEnd(22), 'total', JSON.stringify(total), 'x', count, 'build days each', days.toFixed(1), bad.length ? ' OVER CAP: ' + bad.join('; ') : '');
  }
  // total coin cost of all live defenses to max at Keep 15, for scale
  let liveTotal = 0, liveDays = 0;
  for (const [id, l] of Object.entries(data.hall.levels[14].limits)) {
    const def = data.buildings[id]; if (!def || !['defense', 'trap', 'support', 'hedge'].includes(def.category)) continue;
    for (const lv of def.levels.slice(0, l.maxLevel)) { liveTotal += (lv.cost.acorns ?? 0) * l.count; liveDays += lv.buildSeconds * l.count / 86400; }
  }
  let pvTotal = 0, pvDays = 0;
  for (const id of PC.previewBuildingIds()) { const def = pv.buildings[id]; const c = pv.hall.levels[14].limits[id]?.count ?? 0; for (const lv of def.levels) { pvTotal += (lv.cost.acorns ?? 0) * c; pvDays += lv.buildSeconds * c / 86400; } }
  console.log('live defensive buildings to max at Keep 15: coins', Math.round(liveTotal / 1e6) + 'M', 'builder-days', Math.round(liveDays));
  console.log('16 planned buildings to max at Keep 15: coins', Math.round(pvTotal / 1e6) + 'M', 'builder-days', Math.round(pvDays));
} finally { await s.close(); }
