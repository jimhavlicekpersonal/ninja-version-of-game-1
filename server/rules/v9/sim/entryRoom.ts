/**
 * Room for an attack (defense review 2026-11-17).
 *
 * Warriors enter a base at its Infiltration Points, and each point sits on the deployable tile nearest one of the
 * eight compass approaches (battle/infiltration.ts). No tile within `battle.deployMarginTiles` of a building or
 * wall is deployable. So buildings and walls spread one tile apart close the whole map: no point, no warrior on
 * the field, and every raid counts as held. It was reproduced at Keeps 6 to 15 with every building at level 1
 * (131 buildings and 36 walls at Keep 6): 152 raids of 152 deployed nothing, and each paid the hold reward and
 * honor. A real attacker would have been turned away the same way.
 *
 * The rule (`economy.json` `entryRoom`): a layout must leave a deployable tile within `tiles` of at least
 * `approaches` of the eight approaches. A point then sits by each of those, far enough apart that their covers
 * add up to more than a whole army. Checked where a layout changes or arrives: `place` and `move`, a village
 * moved to the server, and a base a device sends for others to raid. It is not a battle rule: a battle plays
 * exactly as before on every base.
 */
import { buildingDef } from './data';
import type { GameData } from './types';

/** The eight approaches (map corners and edge midpoints), as `planInfiltration` reads them. */
function entryApproaches(size: number, data: GameData): [number, number][] {
  const lo = data.battle.infiltration.insetTiles;
  const hi = size - lo;
  const mid = size / 2;
  return [[lo, lo], [mid, lo], [hi, lo], [hi, mid], [hi, hi], [mid, hi], [lo, hi], [lo, mid]];
}

/** How many of the eight approaches this layout leaves a deployable tile near (within `entryRoom.tiles`). */
export function openApproaches(buildings: readonly { type: string; x: number; y: number }[], data: GameData): number {
  const size = data.economy.mapSize;
  const reach = data.economy.entryRoom?.tiles ?? 0;
  const m = data.battle.deployMarginTiles;
  const closed = new Uint8Array(size * size);
  for (const b of buildings) {
    const def = data.buildings[b.type];
    if (!def) continue;
    // What a battle counts: traps never block a deployment; decorations and obstacles are not on the battlefield.
    const c = buildingDef(data, b.type).category;
    if (c === 'trap' || c === 'decor' || c === 'obstacle') continue;
    for (let y = Math.max(0, b.y - m); y < Math.min(size, b.y + def.size + m); y++) {
      for (let x = Math.max(0, b.x - m); x < Math.min(size, b.x + def.size + m); x++) closed[y * size + x] = 1;
    }
  }
  let open = 0;
  for (const [ax, ay] of entryApproaches(size, data)) {
    let found = false;
    for (let y = Math.max(0, Math.floor(ay - reach)); y < Math.min(size, Math.ceil(ay + reach)) && !found; y++) {
      for (let x = Math.max(0, Math.floor(ax - reach)); x < Math.min(size, Math.ceil(ax + reach)) && !found; x++) {
        if (closed[y * size + x]) continue;
        const dx = x + 0.5 - ax;
        const dy = y + 0.5 - ay;
        if (dx * dx + dy * dy <= reach * reach) found = true;
      }
    }
    if (found) open++;
  }
  return open;
}

/** Whether attackers can still get in: enough approaches open (always true without the rule in the data). */
export function leavesEntryRoom(buildings: readonly { type: string; x: number; y: number }[], data: GameData): boolean {
  const rule = data.economy.entryRoom;
  return !rule || openApproaches(buildings, data) >= rule.approaches;
}
