/**
 * Army lab: fights equal-housing army compositions against generated bases
 * across Keeps, layouts and seeds, with real battles (the same sim the game
 * and the server run). Used by tests/gameplay/balance/army-lab.test.ts and
 * by `npm run balance:armies`, which writes docs/game-theory/ARMY_BALANCE.md.
 *
 * Every army uses the bot deployment plan (the three Infiltration Points
 * nearest one side, a mixed squad through each, toughest first), so the
 * numbers compare compositions, not player skill.
 */
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { createBattle, runBattle } from '../../src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BaseLayout } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData, TroopDef } from '../../src/gameplay/sim/types';

export type Family = 'melee' | 'artillery' | 'support' | 'air' | 'shadow' | 'siege';

/** Which family a troop belongs to, from its stats and kit (not its name). */
export function familyOf(def: TroopDef): Family {
  if (def.air) return 'air';
  if (def.prefers === 'support') return 'support';
  if (def.prefers === 'walls' || def.prefers === 'breach') return 'siege';
  if (def.kit?.stealth || def.kit?.decoyTicks || def.kit?.teleport || def.kit?.smokeMultiplier) return 'shadow';
  if (def.range >= 3.5) return 'artillery';
  return 'melee';
}

/** The Keep level from which a troop can be trained (its Keep gate and the Keep that allows its Dojo level). */
export function troopKeep(id: string, data: GameData = defaultData): number {
  const def = data.troops[id];
  const dojo = data.hall.levels.findIndex((l) => (l.limits.burrow_barracks?.maxLevel ?? 0) >= def.barracksLevel) + 1 || data.hall.levels.length;
  return Math.max(def.unlockKeep ?? 1, dojo);
}

export interface Composition {
  id: string;
  name: string;
  /** Housing share by family; the families' newest unlocked troops share each slice. */
  shares: Partial<Record<Family, number>>;
}

export const COMPOSITIONS: Composition[] = [
  { id: 'mixed', name: 'Mixed (raid bot mix)', shares: {} },
  { id: 'melee', name: 'Melee rush', shares: { melee: 1 } },
  { id: 'artillery', name: 'Artillery-heavy', shares: { artillery: 0.7, melee: 0.3 } },
  { id: 'support', name: 'Support-heavy', shares: { support: 0.4, melee: 0.6 } },
  { id: 'air', name: 'Air', shares: { air: 0.8, melee: 0.2 } },
  { id: 'shadow', name: 'Shadow strike', shares: { shadow: 0.7, melee: 0.3 } },
  { id: 'siege', name: 'Siege', shares: { siege: 0.5, melee: 0.5 } },
];

/** The newest `n` troops of a family unlocked at a Keep (what a player would bring). */
export function newestInFamily(family: Family, keep: number, n = 3, data: GameData = defaultData): string[] {
  return Object.keys(data.troops)
    .filter((id) => familyOf(data.troops[id]) === family && troopKeep(id, data) <= keep)
    .sort((a, b) => troopKeep(b, data) - troopKeep(a, data) || (a < b ? -1 : 1))
    .slice(0, n);
}

/** An army for a composition at a Keep, filling the Keep's full housing. Null if a family it needs isn't unlocked yet. */
export function buildArmy(comp: Composition, keep: number, data: GameData = defaultData): Record<string, number> | null {
  const housing = maxHousingAtHall(keep, data);
  if (comp.id === 'mixed') return botArmy(keep, 1, data);
  const army: Record<string, number> = {};
  for (const [family, share] of Object.entries(comp.shares) as [Family, number][]) {
    const troops = newestInFamily(family, keep, 3, data);
    if (!troops.length) return null;
    const slice = (housing * share) / troops.length;
    for (const t of troops) {
      const n = Math.floor(slice / data.troops[t].housing);
      if (n > 0) army[t] = (army[t] ?? 0) + n;
    }
  }
  return Object.keys(army).length ? army : null;
}

export interface LabRow {
  comp: string;
  keep: number;
  layout: string;
  fights: number;
  destruction: number;
  oneStar: number;
  threeStar: number;
  /** Same fights with the five counter buildings removed from the bases (how much the counters cost this army). */
  destructionNoCounters?: number;
}

