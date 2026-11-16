import { defaultData, lab } from './common.ts';
// Candidate fixes measured with the game's own army lab (same cells as army-lab.test.ts outcome gates).
// REPO must point at the patched scratch copy. argv: variant list
const variants: Record<string, (d: any) => void> = {
  live: () => {},
  supportFights: (d) => { d.battle.warriorRules.supportFights = true; },
  noJamChase: (d) => { d.battle.warriorRules.noJamChase = true; },
  storm25: (d) => { d.troops.shuriken_storm.kit.radius = 2.5; },
  wall4: (d) => { d.battle.wallHp = 4; },
  wall2: (d) => { d.battle.wallHp = 2; },
  siegeDef: (d) => { for (const t of ['ram_crew', 'fire_monk', 'volcano_cannoneer']) d.troops[t].prefers = 'defense'; },
  siegeSpeed: (d) => { for (const t of ['ram_crew', 'fire_monk', 'bomb_carrier', 'volcano_cannoneer']) d.troops[t].speed = 0.17; },
  combo: (d) => { d.battle.warriorRules.supportFights = true; d.troops.shuriken_storm.kit.radius = 2.5; for (const t of ['ram_crew', 'fire_monk', 'bomb_carrier', 'volcano_cannoneer']) d.troops[t].speed = 0.17; },
  half15: (d) => { d.battle.warriorRules.supportFights = true; d.battle.warriorRules.supportStrike = 0.5; d.troops.shuriken_storm.kit.radius = 2.5; for (const t of ['ram_crew', 'fire_monk', 'bomb_carrier', 'volcano_cannoneer']) d.troops[t].speed = 0.15; },
  half17late: (d) => { d.battle.warriorRules.supportFights = true; d.battle.warriorRules.supportStrike = 0.5; d.troops.shuriken_storm.kit.radius = 2.5; for (const t of ['fire_monk', 'bomb_carrier', 'volcano_cannoneer']) d.troops[t].speed = 0.17; },
  all3: (d) => { d.battle.warriorRules.supportFights = true; d.battle.warriorRules.noJamChase = true; d.troops.shuriken_storm.kit.radius = 2.5; },
};
const want = (process.argv[2] ?? 'live,supportFights').split(',');
const keeps = (process.argv[3] ?? '7,8,15').split(',').map(Number);
const only = process.argv[4]?.split(','); const comps = lab.COMPOSITIONS.filter((c: any) => !only || only.includes(c.id));
console.log(`cells: mean destruction % over layouts random,kunai_ring,mortar_core x 2 seeds (the army-lab gate cells), no hero, game bot plan`);
for (const v of want) {
  const d = structuredClone(defaultData); variants[v](d);
  const rows = lab.runLab({ keeps, layouts: ['random', 'kunai_ring', 'mortar_core'], seeds: 2, data: d, compositions: comps });
  const cell = (c: string, k: number) => { const r = rows.filter((x: any) => x.comp === c && x.keep === k); return r.reduce((s: number, x: any) => s + x.destruction, 0) / r.length; };
  const c3 = (c: string, k: number) => { const r = rows.filter((x: any) => x.comp === c && x.keep === k); return r.reduce((s: number, x: any) => s + x.threeStar, 0) / r.length; };
  for (const k of keeps) console.log(`${v.padEnd(14)} K${k}: ` + comps.map((c: any) => `${c.id} ${cell(c.id, k).toFixed(1)}(${Math.round(100 * c3(c.id, k))})`).join(' | '));
}
