/**
 * Server-owned villages (roadmap Phase 2, steps 19-22). A player can move
 * their village to the server (POST /v1/village). From then on the game sends
 * what the player did as numbered commands (POST /v1/village/commands); the
 * server replays them with the game's own simulation (`applyCommand`), with
 * the time each one claims clamped to the server's clock, and answers with its
 * economy hash. If the game's hash differs, the answer carries the server's
 * economy and the game puts it in place: the server is the truth.
 *
 * Results the server makes itself (attack loot, raid losses, gifts, war
 * chests) are applied here too (`applyServerResult`), inside the transaction
 * of the request that made them, and every resource change goes in the ledger.
 */
import { capBaseLoot, layoutReset } from './pvp';
import { villageToBase } from '../../src/gameplay/sim/defense';
import { deserialize, serialize, type SaveFile } from '../../src/gameplay/sim/save';
import { BATTLE_COMMANDS, economyHash, economyOf, PLAYER_COMMANDS } from '../../src/gameplay/sim/serverEconomy';
import type { Resources, VillageState } from '../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, type Command } from '../../src/gameplay/sim/village';
import type { CommandBatch, CommandBatchResponse, CommandOutcome, LedgerResponse, VillageResponse } from '../../src/backend/net/protocol';
import type { CommandLogRow, LedgerEntry, Player, Repo, VillageRow } from '../repo';
import { ApiError, MIN, type ServerContext } from './context';

/** Most commands one batch may carry. */
export const MAX_BATCH = 200;
/** Commands that re-run a battle (trials, abandoned raids) per batch: they cost real CPU. */
export const MAX_BATTLES_PER_BATCH = 3;
/** A command may be dated this far ahead of the server's clock (phone clocks drift); later times count as now. */
export const CLOCK_SKEW_MS = 2 * MIN;

interface Loaded {
  row: VillageRow;
  state: VillageState;
}

async function load(repo: Repo, ctx: ServerContext, playerId: string, forUpdate: boolean): Promise<Loaded | null> {
  const row = await repo.getVillage(playerId, { forUpdate });
  if (!row) return null;
  // deserialize also upgrades a village stored by an older server build.
  return { row, state: deserialize(row.file, ctx.data) };
}

/** Ledger lines for every resource that changed. */
function ledgerDiff(playerId: string, before: Resources, after: Resources, at: number, reason: string, ref: string | null): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  for (const k of Object.keys({ ...before, ...after }) as (keyof Resources)[]) {
    const delta = Math.round((after[k] ?? 0) - (before[k] ?? 0));
    if (delta) out.push({ playerId, at, resource: k, delta, balance: Math.round(after[k] ?? 0), reason, ref });
  }
  return out;
}

function view(row: VillageRow): VillageResponse {
  return { file: row.file as SaveFile, revision: row.revision, seq: row.seq, at: row.at, stateHash: row.stateHash };
}

/** Keep the player's raid base in step with the village the server holds (layout, levels, real loot). */
async function refreshBase(repo: Repo, ctx: ServerContext, me: { id: string; name: string }, state: VillageState, at: number): Promise<void> {
  const base = capBaseLoot(villageToBase(state, at, ctx.data, me.name), ctx.data);
  const player = await repo.getPlayer(me.id);
  await repo.updatePlayer(me.id, { base, hallLevel: base.hallLevel, updatedAt: ctx.now(), ...(player ? layoutReset(ctx, player, base) : {}) });
}

export async function getVillage(ctx: ServerContext, me: Player): Promise<VillageResponse> {
  const row = await ctx.repo.getVillage(me.id);
  if (!row) throw new ApiError(404, 'no_village', 'Your village lives on this device, not on the server.');
  return view(row);
}

/**
 * Start keeping this player's village on the server: a new village (bringing
 * an existing one from a device is roadmap step 25). Safe to repeat: a
 * player who already has one gets it back.
 */