const COUNTERS = new Set(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura']);

export function stripCounters(base: BaseLayout): BaseLayout {
  return { ...base, buildings: base.buildings.filter((b) => !COUNTERS.has(b.type)) };
}

export interface LabOptions {
  keeps: number[];
  /** Layout ids from LAYOUTS, or 'random' for the unstyled generator. */
  layouts: string[];
  seeds: number;
  compositions?: Composition[];
  /** Also fight each base without its counter buildings. */
  compareCounters?: boolean;
  data?: GameData;
}

export function runLab(opts: LabOptions): LabRow[] {
  const data = opts.data ?? defaultData;
  const rows: LabRow[] = [];
  for (const keep of opts.keeps) {
    for (const comp of opts.compositions ?? COMPOSITIONS) {
      const army = buildArmy(comp, keep, data);
      if (!army) continue;
      const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
      for (const layoutId of opts.layouts) {
        const layout = LAYOUTS.find((l) => l.id === layoutId);
        let d = 0;
        let dn = 0;
        let one = 0;
        let three = 0;
        for (let i = 0; i < opts.seeds; i++) {
          const base = generateOpponent(5000 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
          const fight = (b: BaseLayout) => {
            const setup = { seed: 77 + i, base: b, army, levels, infiltration: true };
            const probe = createBattle(setup, data);
            const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(13 + i), data, levels, probe.entry);
            return runBattle(setup, deps, data).result;
          };
          const r = fight(base);
          d += r.destruction;
          if (r.stars >= 1) one++;
          if (r.stars === 3) three++;
          if (opts.compareCounters) dn += fight(stripCounters(base)).destruction;
        }
        const n = opts.seeds;
        rows.push({
          comp: comp.id, keep, layout: layoutId, fights: n,
          destruction: d / n, oneStar: one / n, threeStar: three / n,
          ...(opts.compareCounters ? { destructionNoCounters: dn / n } : {}),
        });
      }
    }
  }
  return rows;
}

export interface LabCell {
  destruction: number;
  threeStar: number;
  /** Present when the lab also fought the bases without their counter buildings. */
  noCounters?: number;
}

/** Average destruction per (composition, keep) over all layouts. */
export function summarize(rows: LabRow[]): Map<string, Map<number, LabCell>> {
  const sums = new Map<string, Map<number, { d: number; nc: number; three: number; n: number; hasNc: boolean }>>();
  for (const r of rows) {
    const byKeep = sums.get(r.comp) ?? new Map();
    const cur = byKeep.get(r.keep) ?? { d: 0, nc: 0, three: 0, n: 0, hasNc: r.destructionNoCounters !== undefined };
    cur.d += r.destruction;
    cur.three += r.threeStar;
    cur.nc += r.destructionNoCounters ?? 0;
    cur.n++;
    byKeep.set(r.keep, cur);
    sums.set(r.comp, byKeep);
  }
  const out = new Map<string, Map<number, LabCell>>();
  for (const [comp, byKeep] of sums) {
    const cells = new Map<number, LabCell>();
    for (const [k, v] of byKeep) cells.set(k, { destruction: v.d / v.n, threeStar: v.three / v.n, ...(v.hasNc ? { noCounters: v.nc / v.n } : {}) });
    out.set(comp, cells);
  }
  return out;
}

export function labMarkdown(rows: LabRow[], opts: LabOptions): string {
  const s = summarize(rows);
  const keeps = opts.keeps;
  const L: string[] = [];
  L.push('# Army balance (generated)', '');
  L.push('Generated by `npm run balance:armies` (`tools/balance/armyLab.ts`). Do not edit by hand.', '');
  L.push(`Equal-housing armies (each fills the Keep's full camp space, troops at the Keep's research cap) fight generated bases with the bot plan: one side, toughest troops first. ${opts.seeds} seeds × ${opts.layouts.length} layouts (${opts.layouts.join(', ')}) per cell. Bases are at the same Keep with mid-level buildings.`, '');
  L.push('A composition takes the three newest unlocked troops of each family it uses:', '');
  for (const c of COMPOSITIONS) L.push(`- **${c.name}** (\`${c.id}\`): ${c.id === 'mixed' ? 'the raid bots\' mix for that Keep' : Object.entries(c.shares).map(([f, v]) => `${Math.round(v! * 100)}% ${f}`).join(', ')}`);
  L.push('', '## Average destruction % (3-star rate)', '');
  L.push(`| Army | ${keeps.map((k) => `Keep ${k}`).join(' | ')} |`, `|---|${keeps.map(() => '---').join('|')}|`);
  for (const c of COMPOSITIONS) {
    const byKeep = s.get(c.id);
    L.push(`| ${c.name} | ${keeps.map((k) => { const v = byKeep?.get(k); return v ? `${v.destruction.toFixed(0)} (${Math.round(v.threeStar * 100)}%)` : '–'; }).join(' | ')} |`);
  }
  if (opts.compareCounters) {
    L.push('', '## What the five live counters cost each army', '');
    L.push('Destruction lost when the same bases keep their Paper Lantern Line, Repair Crane, Incense Burner, Kite-Cutter Ballista and Longbow Yagura (Keep 5+), versus the same bases with those removed.', '');
    L.push(`| Army | ${keeps.map((k) => `Keep ${k}`).join(' | ')} |`, `|---|${keeps.map(() => '---').join('|')}|`);
    for (const c of COMPOSITIONS) {
      const byKeep = s.get(c.id);
      L.push(`| ${c.name} | ${keeps.map((k) => { const v = byKeep?.get(k); return v && v.noCounters !== undefined ? `${(v.destruction - v.noCounters).toFixed(1)}` : '–'; }).join(' | ')} |`);
    }
  }
  L.push('', '## Armies used', '');
  for (const k of keeps) {
    L.push(`**Keep ${k}** (housing ${maxHousingAtHall(k, opts.data ?? defaultData)})`, '');
    for (const c of COMPOSITIONS) {
      const a = buildArmy(c, k, opts.data ?? defaultData);
      if (a) L.push(`- ${c.name}: ${Object.entries(a).map(([t, n]) => `${n}× ${(opts.data ?? defaultData).troops[t].name}`).join(', ')}`);
    }
    L.push('');
  }
  return L.join('\n') + '\n';
}
