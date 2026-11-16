import { defaultData } from '/src/gameplay/sim/data';
import { withPreview } from '/src/gameplay/sim/plannedContent';
import { BUILDINGS, buildingMaxLevelAt, masteryXpTotal, masteryBonus, battleMasteryXp } from '/src/gameplay/sim/progression';
import { heroAtKeep } from '/src/gameplay/sim/heroes';
import { maxHousingAtHall } from '/src/gameplay/sim/army';
export async function run(): Promise<string> {
  const d = withPreview(defaultData);
  const L: string[] = [];
  const e = BUILDINGS.find((b) => b.id === 'hero_shrine')!;
  const def = d.buildings.hero_shrine;
  L.push(`hero_shrine levels ${def.levels.length} unlockKeep ${e.unlockKeep} pinnacle ${e.pinnacleMaxLevel}`);
  let cum: Record<string, number> = {};
  for (let k = 7; k <= 15; k++) {
    const max = buildingMaxLevelAt(e, k);
    const auto = heroAtKeep(k, defaultData);
    const heroes = Object.entries(d.battle.heroes!).filter(([, h]) => k >= h.unlockKeep).map(([id, h]) => `${id}:keepLvl${Math.min(h.levels.length, k - h.unlockKeep + 1)}`);
    L.push(`Keep ${k}: hall max level ${max}; automatic hero ${auto?.id} L${auto?.level}; choosable ${heroes.join(', ')}`);
  }
  for (const lv of def.levels) { for (const [r, v] of Object.entries(lv.cost)) cum[r] = (cum[r] ?? 0) + (v as number); L.push(`hall L${lv.level}: cost ${JSON.stringify(lv.cost)} build ${(lv.buildSeconds / 3600).toFixed(1)}h hp ${lv.hp} | cumulative ${JSON.stringify(cum)}`); }
  L.push('--- mastery curve');
  for (const m of [1, 3, 5, 8, 10, 15, 20, 25, 30, 40]) L.push(`M${m}: total XP ${Math.round(masteryXpTotal(m))} bonus +${(masteryBonus(m) * 100).toFixed(1)}%`);
  for (const k of [3, 6, 9, 12, 15]) { const h = maxHousingAtHall(k, defaultData); L.push(`Keep ${k}: housing ${h}; a mono-type 3-star raid earns ${battleMasteryXp(h, 3)} XP, a 4-type even mix ${battleMasteryXp(h / 4, 3)} per type, 1-star ${battleMasteryXp(h, 1)}`); }
  for (const id of Object.keys(d.buildings)) { if (!defaultData.buildings[id]) { const b = d.buildings[id]; const l1 = b.levels[0], lm = b.levels[b.levels.length - 1]; L.push(`${id}: size ${b.size} levels ${b.levels.length} L1 hp ${l1.hp} dmg ${l1.damage ?? '-'} cost ${JSON.stringify(l1.cost)} | Lmax hp ${lm.hp} dmg ${lm.damage ?? '-'} cost ${JSON.stringify(lm.cost)} effect ${JSON.stringify(b.effect ?? null)}`); } }
  return L.join('\n');
}
