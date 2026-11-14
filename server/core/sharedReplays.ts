/**
 * Shared replays (retention audit G14, growth batch 2026-11-14; rules in src/backend/net/growth.ts).
 *
 * A player chooses to share one of their replays (every share is its own choice; nothing is shared on
 * its own). The server checks it can play the battle rules the replay names (`ctx.rules.forTicket`;
 * otherwise `422`), bounds the base and deployments, re-simulates the battle exactly as fought in the
 * re-simulation pool and keeps ITS result, then stores it under a 10-letter code for
 * `SHARED_REPLAY_DAYS`. Privacy: the base's name is dropped, the opponent is never named (only
 * whether it was a real player, a generated base or practice; a base marked as generated or practice is
 * labelled so whatever the request says), and the sharer's name is included only
 * when an adult asks for it. Under-13 accounts cannot share (no external sharing for them).
 * Anyone with the code may watch (`GET`, no token); the sharer may delete it; account deletion
 * removes the sharer's replays.
 */
import { FRIEND_CODE_ALPHABET } from '../../src/backend/net/names';
import { SHARE_CODE, SHARED_REPLAY_DAYS, SHARED_REPLAYS_PER_DAY, type ShareReplayRequest, type ShareReplayResponse, type SharedOpponent, type SharedReplayView } from '../../src/backend/net/growth';
import type { BaseLayout, Deployment } from '../../src/gameplay/sim/battle/types';
import { growthOf } from '../growthRepo';
import type { Player } from '../repo';
import { ResimBusyError } from '../resim/resim';
import { HOUR, type ServerContext } from './context';
import { busyCode, fail } from './errors';

const DAY = 24 * HOUR;
const OPPONENTS: readonly SharedOpponent[] = ['player', 'generated', 'practice'];
/** Deployments one shared replay may carry (as battle reports). */
const MAX_DEPLOYMENTS = 2000;
/** A shared replay's request as JSON (a Keep 15 base and a full battle are ~120 KB). */
const MAX_BYTES = 200_000;

function newCode(ctx: ServerContext): string {
  let code = '';
  while (code.length < 10) {
    for (const ch of ctx.newToken()) {
      const v = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'.indexOf(ch);
      if (v >= 0 && v < 62 && code.length < 10) code += FRIEND_CODE_ALPHABET[v % FRIEND_CODE_ALPHABET.length];
    }
  }
  return code;
}

function cleanDeployments(raw: unknown): Deployment[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_DEPLOYMENTS) return null;
  const out: Deployment[] = [];
  for (const d of raw as Record<string, unknown>[]) {
    if (!d || typeof d.troop !== 'string' || d.troop.length > 40) return null;
    for (const k of ['tick', 'x', 'y'] as const) if (typeof d[k] !== 'number' || !Number.isFinite(d[k])) return null;
    out.push({ ...(d as unknown as Deployment) });
  }
  return out;
}

