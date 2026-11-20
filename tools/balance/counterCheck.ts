/**
 * P6-18 (built-not-live section 4): the catalog's `counters` / `counteredBy` lists are design intent. Before the Codex
 * says "X counters Y" for a live building, check it: for each listed warrior, a one-warrior army filling the housing at
 * a Keep where both exist fights generated bases holding the building, with the building's effect on and with it
 * switched off (same base, same seed). A warrior the building counters should lose more destruction to the effect
 * than the warriors that counter the building do.
 */
import { generateOpponent } from '../../src/gameplay/sim/battle/basegen';
import { runBattle } from '../../src/gameplay/sim/battle/battle';
import { botDeployments } from '../../src/gameplay/sim/defense';
import { createBattle } from '../../src/gameplay/sim/battle/battle';
import { troopEarliestKeep } from '../../src/gameplay/sim/army';
import { defaultData } from '../../src/gameplay/sim/data';
import { createRng } from '../../src/gameplay/sim/rng';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { maxHousingAtHall } from '../../src/gameplay/sim/army';
import { BUILDINGS } from '../../src/gameplay/sim/progression';
import type { GameData } from '../../src/gameplay/sim/types';

interface CatalogEntry { id: string; live?: boolean; unlockKeep?: number; counters?: string[]; counteredBy?: string[] }

function withoutEffect(data: GameData, type: string): GameData {
  const d = structuredClone(data);
  const def = d.buildings[type] as unknown as { effect?: unknown; levels?: { effect?: unknown }[] };
  delete def.effect;
  for (const l of def.levels ?? []) delete l.effect;
  return d;
}

function runOne(data: GameData, base: ReturnType<typeof generateOpponent>, keep: number, troop: string, seed: number): number {
  const def = data.troops[troop];
  const n = Math.max(1, Math.floor(maxHousingAtHall(keep, data) / def.housing));
  const army = { [troop]: n };
  const levels = { [troop]: troopLevelCapAt(keep, data, troop) };
  const setup = { seed: seed ^ 0x5151, base: structuredClone(base), army, levels, infiltration: true };
  const probe = createBattle(structuredClone(setup), data);
  const deps = botDeployments(probe.deployable, probe.grid.size, army, createRng(seed), data, levels, probe.entry);
  return runBattle(setup, deps, data).result.destruction;
}

export interface CounterRow { building: string; keep: number; troop: string; side: 'counters' | 'counteredBy'; on: number; off: number; delta: number; n: number }

export function counterCheck(seeds = 6): CounterRow[] {
  const data = defaultData;
  const catalog = BUILDINGS as unknown as CatalogEntry[];
  const rows: CounterRow[] = [];
  for (const b of catalog.filter((x) => x.live && (x.counters?.length || x.counteredBy?.length))) {
    if (!data.buildings[b.id]) continue;
    const off = withoutEffect(data, b.id);
    for (const side of ['counters', 'counteredBy'] as const) {
      for (const troop of b[side] ?? []) {
        if (!data.troops[troop]) continue;
        const keep = Math.max(b.unlockKeep ?? 1, troopEarliestKeep(troop, data), 6);
        let on = 0, of = 0, n = 0;
        for (let s = 0; s < seeds * 4 && n < seeds; s++) {
          const seed = 7919 * keep + 104729 * s + 17;
          const base = generateOpponent(seed, keep, data);
          if (!base.buildings.some((x) => x.type === b.id)) continue;
          on += runOne(data, base, keep, troop, seed);
          of += runOne(off, base, keep, troop, seed);
          n++;
        }
        if (n) rows.push({ building: b.id, keep, troop, side, on: on / n, off: of / n, delta: (on - of) / n, n });
      }
    }
  }
  return rows;
}
