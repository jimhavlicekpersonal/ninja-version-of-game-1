import { defaultData, B, LAYOUTS, generateOpponent, temperBase, heroAtKeep, levelsFor, planFrom, run, triples, mean } from './common.ts';
// Mono-army trims at Keep 15: Eclipse and Dragon Kite damage scale, vs plain and the answering temper.
const keep = 15; const hero = heroAtKeep(keep, defaultData);
const profiles: Record<string, any> = { plain: null, blast: { acorn_cannon: { blast: 10 }, wasp_nest: { reach: 5, watch: 5 } }, watch: { acorn_cannon: { watch: 10 }, wasp_nest: { watch: 10 } } };
function cell(army: Record<string, number>, data: any, tempers: any) {
  const levels = levelsFor(army, keep, data); const m: number[] = []; const b: number[] = []; const s3: number[] = [];
  for (const layout of LAYOUTS) for (let i = 0; i < 2; i++) {
    const base = generateOpponent(9100 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout }); if (tempers) temperBase(base, tempers, data);
    const setup = { seed: 600 + i, base, army, levels, infiltration: true, hero };
    const probe = B.createBattle(setup, data); const tr = triples(probe);
    const rs = [tr[0], tr[2], tr[4 % tr.length]].map((pts) => run(setup, planFrom(probe, army, levels, pts, data, hero!.id), data).r);
    m.push(mean(rs.map((r) => r.destruction))); b.push(Math.max(...rs.map((r) => r.destruction))); s3.push(mean(rs.map((r) => (r.stars === 3 ? 1 : 0))));
  }
  return `${mean(m).toFixed(0)}/${mean(b).toFixed(0)} (3* ${Math.round(100 * mean(s3))}%)`;
}
for (const [troop, n, scales] of [['eclipse_ninja', 180, [1, 0.85, 0.75, 0.65]], ['dragon_kite_armada', 90, [1, 0.85, 0.75]]] as [string, number, number[]][]) {
  for (const sc of scales) {
    const data = structuredClone(defaultData); for (const lv of data.troops[troop].levels) lv.damage *= sc;
    console.log(`${n}x ${troop} damage x${sc}: ` + Object.entries(profiles).map(([pn, t]) => `${pn} ${cell({ [troop]: n }, data, t)}`).join(' | '));
  }
}
