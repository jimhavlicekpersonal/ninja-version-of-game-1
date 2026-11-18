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
 *
 * Third verification fixes 2026-11-14: the daily limit counts shares made (`shared_replay_log`), so deleting
 * one does not give it back (8a); only the battle fields the game knows are stored and served (`pickSetup`,
 * `cleanDeployments`: anything else a request carries is dropped, 8b); when the server finds the raid (this
 * player's attack record with the battle's seed) it labels the opponent a real player and keeps the defender's
 * id (never shown) so a defender who is under 18, chose "don't allow my base in shared replays", or deletes
 * their account is never in one (8c; `replay.base_private`, the same answer for each, so no age is revealed).
 *
 * Last gaps 2026-11-14: the label `player` needs that record (or a recorded raid on the sharer's own base with the
 * seed, a shared defense). Without one the request's `player` becomes `practice` ("A practice battle."), the
 * label that claims no real opponent; `generated` and `practice` requests keep theirs. Sharing is not refused, so
 * replays older than the records stay shareable, but nobody is told a battle was against a real player when the
 * server cannot show it was.
 */
import { FRIEND_CODE_ALPHABET } from '../../src/backend/net/names';
import { SHARE_CODE, SHARED_REPLAY_DAYS, SHARED_REPLAYS_PER_DAY, type ShareReplayRequest, type ShareReplayResponse, type SharedOpponent, type SharedReplayView } from '../../src/backend/net/growth';
import type { BaseBuilding, BaseLayout, BattleSetup, Deployment } from '../../src/gameplay/sim/battle/types';
import type { GameData } from '../../src/gameplay/sim/types';
import { masteryOn } from '../../src/gameplay/sim/mastery';
import { masteryBonus } from '../../src/gameplay/sim/progression';
import { DELETED_PLAYER, type Player } from '../repo';
import { ResimBusyError } from '../resim/resim';
import { HOUR, type ServerContext } from './context';
import { ageBandOf } from './ageBand';
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
    out.push({ tick: d.tick as number, troop: d.troop, x: d.x as number, y: d.y as number });
  }
  return out;
}

