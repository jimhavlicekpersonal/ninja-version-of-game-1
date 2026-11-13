/**
 * Tempering (SIM_RULES 6; docs/game-theory/DESIGN_TEMPERING_2026-11-08.md, IMPLEMENTATION_NOTE_TEMPERING.md).
 *
 * From `temper.unlockKeep` the owner of a village re-shapes each temperable defence type (Kunai Tower,
 * Shuriken Tower) along three axes in steps of 1/`steps`: Reach (range, prefers far attackers), Blast
 * (splash, slower fire) and Watch (anti-air, anti-aura and traps across the base). The trades give up
 * damage for shape, so a base becomes a point in a triangle that is shown at scouting, and no army is
 * best against every point (measured: docs/game-theory/SIMULATION_ROUND2_2026-11-09.md).
 *
 * Pure and deterministic: only + − × ÷ and rounding of integer fire intervals. A base whose buildings
 * carry no `temper` plays exactly as before the rule existed.
 */
import type { BuildingType, GameData, Temper, TemperAxis, TemperDef, TemperFamily } from '../types';
import type { BaseLayout } from './types';
import type { SimBuilding } from './battle';

export const TEMPER_AXES: readonly TemperAxis[] = ['reach', 'blast', 'watch'];

export type TemperProfile = Record<TemperAxis, number>;

const ZERO: TemperProfile = { reach: 0, blast: 0, watch: 0 };

export function temperDef(data: GameData): TemperDef | null {
  return data.battle.temper ?? null;
}

/** Whether a building type can be tempered at all (not whether the Keep allows it yet). */
export function temperable(type: BuildingType, data: GameData): boolean {
  return Boolean(temperDef(data)?.types[type]);
}

/** The axes a type can take. */
export function temperAxes(type: BuildingType, data: GameData): TemperAxis[] {
  const t = temperDef(data)?.types[type];
  return t ? TEMPER_AXES.filter((a) => t[a] !== undefined) : [];
}

/** A temper with the zero axes left out; null when nothing is set (stored as no `temper` at all). */
export function normalizeTemper(t: Temper | undefined | null): Temper | null {
  if (!t) return null;
  const out: Temper = {};
  for (const a of TEMPER_AXES) if ((t[a] ?? 0) > 0) out[a] = t[a];
  return Object.keys(out).length ? out : null;
}

/** Valid: only the type's axes, whole non-negative points, at most `steps` in total. */
export function validTemper(type: BuildingType, t: unknown, data: GameData): t is Temper {
  const def = temperDef(data);
  if (!def || !def.types[type] || !t || typeof t !== 'object' || Array.isArray(t)) return false;
  const allowed = temperAxes(type, data);
  let sum = 0;
  for (const [k, v] of Object.entries(t as Record<string, unknown>)) {
    if (!allowed.includes(k as TemperAxis)) return false;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) return false;
    sum += v;
  }
  return sum <= def.steps;
}

export function sameTemper(a: Temper | undefined | null, b: Temper | undefined | null): boolean {
  return TEMPER_AXES.every((x) => (a?.[x] ?? 0) === (b?.[x] ?? 0));
}

/** Fractions per axis (0..1). */
export function temperFractions(t: Temper | undefined | null, data: GameData): TemperProfile {
  const steps = temperDef(data)?.steps ?? 1;
  if (!t) return { ...ZERO };
  return { reach: (t.reach ?? 0) / steps, blast: (t.blast ?? 0) / steps, watch: (t.watch ?? 0) / steps };
}

/**
 * The base's profile: the mean fraction per axis over its temperable buildings (untempered ones count as zero),
 * which drives the base-wide effects. All zeros when nothing is tempered.
 */
export function baseProfile(base: Pick<BaseLayout, 'buildings'>, data: GameData): TemperProfile {
  const def = temperDef(data);
  if (!def) return { ...ZERO };
  const out = { ...ZERO };
  let n = 0;
  for (const b of base.buildings) {
    if (!def.types[b.type]) continue;
    const f = temperFractions(b.temper, data);
    out.reach += f.reach;
    out.blast += f.blast;
    out.watch += f.watch;
    n++;
  }
  if (!n) return out;
  return { reach: out.reach / n, blast: out.blast / n, watch: out.watch / n };
}

