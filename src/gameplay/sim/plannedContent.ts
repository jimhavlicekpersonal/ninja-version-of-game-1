/**
 * Content batch 2026-11-14: the designed-but-not-live content (the fifteen non-live counters, the Hero Hall
 * and the three non-live heroes) and the features behind flags (Warrior Mastery, hero choice), for playtesting.
 *
 * `withPreview(data)` returns a COPY of the game data with `data/planned.json` merged in; the shipped data
 * (`defaultData`) never contains any of it, so the live game, its replays, the server and every gate are
 * unchanged. It is used only by the testing sandbox (`?sandbox&preview`, main.ts) and by
 * `npm run balance:preview` (tools/balance/preview.ts).
 *
 * `playable: false` adds only the definitions (a sandbox village that already holds a preview building
 * still loads and fights), without the Keep limits that let one be placed, the heroes that can be chosen,
 * or the features.
 */
import planned from '../data/planned.json';
import { BUILDINGS, HEROES, buildingMaxLevelAt, type BuildingEntry } from './progression';
import { troopLevelCapAt } from './research';
import type { BuildingCategory, BuildingDef, BuildingEffect, CombatDef, Cost, FeatureFlags, GameData, LevelDef, TroopDef, TroopLevelDef, WarriorKit } from './types';

interface PreviewBuildingSpec {
  ref: string;
  hpMult: number;
  damageMult?: number;
  costMult: number;
  size: number;
  count: number;
  combat?: CombatDef;
  effect?: Partial<BuildingEffect>;
}

interface PreviewHeroSpec {
  ref: string;
  hpPerHousing: number;
  damagePerHousing: number;
  prefers?: TroopDef['prefers'];
  kit: WarriorKit;
}

interface PreviewFile {
  features: FeatureFlags;
  buildings: Record<string, PreviewBuildingSpec>;
  heroes: Record<string, PreviewHeroSpec>;
}

export const PREVIEW = planned as unknown as PreviewFile;

/** The non-live building ids withPreview adds (catalog order). */
export function previewBuildingIds(): string[] {
  return BUILDINGS.filter((b) => !b.live && PREVIEW.buildings[b.id]).map((b) => b.id);
}

/** The non-live hero ids withPreview adds (roster order). */
export function previewHeroIds(): string[] {
  return HEROES.filter((h) => PREVIEW.heroes[h.id]).map((h) => h.id);
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;
const scaleCost = (c: Cost, m: number): Cost => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round((v ?? 0) * m)])) as Cost;

function catalogEntry(id: string): BuildingEntry {
  const e = BUILDINGS.find((b) => b.id === id);
  if (!e) throw new Error(`planned.json names ${id}, which is not in the building catalog`);
  return e;
}

/** First Keep at which the catalog lets this building reach `level`. */
function keepForLevel(entry: BuildingEntry, level: number, keeps: number): number {
  for (let k = entry.unlockKeep; k <= keeps; k++) if (buildingMaxLevelAt(entry, k) >= level) return k;
  return keeps;
}

/** A preview building's level table, derived from its reference building (see planned.json `$comment`). */
export function previewLevels(id: string, data: GameData): LevelDef[] {
  const spec = PREVIEW.buildings[id];
  const entry = catalogEntry(id);
  const ref = data.buildings[spec.ref];
  if (!ref) throw new Error(`preview ${id}: unknown reference ${spec.ref}`);
  const keeps = data.hall.levels.length;
  const top = ref.levels.length;
  const out: LevelDef[] = [];
  let prevKeep = 0;
  let prevRef = 0;
  for (let level = 1; level <= entry.pinnacleMaxLevel; level++) {
    const keep = keepForLevel(entry, level, keeps);
    const atKeep = data.hall.levels[keep - 1].limits[spec.ref]?.maxLevel ?? 1;
    const want = keep === prevKeep ? prevRef + 1 : Math.max(atKeep, prevRef + (prevRef ? 1 : 0), 1);
    prevKeep = keep;
    prevRef = want;
    const base = ref.levels[Math.min(want, top) - 1];
    const extra = Math.max(0, want - top);
    const power = Math.pow(1.16, extra);
    const price = Math.pow(1.45, extra);
    const lv: LevelDef = {
      level,
      cost: scaleCost(base.cost, spec.costMult * price),
      buildSeconds: base.buildSeconds,
      hp: Math.max(1, Math.round(base.hp * spec.hpMult * power)),
    };
    if (spec.damageMult !== undefined && base.damage !== undefined) lv.damage = round3(base.damage * spec.damageMult * power);
    if (spec.damageMult !== undefined && base.damage === undefined) throw new Error(`preview ${id}: ${spec.ref} has no damage to scale`);
    out.push(lv);
  }
  return out;
}