/** Copy only the listed keys that are present (8b: nothing else a request carries is stored or served). */
function pick<T extends object>(raw: Record<string, unknown>, keys: readonly (keyof T & string)[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (raw[k] !== undefined) out[k] = raw[k];
  return out as Partial<T>;
}
const BUILDING_KEYS = ['id', 'type', 'level', 'x', 'y', 'loot', 'upgrading', 'temper'] as const;
const BASE_KEYS = ['hallLevel', 'trophies', 'practice', 'rival', 'trialTier', 'power', 'wallPower'] as const;
const SETUP_KEYS = ['seed', 'army', 'infiltration', 'levels', 'reinforcements', 'startDamage', 'hero', 'mastery'] as const;

/** The base as fought, without its name and with only the fields a battle reads. */
export function pickBase(raw: Record<string, unknown>): BaseLayout {
  const buildings = (raw.buildings as Record<string, unknown>[]).map((b) => pick<BaseBuilding>(b && typeof b === 'object' ? b : {}, BUILDING_KEYS) as BaseBuilding);
  return { ...(pick<BaseLayout>(raw, BASE_KEYS) as BaseLayout), name: '', buildings };
}

/**
 * The battle setup with only the fields a battle reads (and the cleaned base). BNL-07 (P1-22): Warrior Mastery
 * multiplies health and damage, so `mastery` is dropped unless the feature is on in the engine's data, and then
 * keeps only known warriors with a bonus between 0 and the cap; `hero` must be a known hero at a level it has.
 */
export function pickSetup(raw: Record<string, unknown>, base: BaseLayout, data: GameData): BattleSetup {
  const setup = { ...(pick<BattleSetup>(raw, SETUP_KEYS) as BattleSetup), base };
  const mastery = setup.mastery && typeof setup.mastery === 'object' ? setup.mastery : undefined;
  delete setup.mastery;
  if (mastery && masteryOn(data)) {
    const cap = masteryBonus(MASTERY_LEVEL_CEILING);
    const kept = Object.fromEntries(Object.entries(mastery).filter(([t, b]) => data.troops[t] && typeof b === 'number' && Number.isFinite(b) && b >= 0 && b <= cap));
    if (Object.keys(kept).length) setup.mastery = kept;
  }
  const hero = setup.hero as { id?: unknown; level?: unknown } | undefined;
  if (hero !== undefined) {
    const def = typeof hero?.id === 'string' ? data.battle.heroes?.[hero.id] : undefined;
    const level = Number(hero?.level);
    if (!def || !Number.isInteger(level) || level < 1 || level > def.levels.length) throw fail(400, 'bad_request', 'replay.bad');
    setup.hero = { id: hero.id as string, level };
  }
  return setup;
}

/** A mastery level past any a village can reach: its bonus is the curve's ceiling (BNL-07). */
const MASTERY_LEVEL_CEILING = 1000;

/** Whether a real defender's base may appear in a shared replay: adults who did not opt out. */
export async function baseShareable(ctx: ServerContext, defenderId: string): Promise<boolean> {
  if ((await ageBandOf(ctx.repo, defenderId)) !== 'adult') return false;
  return (await ctx.repo.getCompliance(defenderId))?.noBaseInReplays !== true;
}

/** How far back the server looks for the raid a shared replay shows (attack records are kept 30 days). */
const RAID_LOOKBACK_MS = 31 * DAY;

/** POST /v1/replays/shared. */
export async function share(ctx: ServerContext, me: Player, body: Partial<ShareReplayRequest> | undefined): Promise<ShareReplayResponse> {
  const band = (await ctx.repo.getAgeBand(me.id))?.band ?? null;
  if (band === 'under13') throw fail(403, 'age_restricted', 'replay.not_for_age');
  const g = ctx.repo;
  const now = ctx.now();
  if ((await g.sharedReplaysMadeSince(me.id, now - DAY)) >= SHARED_REPLAYS_PER_DAY) throw fail(429, 'rate_limited', 'replay.too_many', { n: SHARED_REPLAYS_PER_DAY });
  if (!body || typeof body !== 'object' || !body.setup || typeof body.setup !== 'object') throw fail(400, 'bad_request', 'replay.bad');
  const rules = Number(body.rules);
  const engine = Number.isInteger(rules) ? ctx.rules.forTicket(rules, typeof body.dataVersion === 'string' ? body.dataVersion : undefined) : null;
  if (!engine) throw fail(422, 'bad_request', 'replay.rules');
  // The base exactly as fought (a generated fortress may carry `power`, a rival outpost `rival`), without its name;
  // bounded like a stored base, and re-simulated as it is, so the stored result is the battle the sharer saw.
  const raw = body.setup.base as unknown as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.buildings) || !raw.buildings.length || raw.buildings.length > 400) throw fail(400, 'bad_request', 'replay.bad');
  if (JSON.stringify(body).length > MAX_BYTES) throw fail(400, 'bad_request', 'replay.bad');
  const base = pickBase(raw);
  const deployments = cleanDeployments(body.deployments);
  if (!deployments) throw fail(400, 'bad_request', 'replay.bad');
  const s = body.setup;
  const army = s.army && typeof s.army === 'object' ? s.army : null;
  if (!army || Object.keys(army).length > 80 || !Number.isInteger(s.seed)) throw fail(400, 'bad_request', 'replay.bad');
  const setup = pickSetup(s as unknown as Record<string, unknown>, base, engine.data);
  // 8c: a raid the server recorded names its real defender (kept, never shown): an under-18 defender's base, or one
  // whose owner opted out, is never shared, whatever the request says the opponent was.
  const defenderId = typeof s.seed === 'number' ? await g.attackDefenderBySeed(me.id, s.seed, now - RAID_LOOKBACK_MS) : null;
  const realDefender = defenderId && defenderId !== DELETED_PLAYER.id ? defenderId : null;
  if (realDefender && !(await baseShareable(ctx, realDefender))) throw fail(409, 'conflict', 'replay.base_private');
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
  const asked: SharedOpponent = body.opponent !== undefined && OPPONENTS.includes(body.opponent) ? body.opponent : 'player';
  // Last gaps 2026-11-14: "a real player's base" only when the server recorded that battle (this player's raid, or a
  // raid on this player's own base, with the seed). Otherwise (older than the records, a forged seed, a duel) the
  // claim cannot be checked, so it is shown as a practice battle: never more real than the server knows.
  const recorded = defenderId !== null || (await g.defendedBySeed(me.id, s.seed as number, now - RAID_LOOKBACK_MS));
  const opponent: SharedOpponent = base.practice ? 'practice' : base.rival || base.power !== undefined ? 'generated' : recorded ? 'player' : asked === 'player' ? 'practice' : asked;
  const expiresAt = now + SHARED_REPLAY_DAYS * DAY;
  const record = { at: now, rules, setup, deployments, ...(endTick !== undefined ? { endTick } : {}), result: { stars: result.stars, destruction: result.destruction }, sharerName: showName ? me.name : null, opponent };
  for (let i = 0; i < 4; i++) {
    const code = newCode(ctx);
    if (await g.addSharedReplay({ id: code, ownerId: me.id, at: now, expiresAt, rules, dataVersion: engine.dataVersion, record, views: 0, defenderId: realDefender })) {
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
  const r = await ctx.repo.getSharedReplay(code, ctx.now(), true);
  if (!r) throw fail(404, 'not_found', 'replay.not_found');
  const rec = r.record as Omit<SharedReplayView, 'code' | 'expiresAt' | 'views'>;
  ctx.metrics.count('tk_shared_replays_total', { what: 'viewed' });
  return { ...rec, code: r.id, expiresAt: r.expiresAt, views: r.views };
}

/** DELETE /v1/replays/shared/:code (the sharer). */
export async function remove(ctx: ServerContext, me: Player, rawCode: string): Promise<{ deleted: boolean }> {
  return { deleted: await ctx.repo.deleteSharedReplay(String(rawCode ?? '').toUpperCase(), me.id) };
}

/** GET /v1/replays/shared: the player's own shares (newest first, still open). */
export async function mine(ctx: ServerContext, me: Player): Promise<{ shares: { code: string; at: number; expiresAt: number; views: number }[] }> {
  const now = ctx.now();
  const rows = await ctx.repo.sharedReplaysOf(me.id, now - SHARED_REPLAY_DAYS * DAY);
  return { shares: rows.filter((r) => r.expiresAt > now).map((r) => ({ code: r.id, at: r.at, expiresAt: r.expiresAt, views: r.views })) };
}