export async function startVillage(ctx: ServerContext, me: Player): Promise<VillageResponse> {
  const existing = await ctx.repo.getVillage(me.id);
  if (existing) return view(existing);
  const t = ctx.now();
  let state = createNewVillage(t, ctx.data);
  const bound = applyCommand(state, { type: 'netBind', playerId: me.id }, t, ctx.data);
  if (bound.ok) state = bound.state;
  // Raids and gifts from before belong to the old village on the device, not this one.
  state.net.defensesSince = t;
  state.trophies = me.trophies;
  state.shieldUntil = Math.max(state.shieldUntil, me.shieldUntil);
  const row: VillageRow = { playerId: me.id, file: serialize(state, t), revision: 1, seq: 0, at: t, stateHash: economyHash(state), createdAt: t, updatedAt: t };
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.createVillage(row))) return;
    // The opening balance, so the ledger adds up from the first line.
    const start = ledgerDiff(me.id, {} as Resources, state.resources, t, 'start', null);
    await tx.saveVillage({ ...row, revision: 2 }, 1, start, []);
    await refreshBase(tx, ctx, me, state, t);
  });
  await ctx.board.set(me.id, me.trophies, me.createdAt);
  return view((await ctx.repo.getVillage(me.id))!);
}

function badBatch(message: string): ApiError {
  return new ApiError(400, 'bad_request', message);
}

/**
 * Replay a batch of the player's commands (step 20). Already-applied numbers
 * are skipped (a retried batch changes nothing). Each command counts at the
 * time it claims, but never before the village's last change and never later
 * than the server's clock plus CLOCK_SKEW_MS (a fast clock cannot finish
 * timers early). Commands outside PLAYER_COMMANDS are refused, as are
 * commands the simulation refuses; either way the answer's hash and
 * corrections tell the game what really happened.
 */
export async function applyCommands(ctx: ServerContext, me: Player, body: CommandBatch | undefined): Promise<CommandBatchResponse> {
  const list = Array.isArray(body?.commands) ? body!.commands : null;
  if (!list) throw badBatch('commands must be a list');
  if (list.length > MAX_BATCH) throw badBatch(`At most ${MAX_BATCH} commands at a time.`);
  for (const c of list) {
    if (!c || !Number.isInteger(c.seq) || c.seq < 1 || !Number.isFinite(c.t) || !c.command || typeof c.command.type !== 'string') throw badBatch('Each command needs a seq, a time and a command.');
  }
  const sorted = [...list].sort((a, b) => a.seq - b.seq);
  return ctx.repo.transaction(async (tx) => {
    const loaded = await load(tx, ctx, me.id, true);
    if (!loaded) throw new ApiError(404, 'no_village', 'Your village lives on this device, not on the server.');
    const { row } = loaded;
    let state = loaded.state;
    let seq = row.seq;
    let at = row.at;
    let battles = 0;
    const now = ctx.now();
    const ledger: LedgerEntry[] = [];
    const log: CommandLogRow[] = [];
    const results: CommandOutcome[] = [];
    for (const c of sorted) {
      if (c.seq <= seq) continue; // applied before: a retried batch
      const clientAt = Number(c.t);
      const when = Math.max(at, clientAt > now + CLOCK_SKEW_MS ? now : clientAt);
      const type = c.command.type;
      let error: string | null = null;
      if (!PLAYER_COMMANDS.has(type)) error = 'NOT_ALLOWED';
      else if (BATTLE_COMMANDS.has(type) && ++battles > MAX_BATTLES_PER_BATCH) error = 'TOO_MANY_BATTLES';
      else {
        let r: ReturnType<typeof applyCommand>;
        try {
          r = applyCommand(state, c.command as Command, when, ctx.data);
        } catch {
          r = { ok: false, code: 'INVALID_BATTLE', message: 'That command could not be read.' };
        }
        if (r.ok) {
          // Purchases are trusted from the game until the server checks store receipts (Phase 4).
          const reason = type === 'grantPurchase' ? 'purchase:unverified' : `command:${type}`;
          ledger.push(...ledgerDiff(me.id, state.resources, r.state.resources, when, reason, String(c.seq)));
          state = r.state;
        } else error = r.code;
      }
      ctx.metrics.count('tk_village_commands_total', { result: error ? 'refused' : 'ok' });
      results.push(error ? { seq: c.seq, ok: false, error } : { seq: c.seq, ok: true });
      log.push({ playerId: me.id, seq: c.seq, at: when, clientAt, type, command: c.command, ok: !error, error });
      seq = c.seq;
      at = when;
    }
    const stateHash = economyHash(state);
    if (results.length) {
      const next: VillageRow = { ...row, file: serialize(state, at), revision: row.revision + 1, seq, at, stateHash, updatedAt: now };
      if (!(await tx.saveVillage(next, row.revision, ledger, log))) throw new ApiError(409, 'conflict', 'Your village changed at the same moment. Try again.');
      await refreshBase(tx, ctx, me, state, at);
    }
    const out: CommandBatchResponse = { ackSeq: Math.max(seq, row.seq), revision: results.length ? row.revision + 1 : row.revision, stateHash, results };
    if (typeof body!.stateHash !== 'string' || body!.stateHash !== stateHash) {
      out.corrections = { economy: economyOf(state), at };
      ctx.metrics.count('tk_village_corrections_total');
    }
    return out;
  });
}

