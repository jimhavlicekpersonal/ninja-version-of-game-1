/**
 * Balance preview (content batch 2026-11-14): measures the designed but non-live content in data/planned.json
 * (through `withPreview`) against the live game at the Keep levels where it would unlock, so a designer can
 * set its numbers before switching it live. Written by `npm run balance:preview` to
 * docs/game-theory/PREVIEW_BALANCE.md. Reported only: no test or gate reads it.
 *
 * Buildings: each planned counter is added to generated bases of its Keep (at its catalog max level there, at the
 * free spot nearest the defenses; the Living Bamboo Wall replaces the Stone Walls instead) and fought by three
 * armies: the raid bots' mix, an army built on the warriors it is designed to beat (`counters`), and one built on
 * those designed to beat it (`counteredBy`), each 60% of housing with 40% of the newest melee. Three numbers: the
 * base alone, with the building, and with the building but its effect switched off (its body only).
 *
 * Heroes: each planned hero leads the raid bots' mix and an army of its role's family, against the same bases,
 * next to no hero and the live Shadow Captain at the same Keep.
 */
import { createBattle, deploymentsByTick, result as battleResult, step } from '../../src/gameplay/sim/battle/battle';
import { LAYOUTS, generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import type { BaseBuilding, BaseLayout, BattleSetup } from '../../src/gameplay/sim/battle/types';
import { defaultData } from '../../src/gameplay/sim/data';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { heroAtKeep } from '../../src/gameplay/sim/heroes';
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { botArmy } from '../../src/gameplay/sim/matchmaking';
import { previewBuildingIds, previewHeroIds, withPreview } from '../../src/gameplay/sim/plannedContent';
import { BUILDINGS, HEROES, WARRIORS, buildingMaxLevelAt } from '../../src/gameplay/sim/progression';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { createRng } from '../../src/gameplay/sim/rng';
import type { GameData } from '../../src/gameplay/sim/types';
import { newestInFamily, troopKeep, type Family } from './armyLab';

export interface PreviewOptions {
  layouts: string[];
  seeds: number;
  /** Limit to these ids (buildings or heroes); all when absent. */
  only?: string[];
}

export interface BuildingRow { id: string; keep: number; army: string; base: number; withIt: number; bodyOnly: number; events: number }
export interface HeroRow { id: string; keep: number; army: string; none: number; captain: number; hero: number }

const liveTroop = (rosterId: string) => WARRIORS.find((w) => w.id === rosterId)?.liveTroop ?? rosterId;

function keepsFor(unlock: number, last: number): number[] {
  return [...new Set([unlock, Math.round((unlock + last) / 2), last])];
}

/** `troops` share 60% of the housing, the newest melee the rest; null when none is unlocked at this Keep. */
function focusArmy(troops: string[], keep: number, data: GameData): Record<string, number> | null {
  const open = troops.map(liveTroop).filter((t) => data.troops[t] && troopKeep(t, data) <= keep);
  if (!open.length) return null;
  const housing = maxHousingAtHall(keep, data);
  const army: Record<string, number> = {};
  const add = (list: string[], share: number) => {
    for (const t of list) {
      const n = Math.floor((housing * share) / list.length / data.troops[t].housing);
      if (n > 0) army[t] = (army[t] ?? 0) + n;
    }
  };
  add(open, 0.6);
  add(newestInFamily('melee', keep, 2, data), 0.4);
  return Object.keys(army).length ? army : null;
}

function familyArmy(family: Family, keep: number, data: GameData): Record<string, number> | null {
  const troops = newestInFamily(family, keep, 3, data);
  return troops.length ? focusArmy(troops, keep, data) : null;
}

/** A free spot for a `size` building, nearest the defenses' centre (null if the map is full). */
function freeSpot(base: BaseLayout, size: number, data: GameData): { x: number; y: number } | null {
  const n = data.economy.mapSize;
  const used = new Uint8Array(n * n);
  let sx = 0;
  let sy = 0;
  let count = 0;
  for (const b of base.buildings) {
    const s = data.buildings[b.type].size;
    for (let y = b.y; y < b.y + s; y++) for (let x = b.x; x < b.x + s; x++) used[y * n + x] = 1;
    if (data.buildings[b.type].category === 'defense') { sx += b.x + s / 2; sy += b.y + s / 2; count++; }
  }
  const cx = count ? sx / count : n / 2;
  const cy = count ? sy / count : n / 2;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (let y = 0; y + size <= n; y++) {
    for (let x = 0; x + size <= n; x++) {
      let free = true;
      for (let yy = y; yy < y + size && free; yy++) for (let xx = x; xx < x + size && free; xx++) if (used[yy * n + xx]) free = false;
      if (!free) continue;
      const d = (x + size / 2 - cx) * (x + size / 2 - cx) + (y + size / 2 - cy) * (y + size / 2 - cy);
      if (d < bestD) { bestD = d; best = { x, y }; }
    }
  }
  return best;
}

/** The base with one planned building added (the Living Bamboo Wall replaces the Stone Walls). */
export function withBuilding(base: BaseLayout, id: string, keep: number, data: GameData): BaseLayout {
  const entry = BUILDINGS.find((b) => b.id === id)!;
  const level = Math.max(1, buildingMaxLevelAt(entry, keep));
  if (entry.category === 'hedge') {
    return { ...base, buildings: base.buildings.map((b) => (data.buildings[b.type].category === 'hedge' ? { ...b, type: id, level: Math.min(level, data.buildings[id].levels.length) } : b)) };
  }
  const spot = freeSpot(base, data.buildings[id].size, data);
  if (!spot) return base;
  const added: BaseBuilding = { id: `preview_${id}`, type: id, level, x: spot.x, y: spot.y };
  return { ...base, buildings: [...base.buildings, added] };
}

function bodyOnly(data: GameData, id: string): GameData {
  const out = structuredClone(data);
  delete out.buildings[id].effect;
  for (const lv of out.buildings[id].levels) delete lv.effect;
  return out;
}

function fight(base: BaseLayout, army: Record<string, number>, keep: number, seed: number, data: GameData, hero: { id: string; level: number } | null, counters?: { n: number }): number {
  const levels = Object.fromEntries(Object.keys(army).map((t) => [t, troopLevelCapAt(keep, data, t)]));
  const setup: BattleSetup = { seed: 77 + seed, base, army, levels, infiltration: true, ...(hero ? { hero } : {}) };
  const sim = createBattle(setup, data);
  const deployments = botDeployments(sim.deployable, sim.grid.size, army, createRng(13 + seed), data, levels, sim.entry);
  if (hero && deployments.length) deployments.unshift({ ...deployments[0], troop: hero.id });
  const byTick = deploymentsByTick(deployments);
  while (!sim.ended) {
    step(sim, byTick.get(sim.tick));
    if (counters) for (const e of sim.events) if (e.k === 'counter') counters.n++;
  }
  return battleResult(sim).destruction;
}

function bases(keep: number, opts: PreviewOptions): BaseLayout[] {
  const out: BaseLayout[] = [];
  for (const layoutId of opts.layouts) {
    const layout = LAYOUTS.find((l) => l.id === layoutId);
    for (let i = 0; i < opts.seeds; i++) out.push(generateOpponent(5000 + i * 7919 + keep * 131, keep, defaultData, { levelBias: 0.5, layout }));
  }
  return out;
}

export function runBuildingPreview(opts: PreviewOptions): BuildingRow[] {
  const data = withPreview(defaultData);
  const last = data.hall.levels.length;
  const rows: BuildingRow[] = [];
  for (const id of previewBuildingIds().filter((b) => b !== 'hero_shrine' && (!opts.only || opts.only.includes(b)))) {
    const entry = BUILDINGS.find((b) => b.id === id)!;
    const plain = bodyOnly(data, id);
    for (const keep of keepsFor(entry.unlockKeep, last)) {
      const armies: [string, Record<string, number> | null][] = [
        ['raid mix', botArmy(keep, 1, data)],
        ['it beats', focusArmy(entry.counters ?? [], keep, data)],
        ['beats it', focusArmy(entry.counteredBy ?? [], keep, data)],
      ];
      for (const [name, army] of armies) {
        if (!army) continue;
        let a = 0;
        let w = 0;
        let o = 0;
        const counters = { n: 0 };
        const list = bases(keep, opts);
        list.forEach((base, i) => {
          const changed = withBuilding(base, id, keep, data);
          a += fight(base, army, keep, i, data, null);
          w += fight(changed, army, keep, i, data, null, counters);
          o += fight(changed, army, keep, i, plain, null);
        });
        const n = list.length;
        rows.push({ id, keep, army: name, base: a / n, withIt: w / n, bodyOnly: o / n, events: counters.n / n });
      }
    }
  }
  return rows;
}

const HERO_FAMILY: Record<string, Family> = { guardian: 'melee', sky: 'air', mystic: 'support', blade: 'melee' };

export function runHeroPreview(opts: PreviewOptions): HeroRow[] {
  const data = withPreview(defaultData);
  const last = data.hall.levels.length;
  const rows: HeroRow[] = [];
  for (const id of previewHeroIds().filter((h) => !opts.only || opts.only.includes(h))) {
    const entry = HEROES.find((h) => h.id === id)!;
    const def = data.battle.heroes![id];
    for (const keep of keepsFor(entry.unlockKeep, last)) {
      const hero = { id, level: Math.max(1, Math.min(def.levels.length, keep - def.unlockKeep + 1)) };
      const captain = heroAtKeep(keep, defaultData);
      const armies: [string, Record<string, number> | null][] = [
        ['raid mix', botArmy(keep, 1, data)],
        [`${entry.heroOf} family`, familyArmy(HERO_FAMILY[entry.heroOf] ?? 'melee', keep, data)],
      ];
      for (const [name, army] of armies) {
        if (!army) continue;
        let none = 0;
        let cap = 0;
        let h = 0;
        const list = bases(keep, opts);
        list.forEach((base, i) => {
          none += fight(base, army, keep, i, data, null);
          cap += fight(base, army, keep, i, data, captain);
          h += fight(base, army, keep, i, data, hero);
        });
        const n = list.length;
        rows.push({ id, keep, army: name, none: none / n, captain: cap / n, hero: h / n });
      }
    }
  }
  return rows;
}

const f1 = (n: number) => n.toFixed(1);
const d1 = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`;

export function previewMarkdown(buildings: BuildingRow[], heroes: HeroRow[], opts: PreviewOptions): string {
  const L: string[] = [];
  L.push('# Balance preview of the non-live content (generated)', '');
  L.push('Generated by `npm run balance:preview` (`tools/balance/preview.ts`) from `src/gameplay/data/planned.json`. Do not edit by hand. Reported only: nothing here is gated, and none of this content is live.', '');
  L.push(`Bases: generated at each Keep with mid-level buildings, ${opts.seeds} seed(s) × ${opts.layouts.length} layout(s) (${opts.layouts.join(', ')}). Armies fill the Keep's housing at its research caps and use the bot plan. Destruction % averaged over the bases.`, '');
  L.push('## Buildings', '');
  L.push('Each planned building is added at its catalog max level for the Keep (the Living Bamboo Wall replaces the Stone Walls). **Δ building** = with it − without it; **Δ effect** = with it − with its body only (the effect switched off). A counter doing its job shows a clearly negative Δ effect against "it beats" and little against "beats it". Events: counter actions per fight (every counter on the base, live ones included).', '');
  L.push('| Building | Keep | Army | Base % | With it % | Δ building | Δ effect | Events |', '|---|---|---|---|---|---|---|---|');
  for (const r of buildings) L.push(`| \`${r.id}\` | ${r.keep} | ${r.army} | ${f1(r.base)} | ${f1(r.withIt)} | ${d1(r.withIt - r.base)} | ${d1(r.withIt - r.bodyOnly)} | ${f1(r.events)} |`);
  L.push('', '## Heroes', '');
  L.push('The same army with no hero, with the live Shadow Captain at the Keep\'s level, and with the planned hero at its Keep level (its Hero Hall level would cap it).', '');
  L.push('| Hero | Keep | Army | No hero % | Shadow Captain % | Hero % | Hero vs Captain |', '|---|---|---|---|---|---|---|');
  for (const r of heroes) L.push(`| \`${r.id}\` | ${r.keep} | ${r.army} | ${f1(r.none)} | ${f1(r.captain)} | ${f1(r.hero)} | ${d1(r.hero - r.captain)} |`);
  L.push('');
  return L.join('\n');
}
