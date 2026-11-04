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
import { createBattle, deploymentsByTick, result as battleResult, step } from '../../src/gameplay/sim/battle/battle';
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
  // Realistic mixes: a little support, or a breaching wedge, with a ranged backline.
  { id: 'support_light', name: 'Melee + ranged, light support', shares: { melee: 0.55, artillery: 0.3, support: 0.15 } },
  { id: 'breach', name: 'Breach wedge', shares: { siege: 0.25, melee: 0.45, artillery: 0.3 } },
];

/** The newest `n` troops of a family unlocked at a Keep (what a player would bring). */
export function newestInFamily(family: Family, keep: number, n = 3, data: GameData = defaultData): string[] {
  return Object.keys(data.troops)
    .filter((id) => familyOf(data.troops[id]) === family && troopKeep(id, data) <= keep)
    .sort((a, b) => troopKeep(b, data) - troopKeep(a, data) || (a < b ? -1 : 1))
    .slice(0, n);
}

/**
 * An army for a composition at a Keep, filling the Keep's full housing (at
 * least 97%: rounding is topped up with the composition's own troops, smallest
 * first, so no army is short-changed). Null if a family it needs isn't unlocked yet.
 */
export function buildArmy(comp: Composition, keep: number, data: GameData = defaultData): Record<string, number> | null {
  const housing = maxHousingAtHall(keep, data);
  if (comp.id === 'mixed') return botArmy(keep, 1, data);
  const army: Record<string, number> = {};
  const used = () => Object.entries(army).reduce((s, [t, n]) => s + data.troops[t].housing * n, 0);
  const all: string[] = [];
  for (const [family, share] of Object.entries(comp.shares) as [Family, number][]) {
    const troops = newestInFamily(family, keep, 3, data);
    if (!troops.length) return null;
    all.push(...troops);
    const slice = (housing * share) / troops.length;
    for (const t of troops) {
      const n = Math.floor(slice / data.troops[t].housing);
      if (n > 0) army[t] = (army[t] ?? 0) + n;
    }
  }
  const fillers = [...new Set(all)].sort((a, b) => data.troops[a].housing - data.troops[b].housing || (a < b ? -1 : 1));
  for (let i = 0; fillers.length && i < 1000; i++) {
    const t = fillers.find((x) => used() + data.troops[x].housing <= housing);
    if (!t) break;
    army[t] = (army[t] ?? 0) + 1;
    fillers.push(fillers.shift()!);
  }
  return Object.keys(army).length ? army : null;
}

/** What an army costs to put in the field at a Keep: Provisions and Dojo seconds to train it, and Provisions to research its troops to the Keep's caps. */
export function armyInvestment(army: Record<string, number>, keep: number, data: GameData = defaultData): { trainDew: number; trainSeconds: number; researchDew: number } {
  let trainDew = 0;
  let trainSeconds = 0;
  let researchDew = 0;
  for (const [t, n] of Object.entries(army)) {
    const cap = troopLevelCapAt(keep, data, t);
    const def = data.troops[t];
    trainDew += (def.levels[cap - 1].cost.dew ?? 0) * n;
    trainSeconds += def.trainSeconds * n;
    for (const lv of def.levels.slice(1, cap)) researchDew += lv.research?.cost.dew ?? 0;
  }
  return { trainDew, trainSeconds, researchDew };
}

export interface LabRow {
  comp: string;
  keep: number;
  layout: string;
  fights: number;
  destruction: number;
  oneStar: number;
  threeStar: number;
  /** Same bases and deployments with only the five counters' effects switched off (what the effects cost this army). */
  destructionNoCounters?: number;
  /** Counter actions per fight, by kind ('lit', 'repair', 'grounded'): is each counter actually in play? */
  counterEvents: Record<string, number>;
}

const COUNTERS = new Set(['paper_lantern_line', 'clockwork_repairer', 'bitter_incense_burner', 'kite_cutter_ballista', 'longbow_yagura']);