/**
 * Apply a result the server made (an attack's troops and loot, a raid's
 * losses, a gift, a war chest) to a server-held village, inside the caller's
 * transaction, with ledger lines. Null when the player's village lives on
 * their device (nothing to do); otherwise the simulation's verdict.
 */
export async function applyServerResult(tx: Repo, ctx: ServerContext, player: { id: string; name: string }, steps: { cmd: Command; reason: string }[], ref: string | null): Promise<{ ok: true } | { ok: false; message: string } | null> {
  const loaded = await load(tx, ctx, player.id, true);
  if (!loaded) return null;
  const { row } = loaded;
  const now = ctx.now();
  const when = Math.max(row.at, now);
  let state = loaded.state;
  const ledger: LedgerEntry[] = [];
  // All the steps or none: the first refusal leaves the village as it was.
  for (const { cmd, reason } of steps) {
    const r = applyCommand(state, cmd, when, ctx.data);
    if (!r.ok) return { ok: false, message: r.message };
    ledger.push(...ledgerDiff(player.id, state.resources, r.state.resources, when, reason, ref));
    state = r.state;
  }
  const next: VillageRow = { ...row, file: serialize(state, when), revision: row.revision + 1, at: when, stateHash: economyHash(state), updatedAt: now };
  if (!(await tx.saveVillage(next, row.revision, ledger, []))) throw new ApiError(409, 'conflict', 'Your village changed at the same moment. Try again.');
  await refreshBase(tx, ctx, player, state, when);
  return { ok: true };
}

/** The player's recent ledger lines, newest first (support, and "where did my coins go"). */
export async function ledger(ctx: ServerContext, me: Player, limit: unknown): Promise<LedgerResponse> {
  const n = Math.max(1, Math.min(200, Number(limit) || 50));
  return { entries: (await ctx.repo.ledgerOf(me.id, n)).map((l) => ({ at: l.at, resource: l.resource, delta: l.delta, balance: l.balance, reason: l.reason })) };
}

/** Rebuild the player's raid base from the village the server holds. */
export async function refreshBaseFromVillage(ctx: ServerContext, me: { id: string; name: string }): Promise<void> {
  const loaded = await load(ctx.repo, ctx, me.id, false);
  if (loaded) await refreshBase(ctx.repo, ctx, me, loaded.state, Math.max(loaded.row.at, ctx.now()));
}

/** True when this player's village lives on the server. */
export async function hasServerVillage(repo: Repo, playerId: string): Promise<boolean> {
  return Boolean(await repo.getVillage(playerId));
}
