/**
 * Moving a village from a device to the server (roadmap step 25), once, with
 * sanity limits for its Keep. The server cannot know how the village was
 * built (it lived on the device), so it refuses what no real village at that
 * Keep could hold: buildings the Keep does not allow, more resources than the
 * storages hold, an army or Lodge bigger than the Keep's, warriors or research
 * the Keep cannot have, timers that end absurdly late, and more Jade than
 * IMPORT_MAX_JADE. What passes becomes the server's village; from then on
 * every change is checked.
 */
import { maxHousingAtHall, troopEarliestKeep } from '../../src/gameplay/sim/army';
import { villageToBase } from '../../src/gameplay/sim/defense';
import { troopLevelCapAt } from '../../src/gameplay/sim/research';
import { capacity } from '../../src/gameplay/sim/resources';
import { deserialize, serialize } from '../../src/gameplay/sim/save';
import { economyHash } from '../../src/gameplay/sim/serverEconomy';
import { reinforcementHousing } from '../../src/gameplay/sim/social/grove';
import type { GameData, VillageState } from '../../src/gameplay/sim/types';
import { bindPlayer } from '../../src/gameplay/sim/net';
import { hallLevel } from '../../src/gameplay/sim/village';
import type { VillageResponse } from '../../src/backend/net/protocol';
import type { Player, VillageRow } from '../repo';
import { ApiError, HOUR, type ServerContext } from './context';
import { maxReinforcementAt, normalizeBase } from './pvp';
import { getVillage } from './village';

/** Free Jade a player could have earned (starting Jade, tasks, pass, achievements) with room to spare; bought Jade moves with purchases (Phase 4). */
export const IMPORT_MAX_JADE = 20_000;
/** No timer may end later than this after the move (the longest Keep upgrade is about a week). */
export const IMPORT_MAX_TIMER_MS = 30 * 24 * HOUR;

/** Why this village could not exist at its Keep, or null when it passes. */
export function importProblem(s: VillageState, now: number, data: GameData): string | null {
  const keep = hallLevel(s, data);
  const base = normalizeBase(villageToBase(s, now, data), data);
  if ('error' in base) return `Buildings: ${base.error}.`;
  const cap = capacity(s, data);
  for (const k of ['acorns', 'dew', 'nightsap'] as const) if ((s.resources[k] ?? 0) > (cap[k] ?? 0)) return `More ${k} than the storages hold.`;
  if ((s.resources.moonstones ?? 0) > IMPORT_MAX_JADE) return 'More Jade than a village can have earned.';
  let housing = 0;
  const queued = s.training.map((t) => t.troop);
  for (const [t, n] of [...Object.entries(s.army), ...queued.map((q) => [q, 1] as [string, number])]) {
    const def = data.troops[t];
    if (!def || !(n >= 0)) return 'Unknown warriors.';
    if (n > 0 && troopEarliestKeep(t, data) > keep) return `Warriors this Keep cannot train (${def.name}).`;
    housing += def.housing * n;
  }
  // Ready warriors and the queue together fit the camps plus one more army (the next-army queue).
  if (housing > 2 * maxHousingAtHall(keep, data)) return 'A bigger army than this Keep can house.';
  if (reinforcementHousing(s, data) > maxReinforcementAt(keep, data)) return 'More donated warriors than this Keep’s Lodge holds.';
  for (const [t, lvl] of Object.entries(s.research.levels)) {
    if (!data.troops[t] || lvl > Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length)) return 'Research beyond what this Keep allows.';
  }
  const timers = [...s.buildings.map((b) => b.upgrade?.endsAt ?? 0), ...s.training.map((t) => t.endsAt), ...s.research.active.map((r) => r.endsAt)];
  if (timers.some((t) => t > now + IMPORT_MAX_TIMER_MS)) return 'A timer that ends impossibly late.';
  return null;
}

/** POST /v1/village/import: the device's village becomes the server's (once). */
export async function importVillage(ctx: ServerContext, me: Player, body: { file?: unknown } | undefined): Promise<VillageResponse> {
  if (await ctx.repo.getVillage(me.id)) throw new ApiError(409, 'conflict', 'Your village is already kept on the server.');
  let state: VillageState;
  try {
    state = deserialize(body?.file, ctx.data);
  } catch (e) {
    throw new ApiError(400, 'bad_request', `That village could not be read: ${(e as Error).message}`);
  }
  const t = ctx.now();
  const problem = importProblem(state, t, ctx.data);
  if (problem) {
    ctx.log('warn', 'village import refused', { player: me.id, problem });
    throw new ApiError(400, 'bad_request', `This village cannot move to the server: ${problem}`);
  }
  // Exactly as sent (no settling: the economy must stay the game's), with the server's own facts:
  // the player, honor, shield, and raids already seen.
  bindPlayer(state, me.id);
  state.trophies = me.trophies;
  state.shieldUntil = me.shieldUntil;
  state.net.defensesSince = Math.max(state.net.defensesSince, t);
  const at = Math.min(t, Math.max(state.lastSeenAt, state.createdAt));
  const row: VillageRow = { playerId: me.id, file: serialize(state, at), revision: 1, seq: 0, at, stateHash: economyHash(state), createdAt: t, updatedAt: t };
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.createVillage(row))) throw new ApiError(409, 'conflict', 'Your village is already kept on the server.');
    const opening = (Object.entries(state.resources) as [string, number][]).filter(([, v]) => v).map(([k, v]) => ({ playerId: me.id, at: t, resource: k, delta: Math.round(v), balance: Math.round(v), reason: 'import', ref: null }));
    await tx.saveVillage({ ...row, revision: 2 }, 1, opening, []);
  });
  return getVillage(ctx, me);
}