/** The full definition of a preview building (text from the catalog, effect = catalog effect + preview extras). */
export function previewBuildingDef(id: string, data: GameData): BuildingDef {
  const spec = PREVIEW.buildings[id];
  const entry = catalogEntry(id);
  const effect = entry.effect || spec.effect ? ({ ...(entry.effect ?? {}), ...(spec.effect ?? {}) } as unknown as BuildingEffect) : undefined;
  return {
    name: entry.name,
    description: entry.description ?? '',
    size: spec.size,
    category: entry.category as BuildingCategory,
    inShop: true,
    ...(spec.combat ? { combat: { ...spec.combat } } : {}),
    ...(effect ? { effect } : {}),
    levels: previewLevels(id, data),
  };
}

/** A preview hero's troop-shaped definition (battle.json `heroes` shape; text from roster.json). */
export function previewHeroDef(id: string, data: GameData): TroopDef & { unlockKeep: number } {
  const spec = PREVIEW.heroes[id];
  const entry = HEROES.find((h) => h.id === id);
  const ref = data.troops[spec.ref];
  if (!entry || !ref) throw new Error(`preview hero ${id}: missing roster entry or reference ${spec.ref}`);
  const keeps = data.hall.levels.length;
  const levels: TroopLevelDef[] = [];
  for (let keep = entry.unlockKeep; keep <= keeps; keep++) {
    const at = ref.levels[Math.min(ref.levels.length, troopLevelCapAt(keep, data, spec.ref)) - 1];
    levels.push({ level: levels.length + 1, hp: Math.round((at.hp / ref.housing) * spec.hpPerHousing), damage: round3((at.damage / ref.housing) * spec.damagePerHousing), cost: {} });
  }
  return {
    name: entry.name,
    description: entry.ability.text,
    housing: 0,
    attackIntervalTicks: ref.attackIntervalTicks,
    range: ref.range,
    speed: ref.speed,
    air: ref.air,
    prefers: spec.prefers ?? ref.prefers,
    ignoresHedges: ref.ignoresHedges,
    trainSeconds: 0,
    barracksLevel: 1,
    unlockKeep: entry.unlockKeep,
    ...(ref.projectile ? { projectile: ref.projectile, projectileSpeed: ref.projectileSpeed } : {}),
    ability: entry.ability.id,
    kit: { ...spec.kit },
    levels,
  };
}

/** The game data with the non-live content merged in (a copy; `data` is not changed). */
export function withPreview(data: GameData, opts: { playable?: boolean } = {}): GameData {
  const playable = opts.playable !== false;
  const out = structuredClone(data);
  for (const id of previewBuildingIds()) out.buildings[id] = previewBuildingDef(id, data);
  const heroes = { ...(out.battle.heroes ?? {}) };
  for (const id of previewHeroIds()) heroes[id] = previewHeroDef(id, data);
  out.battle = { ...out.battle, heroes };
  if (!playable) return out;
  for (const id of previewBuildingIds()) {
    const entry = catalogEntry(id);
    out.hall.levels.forEach((h, i) => {
      const max = buildingMaxLevelAt(entry, i + 1);
      if (max > 0) h.limits[id] = { count: PREVIEW.buildings[id].count, maxLevel: max };
    });
  }
  out.features = { ...PREVIEW.features };
  return out;
}