/** Re-shape one sim building by its own temper (mutates). Untempered or inactive buildings are left alone. */
export function applyTemper(b: SimBuilding, t: Temper | undefined, data: GameData): void {
  const def = temperDef(data)?.types[b.type];
  if (!def || !t || !b.combat) return;
  const f = temperFractions(t, data);
  let cost = 0;
  let range = 0;
  let splash = 0;
  let slow = 0;
  let preferFar: number | null = null;
  for (const a of TEMPER_AXES) {
    const ad = def[a];
    if (!ad || f[a] <= 0) continue;
    cost += (ad.damageCost ?? 0) * f[a];
    range += (ad.range ?? 0) * f[a];
    splash = Math.max(splash, (ad.splashRadius ?? 0) * f[a]);
    slow += (ad.fireSlow ?? 0) * f[a];
    if (ad.preferFarAt !== undefined && f[a] >= ad.preferFarAt) preferFar = ad.prefersBeyond ?? null;
  }
  b.combat = {
    ...b.combat,
    range: b.combat.range + range,
    fireIntervalTicks: Math.max(1, Math.round(b.combat.fireIntervalTicks * (1 + slow))),
    damage: b.combat.damage * Math.max(0, 1 - cost),
    ...(splash > (b.combat.splashRadius ?? 0) ? { splashRadius: splash } : {}),
  };
  if (preferFar !== null && !b.effect) b.effect = { kind: 'counter_artillery', prefersBeyond: preferFar };
}

/** Base-wide effects of the base's profile on other building types (mutates). */
export function applyBaseWide(buildings: SimBuilding[], profile: TemperProfile, data: GameData): void {
  const def = temperDef(data);
  if (!def) return;
  for (const a of TEMPER_AXES) {
    const w = profile[a];
    const byType = def.baseWide[a];
    if (!byType || w <= 0) continue;
    for (const b of buildings) {
      const e = byType[b.type];
      if (!e) continue;
      if (b.combat) {
        b.combat = {
          ...b.combat,
          damage: b.combat.damage * (1 + (e.damage ?? 0) * w),
          fireIntervalTicks: Math.max(1, Math.round(b.combat.fireIntervalTicks * (1 - (e.fireFaster ?? 0) * w))),
        };
      }
      if (b.effect && (e.radius || e.cutAdd)) {
        const cut = (v: number | undefined) => (v === undefined ? v : Math.min(0.9, v + (e.cutAdd ?? 0) * w));
        b.effect = {
          ...b.effect,
          ...(b.effect.radius !== undefined ? { radius: b.effect.radius + (e.radius ?? 0) * w } : {}),
          ...(b.effect.healCutPct !== undefined ? { healCutPct: cut(b.effect.healCutPct) } : {}),
          ...(b.effect.auraCutPct !== undefined ? { auraCutPct: cut(b.effect.auraCutPct) } : {}),
        };
      }
    }
  }
}

/** Which family of warriors a troop belongs to for rival offers. */
export function temperFamily(troop: { air: boolean; range: number }): TemperFamily {
  if (troop.air) return 'air';
  return troop.range >= 3.5 ? 'ranged' : 'ground';
}

/** The family that made up most of the housing over these armies (null when there is none). */
export function dominantFamily(armies: Record<string, number>[], data: GameData): TemperFamily | null {
  const share: Record<TemperFamily, number> = { ranged: 0, air: 0, ground: 0 };
  let total = 0;
  for (const army of armies) {
    for (const [t, n] of Object.entries(army)) {
      const def = data.troops[t];
      if (!def || n <= 0) continue;
      share[temperFamily(def)] += def.housing * n;
      total += def.housing * n;
    }
  }
  if (!total) return null;
  return (['ranged', 'ground', 'air'] as TemperFamily[]).reduce((best, f) => (share[f] > share[best] ? f : best), 'ranged');
}

/** Copy a temper map onto a base's buildings (mutates). Types with no entry stay untempered. */
export function temperBase(base: BaseLayout, tempers: Record<BuildingType, Temper> | null | undefined, data: GameData): void {
  if (!tempers) return;
  for (const b of base.buildings) {
    const t = normalizeTemper(tempers[b.type]);
    if (t && validTemper(b.type, t, data)) b.temper = { ...t };
  }
}