/** POST /v1/replays/shared. */
export async function share(ctx: ServerContext, me: Player, body: ShareReplayRequest | undefined): Promise<ShareReplayResponse> {
  const band = (await ctx.repo.getAgeBand(me.id))?.band ?? null;
  if (band === 'under13') throw fail(403, 'age_restricted', 'replay.not_for_age');
  const g = growthOf(ctx.repo);
  const now = ctx.now();
  if ((await g.sharedReplaysOf(me.id, now - DAY)).length >= SHARED_REPLAYS_PER_DAY) throw fail(429, 'rate_limited', 'replay.too_many', { n: SHARED_REPLAYS_PER_DAY });
  if (!body || typeof body !== 'object' || !body.setup || typeof body.setup !== 'object') throw fail(400, 'bad_request', 'replay.bad');
  const rules = Number(body.rules);
  const engine = Number.isInteger(rules) ? ctx.rules.forTicket(rules, typeof body.dataVersion === 'string' ? body.dataVersion : undefined) : null;
  if (!engine) throw fail(422, 'bad_request', 'replay.rules');
  // The base exactly as fought (a generated fortress may carry `power`, a rival outpost `rival`), without its name;
  // bounded like a stored base, and re-simulated as it is, so the stored result is the battle the sharer saw.
  const raw = body.setup.base as unknown as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.buildings) || !raw.buildings.length || raw.buildings.length > 400) throw fail(400, 'bad_request', 'replay.bad');
  if (JSON.stringify(body).length > MAX_BYTES) throw fail(400, 'bad_request', 'replay.bad');
  const base = { ...(raw as unknown as BaseLayout), name: '' };
  const deployments = cleanDeployments(body.deployments);
  if (!deployments) throw fail(400, 'bad_request', 'replay.bad');
  const s = body.setup;
  const army = s.army && typeof s.army === 'object' ? s.army : null;
  if (!army || Object.keys(army).length > 80 || !Number.isInteger(s.seed)) throw fail(400, 'bad_request', 'replay.bad');
  const setup = { ...s, base };
  const endTick = Number.isInteger(body.endTick) ? body.endTick : undefined;
  let result;
  try {
    result = (await ctx.resim.run(engine, setup, deployments, endTick)).result;
  } catch (e) {
    if (e instanceof ResimBusyError) throw fail(503, 'busy', busyCode(e.message));
    throw fail(400, 'bad_request', 'replay.bad');
  }
  const showName = body.showName === true && band === 'adult';
  // Honesty: a base the game generated is labelled so whatever the request says.
  const asked: SharedOpponent = OPPONENTS.includes(body.opponent) ? body.opponent : 'player';
  const opponent: SharedOpponent = base.practice ? 'practice' : base.rival || (raw as { power?: unknown }).power !== undefined ? 'generated' : asked;
  const expiresAt = now + SHARED_REPLAY_DAYS * DAY;
  const record = { at: now, rules, setup, deployments, ...(endTick !== undefined ? { endTick } : {}), result: { stars: result.stars, destruction: result.destruction }, sharerName: showName ? me.name : null, opponent };
  for (let i = 0; i < 4; i++) {
    const code = newCode(ctx);
    if (await g.addSharedReplay({ id: code, ownerId: me.id, at: now, expiresAt, rules, dataVersion: engine.dataVersion, record, views: 0 })) {
      ctx.metrics.count('tk_shared_replays_total', { what: 'shared' });
      return { code, expiresAt };
    }
  }
  throw fail(503, 'busy', 'replay.try_again');
}

/** GET /v1/replays/shared/:code (no token). */
export async function get(ctx: ServerContext, rawCode: string): Promise<SharedReplayView> {
  const code = String(rawCode ?? '').toUpperCase();
  if (!SHARE_CODE.test(code)) throw fail(404, 'not_found', 'replay.not_found');
  const r = await growthOf(ctx.repo).getSharedReplay(code, ctx.now(), true);
  if (!r) throw fail(404, 'not_found', 'replay.not_found');
  const rec = r.record as Omit<SharedReplayView, 'code' | 'expiresAt' | 'views'>;
  ctx.metrics.count('tk_shared_replays_total', { what: 'viewed' });
  return { ...rec, code: r.id, expiresAt: r.expiresAt, views: r.views };
}

/** DELETE /v1/replays/shared/:code (the sharer). */
export async function remove(ctx: ServerContext, me: Player, rawCode: string): Promise<{ deleted: boolean }> {
  return { deleted: await growthOf(ctx.repo).deleteSharedReplay(String(rawCode ?? '').toUpperCase(), me.id) };
}

/** GET /v1/replays/shared: the player's own shares (newest first, still open). */
export async function mine(ctx: ServerContext, me: Player): Promise<{ shares: { code: string; at: number; expiresAt: number; views: number }[] }> {
  const now = ctx.now();
  const rows = await growthOf(ctx.repo).sharedReplaysOf(me.id, now - SHARED_REPLAY_DAYS * DAY);
  return { shares: rows.filter((r) => r.expiresAt > now).map((r) => ({ code: r.id, at: r.at, expiresAt: r.expiresAt, views: r.views })) };
}
