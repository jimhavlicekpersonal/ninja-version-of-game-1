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
import { contentHash } from '../contentHash';
import { villageToBase } from '../../src/gameplay/sim/defense';
import { deserialize, serialize, type SaveFile } from '../../src/gameplay/sim/save';
import { BATTLE_COMMANDS, economyHash, PLAYER_COMMANDS } from '../../src/gameplay/sim/serverEconomy';
import type { Resources, VillageState } from '../../src/gameplay/sim/types';
import { applyCommand, createNewVillage, type Command } from '../../src/gameplay/sim/village';
import type { CommandBatch, CommandBatchResponse, CommandOutcome, LedgerResponse, VillageResponse } from '../../src/backend/net/protocol';
import type { CommandLogRow, LedgerEntry, Player, Repo, VillageRow } from '../repo';
import { ApiError, HOUR, MIN, type ServerContext } from './context';
import { BATTLE_COMMANDS_PER_MINUTE, MemoryRateLimiter, type RateLimiter } from '../rateLimit';
import { ResimBusyError } from '../resim/resim';
import { replayVillage, type ReplayStep, type VillageReplayJob, type VillageReplayOutcome } from './villageReplay';

/** Most commands one batch may carry. */
export const MAX_BATCH = 200;
/** Commands that re-run a battle (trials, abandoned raids) per batch: they cost real CPU. */
export const MAX_BATTLES_PER_BATCH = 3;
/** Devices whose command numbers a village remembers (GLOBAL-009). */
export const MAX_DEVICES = 16;
/** A command may be dated this far ahead of the server's clock (phone clocks drift); later times count as now. */
export const CLOCK_SKEW_MS = 2 * MIN;
/**
 * A command may be dated at most this far before the server's clock (re-audit:
 * backdated commands replayed a year of collector output and finished a Keep
 * upgrade the moment it started). Offline play older than this is applied at
 * this bound instead (its timers count from there), and the device takes the
 * correction the answer carries.
 */
export const MAX_BACKDATE_MS = 12 * HOUR;
/** Largest command, as JSON bytes; a larger one is refused (`TOO_LARGE`) and only its type is logged. */
export const MAX_COMMAND_BYTES = 8 * 1024;
/** Battle commands carry a battle record (a Keep 15 base and up to 2,000 deployments: ~120 KB). */
export const MAX_BATTLE_COMMAND_BYTES = 192 * 1024;
/**
 * Battle commands (trialEnd, abandonBattle) one player may send per minute,
 * across batches and, through the shared rate limiter, across instances
 * (`battleCommands` in DEFAULT_RATE_LIMITS). Each runs a whole battle inside
 * `applyCommand`, so a batch that carries one is replayed whole (backend A3,
 * `replayVillage`) in the re-simulation pool before the row is locked, and
 * written only if the village did not change meanwhile; the cap stays as a
 * CPU budget per player.
 */
export { BATTLE_COMMANDS_PER_MINUTE };
/** Longest command type kept in the log for a refused command. */
const MAX_LOGGED_TYPE = 40;

/** The HTTP adapter shares its rate limiter with the core (`nodeContext`); tests and tools get one per context. */
const ownLimiters = new WeakMap<ServerContext, RateLimiter>();
function limiterOf(ctx: ServerContext): RateLimiter {
  const shared = (ctx as ServerContext & { limiter?: RateLimiter }).limiter;
  if (shared) return shared;
  let l = ownLimiters.get(ctx);
  if (!l) ownLimiters.set(ctx, (l = new MemoryRateLimiter()));
  return l;
}

const commandBytes = (c: unknown): number => {
  try {
    return Buffer.byteLength(JSON.stringify(c) ?? '');
  } catch {
    return Infinity;
  }
};

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
  // Backend A17: most batches (a timer, an order) leave the raid base as it was: no second big row write.
  if (player?.base && player.hallLevel === base.hallLevel && contentHash(player.base) === contentHash(base)) return;
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
 * time it claims, but never before the village's last change or
 * MAX_BACKDATE_MS ago, and never later than the server's clock plus
 * CLOCK_SKEW_MS (a fast clock cannot finish timers early). Commands outside
 * PLAYER_COMMANDS are refused, as are commands the simulation refuses; either
 * way the answer's hash and corrections tell the game what really happened.
 *
 * A refused command is logged by type and error only (never its body), and a
 * batch that changed nothing records its command numbers without rewriting the
 * village or the raid base (re-audit: junk batches filled the database).
 * Once a device-numbered queue has written to the village, a batch without a
 * device id (a game from before GLOBAL-009) is refused with 426: its numbers
 * cannot be told apart from the village's own, so it would be acknowledged
 * and silently dropped.
 */
