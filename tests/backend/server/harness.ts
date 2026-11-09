/** Shared setup for server tests: the core on a MemoryRepo with a test clock, players as in-process clients. */
import { COMMUNITY_RULES_VERSION } from '../../../src/backend/net/protocol';
import { createCore } from '../../../server/core';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { nodeContext, type SharedStores } from '../../../server/nodeContext';
import { MemoryRepo, type Repo } from '../../../server/repo';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { createBattle } from '../../../src/gameplay/sim/battle/battle';
import type { BaseLayout } from '../../../src/gameplay/sim/battle/types';
import { defaultData } from '../../../src/gameplay/sim/data';
import { raidWindow } from '../../../src/gameplay/sim/social/groveRaid';
import type { GameData } from '../../../src/gameplay/sim/types';

export const HOUR = 3_600_000;

/**
 * Ledger audit A1 (protocol 10): the battle seed comes from POST /v1/attacks/start, when the raid starts
 * to count, not with the match. Asking again for a started ticket gives the same seed.
 */
export async function startSeed(c: { startAttack?(ticket: string): Promise<{ seed?: number }> }, ticket: string): Promise<number> {
  if (!c.startAttack) throw new Error('this port cannot start raids');
  const r = await c.startAttack(ticket);
  if (typeof r.seed !== 'number') throw new Error('the server sent no battle seed');
  return r.seed;
}

export function world(opts: { data?: GameData; repo?: Repo; start?: number; shared?: SharedStores } = {}) {
  const data = opts.data ?? defaultData;
  const repo = opts.repo ?? new MemoryRepo();
  let t = opts.start ?? Date.UTC(2026, 3, 6, 12);
  let seed = 1;
  // Deterministic "random" so opponent picks are repeatable.
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const ctx = nodeContext(repo, data, () => t, random, opts.shared);
  // Deterministic ids too (bot Groves are seeded from the Grove id), so every run is the same.
  let ids = 0;
  ctx.uuid = () => `00000000-0000-4000-8000-${(++ids).toString(16).padStart(12, '0')}`;
  // And deterministic battle seeds (the server issues one per ticket).
  let seeds = 0;
  ctx.newSeed = () => Math.imul(++seeds, 0x9e3779b1) >>> 0;
  const core = createCore(ctx);
  const player = async (name: string, base?: BaseLayout) => {
    const c = new InProcessServerAdapter(core);
    const reg = await c.register(name);
    // Test players have accepted the community rules (report section 5 step 7: chat and names need them).
    await c.acceptRules({ version: COMMUNITY_RULES_VERSION });
    if (base) await c.uploadBase({ base });
    return Object.assign(c, { id: reg.playerId });
  };
  return {
    data,
    repo,
    core,
    player,
    now: () => t,
    advance: (ms: number) => (t += ms),
    setTime: (ms: number) => (t = ms),
    /** Jump past every new-player shield. */
    pastShields: () => (t += (data.raids.newPlayerShieldHours + 1) * HOUR),
    /** Move to `hours` into the next Grove Raid. */
    intoRaid: (hours = 1) => {
      const week = Math.floor((t - data.social.groveRaid.epoch) / (7 * 24 * HOUR)) + 1;
      t = raidWindow(week, data).start + hours * HOUR;
      return week;
    },
    raidEnd: (week: number) => raidWindow(week, data).end,
  };
}

/** A real-looking base at a hall level, with some loot on every building. */
export function baseAt(hall: number, seed = hall * 11, loot = 0): BaseLayout {
  const b = generateOpponent(seed, hall, defaultData);
  if (loot) for (const x of b.buildings) x.loot = { acorns: loot, dew: loot };
  return b;
}

export const sumLoot = (b: BaseLayout, k: 'acorns' | 'dew' = 'acorns') => b.buildings.reduce((s, x) => s + (x.loot?.[k] ?? 0), 0);

/** A small hedgehog rush along one edge. */
export function rush(n = 20) {
  return { army: { hedgehog_roller: n }, deployments: Array.from({ length: n }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + (i % 30) })) };
}

/**
 * A raid that destroys nothing: one Shinobi enters at the first Infiltration Point and the battle ends at
 * once (balance audit 2026-11-08: a battle with no warrior deployed is practice, so a settled raid needs one).
 */
export function noTroops(m: { base: BaseLayout }) {
  const army = { hedgehog_roller: 1 };
  const p = createBattle({ seed: 0, base: m.base, army, infiltration: true }, defaultData).entry!.points[0];
  return { army, deployments: [{ tick: 0, troop: 'hedgehog_roller', x: Math.floor(p.x), y: Math.floor(p.y) }], endTick: 1 };
}