/**
 * Removes the counter buildings from a base (their whole value: footprint,
 * objective, shots and effect). Note this changes the base's entry geometry and
 * destruction denominator, so it is not used for the effect comparison.
 */
export function stripCounters(base: BaseLayout): BaseLayout {
  return { ...base, buildings: base.buildings.filter((b) => !COUNTERS.has(b.type)) };
}

/**
 * The same game data with only the five counters' special effects switched off
 * (Lantern light, Crane repairs, Incense cuts, Ballista grounding, Yagura's
 * long-range preference). The buildings stay, so the base, its Infiltration
 * Points, its objectives and the Ballista and Yagura shots are identical: a
 * before/after comparison measures the counter ability alone.
 */
export function withoutCounterEffects(data: GameData): GameData {
  const out = structuredClone(data);
  for (const id of COUNTERS) {
    const def = out.buildings[id];
    if (!def) continue;
    delete def.effect;
    for (const lv of def.levels) delete lv.effect;
  }
  return out;
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
  const plain = opts.compareCounters ? withoutCounterEffects(data) : data;
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
        const events: Record<string, number> = {};
        for (let i = 0; i < opts.seeds; i++) {
          const base = generateOpponent(5000 + i * 7919 + keep * 131, keep, data, { levelBias: 0.5, layout });
          const fight = (gd: GameData, count = false) => {
            const setup = { seed: 77 + i, base, army, levels, infiltration: true };
            const sim = createBattle(setup, gd);
            const byTick = deploymentsByTick(botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + i), gd, levels, sim.entry));
            while (!sim.ended) {
              step(sim, byTick.get(sim.tick));
              if (count) for (const e of sim.events) if (e.k === 'counter') events[e.what] = (events[e.what] ?? 0) + 1;
            }
            return battleResult(sim);
          };
          const r = fight(data, true);
          d += r.destruction;
          if (r.stars >= 1) one++;
          if (r.stars === 3) three++;
          // Same base, same deployments, same entry points: only the counter effects are off.
          if (opts.compareCounters) dn += fight(plain).destruction;
        }
        const n = opts.seeds;
        rows.push({
          comp: comp.id, keep, layout: layoutId, fights: n,
          destruction: d / n, oneStar: one / n, threeStar: three / n,
          counterEvents: Object.fromEntries(Object.entries(events).map(([k, v]) => [k, v / n])),
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

const fmtK = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));

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
    L.push('', '## What the five live counters\' effects cost each army', '');
    L.push('Destruction lost to the counter abilities: the same bases, deployments and Infiltration Points, fought once with the Paper Lantern Line, Repair Crane, Incense Burner, Kite-Cutter Ballista and Longbow Yagura effects on and once with only those effects switched off (the buildings stay and still count; the Ballista and Yagura still shoot).', '');
    L.push(`| Army | ${keeps.map((k) => `Keep ${k}`).join(' | ')} |`, `|---|${keeps.map(() => '---').join('|')}|`);
    for (const c of COMPOSITIONS) {
      const byKeep = s.get(c.id);
      L.push(`| ${c.name} | ${keeps.map((k) => { const v = byKeep?.get(k); return v && v.noCounters !== undefined ? `${(v.destruction - v.noCounters).toFixed(1)}` : '–'; }).join(' | ')} |`);
    }
  }
  L.push('', '## Investment per army', '');
  L.push('Equal housing is not equal investment. Provisions and Dojo time to train each army once (base Dojo speed), and Provisions to research its troops to the Keep\'s caps.', '');
  L.push(`| Army | ${keeps.map((k) => `Keep ${k}`).join(' | ')} |`, `|---|${keeps.map(() => '---').join('|')}|`);
  for (const c of COMPOSITIONS) {
    L.push(`| ${c.name} | ${keeps.map((k) => { const a = buildArmy(c, k, opts.data ?? defaultData); if (!a) return '–'; const v = armyInvestment(a, k, opts.data ?? defaultData); return `${fmtK(v.trainDew)} · ${(v.trainSeconds / 3600).toFixed(1)}h · R ${fmtK(v.researchDew)}`; }).join(' | ')} |`);
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