export async function applyCommands(ctx: ServerContext, me: Player, body: CommandBatch | undefined): Promise<CommandBatchResponse> {
  const list = Array.isArray(body?.commands) ? body!.commands : null;
  if (!list) throw badBatch('commands must be a list');
  if (list.length > MAX_BATCH) throw badBatch(`At most ${MAX_BATCH} commands at a time.`);
  for (const c of list) {
    if (!c || !Number.isInteger(c.seq) || c.seq < 1 || !Number.isFinite(c.t) || !c.command || typeof c.command.type !== 'string') throw badBatch('Each command needs a seq, a time and a command.');
  }
  const sorted = [...list].sort((a, b) => a.seq - b.seq);
  const device = typeof body!.device === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(body!.device) ? body!.device : null;
  // Refusals decided before the replay, by command number: a retry after a conflict reuses them, so the
  // battle budget (a rate limit) is not spent twice for one command.
  const decided = new Map<number, string | null>();
  const plan = async (repo: Repo, row: VillageRow) => {
    if (!device && row.deviceSeqs && Object.keys(row.deviceSeqs).length) {
      ctx.metrics.count('tk_refused_total', { reason: 'commands_without_device', rules: '?' });
      throw new ApiError(426, 'version_mismatch', 'This village is already played with a newer version of Kagemura. Update the game on this device to keep playing online.');
    }
    const lastSeq = device ? (row.deviceSeqs?.[device] ?? 0) : row.seq;
    const now = ctx.now();
    const steps: ReplayStep[] = [];
    let battles = 0;
    for (const c of sorted) {
      if (c.seq <= lastSeq) continue; // applied before: a retried batch
      const type = c.command.type;
      const battle = BATTLE_COMMANDS.has(type);
      let error: string | null;
      if (decided.has(c.seq)) error = decided.get(c.seq)!;
      else {
        error = null;
        if (!PLAYER_COMMANDS.has(type)) error = 'NOT_ALLOWED';
        else if (commandBytes(c.command) > (battle ? MAX_BATTLE_COMMAND_BYTES : MAX_COMMAND_BYTES)) error = 'TOO_LARGE';
        else if (type === 'setProfile' && (c.command as { under18?: unknown }).under18 === false && (await repo.getAgeGroup(me.id))?.under18) error = 'LOCKED'; // GLOBAL-006: under 18 stays (staff can reset)
        else if (battle && (++battles > MAX_BATTLES_PER_BATCH || !(await limiterOf(ctx).hit('battleCommands', me.id, now)).ok)) error = 'TOO_MANY_BATTLES';
        decided.set(c.seq, error);
      }
      steps.push({ seq: c.seq, clientAt: Number(c.t), command: c.command as Command, error });
    }
    const job: VillageReplayJob = { file: row.file, at: row.at, now, earliest: now - MAX_BACKDATE_MS, skewMs: CLOCK_SKEW_MS, steps };
    return { job, battles: steps.some((s) => !s.error && BATTLE_COMMANDS.has(s.command.type)) };
  };

  // Backend A3: a batch with battle commands is replayed in a worker thread before the row is locked, then
  // written only if the village is still the one it was replayed on (else replayed again, a few times).
  // Other batches replay in place under the lock, as before (cheap; no thread hop for a ~300 KB file).
  for (let attempt = 0; ; attempt++) {
    let pre: { row: VillageRow; out: VillageReplayOutcome } | null = null;
    if (ctx.resim.replayVillage && sorted.some((c) => BATTLE_COMMANDS.has(c.command.type))) {
      const row = await ctx.repo.getVillage(me.id);
      if (!row) throw new ApiError(404, 'no_village', 'Your village lives on this device, not on the server.');
      const p = await plan(ctx.repo, row);
      if (p.battles) {
        try {
          pre = { row, out: await ctx.resim.replayVillage(p.job, ctx.data) };
        } catch (e) {
          if (e instanceof ResimBusyError) {
            ctx.metrics.count('tk_resim_busy_total', { kind: 'village' });
            throw new ApiError(503, 'busy', e.message);
          }
          throw e;
        }
        ctx.metrics.observe('tk_resim_ms', pre.out.ms, { kind: 'village' });
      }
    }
    const answer = await ctx.repo.transaction(async (tx) => {
      const row = await tx.getVillage(me.id, { forUpdate: true });
      if (!row) throw new ApiError(404, 'no_village', 'Your village lives on this device, not on the server.');
      if (pre && row.revision !== pre.row.revision) return null; // changed meanwhile: replay again
      const out = pre ? pre.out : replayVillage((await plan(tx, row)).job, ctx.data);
      return commit(tx, row, out);
    });
    if (answer) return answer;
    ctx.metrics.count('tk_village_replay_conflicts_total');
    if (attempt >= 2) throw new ApiError(409, 'conflict', 'Your village changed at the same moment. Try again.');
  }

  async function commit(tx: Repo, row: VillageRow, out: VillageReplayOutcome): Promise<CommandBatchResponse> {
    const now = ctx.now();
    let seq = row.seq;
    const deviceSeqs = { ...(row.deviceSeqs ?? {}) };
    let deviceSeq = device ? (deviceSeqs[device] ?? 0) : 0;
    const log: CommandLogRow[] = [];
    const results: CommandOutcome[] = [];
    const byNumber = new Map(sorted.map((c) => [c.seq, c]));
    for (const o of out.outcomes) {
      const c = byNumber.get(o.seq)!;
      const type = c.command.type;
      if (o.ok && type === 'setProfile' && (c.command as { under18?: unknown }).under18 === true) await tx.setAgeGroup(me.id, true, now);
      ctx.metrics.count('tk_village_commands_total', { result: o.error ? 'refused' : 'ok' });
      results.push(o.error ? { seq: o.seq, ok: false, error: o.error } : { seq: o.seq, ok: true });
      if (device) {
        seq += 1;
        deviceSeq = o.seq;
      } else seq = o.seq;
      if (o.error) {
        // Type and reason only: a refused command's body is never stored (it can be anything up to the body limit).
        const shortType = type.slice(0, MAX_LOGGED_TYPE);
        log.push({ playerId: me.id, seq, at: o.when, clientAt: Number(c.t), type: shortType, command: { type: shortType }, ok: false, error: o.error });
      } else log.push({ playerId: me.id, seq, at: o.when, clientAt: Number(c.t), type, command: c.command, ok: true, error: null });
    }
    const { stateHash, at } = out;
    if (results.length) {
      if (device) {
        // Most recent devices first; an old device beyond the limit starts over safely with a new id.
        delete deviceSeqs[device];
        const kept = Object.entries(deviceSeqs).slice(-(MAX_DEVICES - 1));
        Object.keys(deviceSeqs).forEach((k) => delete deviceSeqs[k]);
        for (const [k, v] of kept) deviceSeqs[k] = v;
        deviceSeqs[device] = deviceSeq;
      }
      const ledger: LedgerEntry[] = out.ledger.map((l) => ({ playerId: me.id, ...l }));
      const written =
        out.applied && out.file
          ? await tx.saveVillage({ ...row, file: out.file, revision: row.revision + 1, seq, at, stateHash, updatedAt: now, ...(device ? { deviceSeqs } : {}) }, row.revision, ledger, log)
          : // Nothing changed: only the command numbers (and the short log lines) are written, not the ~300 KB village or the raid base.
            await tx.recordVillageCommands({ playerId: me.id, revision: row.revision + 1, seq, updatedAt: now, ...(device ? { deviceSeqs } : {}) }, row.revision, log);
      if (!written) throw new ApiError(409, 'conflict', 'Your village changed at the same moment. Try again.');
      if (out.applied && out.file) await refreshBase(tx, ctx, me, deserialize(out.file, ctx.data), at);
    }
    const res: CommandBatchResponse = { ackSeq: device ? deviceSeq : Math.max(seq, row.seq), revision: results.length ? row.revision + 1 : row.revision, stateHash, results };
    if (typeof body!.stateHash !== 'string' || body!.stateHash !== stateHash) {
      res.corrections = { economy: out.economy, at };
      ctx.metrics.count('tk_village_corrections_total');
    }
    return res;
  }
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
