/**
 * Unique player names (roadmap step 59; rules in src/backend/net/names.ts and
 * docs/backend/PVP_ROADMAP.md 5.2).
 *
 * - Registering is automatic (the game names the player itself), so a name
 *   that is taken or not allowed is swapped for the closest free one; the
 *   player can change it later. There is no "Ruler" fallback any more.
 * - Changing a name is the player's own choice, so it is strict: a refused
 *   name says why and offers free names close to it. One change per 28 days
 *   (a change that only touches capitals or separators is always free); the
 *   old name is held for its owner for 35 days so nobody can take it to pose
 *   as them.
 * - Players from before this step get a name key once (`migrateNames`, run
 *   at server start): the oldest account keeps a shared name, the others get
 *   digits added, and everyone migrated gets one free change.
 */
import { NAME_CHANGE_DAYS, NAME_HOLD_DAYS, NAME_MAX, isReservedName, nameKey, nameShapeProblem, tidyName } from '../../src/backend/net/names';
import { censorText, hasContact } from '../../src/gameplay/sim/social/grove';
import { nameWidth, sanitizeName } from '../../src/gameplay/sim/social/names';
import { NameTakenError, type Player } from '../repo';
import { HOUR, type ServerContext } from './context';
import { ageBandOf } from './age';
import { serverHasContact } from './contactFilter';
import { fail, detailError, utcDate } from './errors';

const DAY = 24 * HOUR;

/** Why this name is not allowed (shape, words, reserved), or null. Availability is separate. */
export function nameProblem(ctx: ServerContext, name: string): string | null {
  const shape = nameShapeProblem(name);
  if (shape) return shape;
  if (censorText(name, ctx.data) !== name) return 'That name is not allowed.';
  // Report section 5 step 7 (compliance C25): "add me on tg 1234567" fit in 24 units and passed.
  if (hasContact(name) || serverHasContact(name)) return 'Names cannot hold links, phone numbers, addresses or messaging-app handles.';
  if (isReservedName(name)) return 'That name is reserved.';
  return null;
}

/** Is the name's key free for this player (nobody else has it, and it is not held for someone else)? */
export async function nameFree(ctx: ServerContext, key: string, playerId: string | null): Promise<boolean> {
  const owner = await ctx.repo.playerByNameKey(key);
  if (owner && owner.id !== playerId) return false;
  const hold = await ctx.repo.nameHold(key, ctx.now());
  return !hold || hold.playerId === playerId;
}

/** The asked-for name made to fit the shape rules as far as it can (may still be too short or reserved). */
function fitShape(raw: string): string {
  let s = tidyName(raw)
    .replace(/[ _-]*([ _-])[ _-]*/g, '$1')
    .replace(/^[^\p{L}]+/u, '')
    .replace(/[ _-]+$/, '');
  if (nameWidth(s) > NAME_MAX) {
    s = sanitizeName(s);
    const at = Math.max(s.lastIndexOf(' '), s.lastIndexOf('_'), s.lastIndexOf('-'));
    if (at >= 3) s = s.slice(0, at);
    s = s.replace(/[ _-]+$/, '');
  }
  return s;
}

/**
 * Up to `n` free, allowed names close to `wanted`: the name itself, then with
 * digits, then names made from the game's name parts.
 */
export async function suggestNames(ctx: ServerContext, wanted: string, playerId: string | null, n = 3): Promise<string[]> {
  const out: string[] = [];
  const tried = new Set<string>();
  const offer = async (name: string) => {
    const key = nameKey(name);
    if (out.length >= n || tried.has(key)) return;
    tried.add(key);
    if (!nameProblem(ctx, name) && (await nameFree(ctx, key, playerId))) out.push(name);
  };
  const base = fitShape(wanted);
  const usable = !!base && !nameProblem(ctx, base) ? base : '';
  if (usable) await offer(usable);
  const names = ctx.data.names;
  for (let i = 0; out.length < n && i < 60; i++) {
    const digits = String(Math.floor(ctx.random() * (i < 20 ? 90 : 9000)) + (i < 20 ? 10 : 1000));
    if (usable) await offer(`${sanitizeName(usable, NAME_MAX - digits.length - 1)} ${digits}`);
    const first = names.placeFirst[Math.floor(ctx.random() * names.placeFirst.length)];
    const second = names.playerFirst[Math.floor(ctx.random() * names.playerFirst.length)];
    const made = `${first} ${second}`;
    await offer(i < 10 && nameWidth(made) <= NAME_MAX ? made : `${sanitizeName(made, NAME_MAX - digits.length - 1)} ${digits}`);
  }
  return out;
}

/** When this player's next name change is free (0: now). */
export function nameChangeAt(p: Player, now: number): number {
  if ((p.freeRenames ?? 0) > 0 || !p.nameChangedAt) return 0;
  const at = p.nameChangedAt + NAME_CHANGE_DAYS * DAY;
  return at > now ? at : 0;
}

/** The name a new player gets: the one the game asked for if it is allowed and free, else the closest free one. */
export async function nameForNewPlayer(ctx: ServerContext, wanted: unknown): Promise<{ name: string; nameKey: string }> {
  const name = tidyName(wanted);
  if (!nameProblem(ctx, name) && (await nameFree(ctx, nameKey(name), null))) return { name, nameKey: nameKey(name) };
  const [first] = await suggestNames(ctx, name || 'Shadow', null, 1);
  if (!first) throw fail(503, 'conflict', 'name.none_free');
  return { name: first, nameKey: nameKey(first) };
}

/**
 * Change a player's name (PUT /v1/me). Strict: refusals say why and offer
 * free names. Keeps the old name for them for 35 days.
 */
export async function changeName(ctx: ServerContext, me: Player, wanted: unknown): Promise<Player> {
  // Under 13 (re-audit): no chosen names, which could carry personal details; the generated one stays.
  if ((await ageBandOf(ctx.repo, me.id)) === 'under13') throw fail(403, 'age_restricted', 'name.under13');
  const t = ctx.now();
  const name = tidyName(wanted);
  const problem = nameProblem(ctx, name);
  if (problem) throw detailError(400, 'bad_request', problem, await suggestNames(ctx, name, me.id));
  const key = nameKey(name);
  if (name === me.name) return me;
  const sameName = key === me.nameKey;
  // Only capitals or separators changed: always allowed, not a name change.
  const waitUntil = sameName ? 0 : nameChangeAt(me, t);
  if (waitUntil) throw fail(429, 'name_cooldown', 'name.cooldown', { date: utcDate(waitUntil, 16) });
  if (!(await nameFree(ctx, key, me.id))) throw fail(409, 'name_taken', 'name.taken', undefined, { suggestions: await suggestNames(ctx, name, me.id) });
  const patch = sameName
    ? { name, updatedAt: t }
    : { name, nameKey: key, previousName: me.name, nameChangedAt: t, freeRenames: Math.max(0, (me.freeRenames ?? 0) - (nameChangeAt({ ...me, freeRenames: 0 }, t) ? 1 : 0)), updatedAt: t };
  try {
    await ctx.repo.transaction(async (tx) => {
      await tx.updatePlayer(me.id, { ...patch, ...(me.base ? { base: { ...me.base, name } } : {}) });
      if (!sameName && me.nameKey) await tx.holdName(me.nameKey, me.id, t + NAME_HOLD_DAYS * DAY);
    });
  } catch (e) {
    if (e instanceof NameTakenError) throw fail(409, 'name_taken', 'name.just_taken', undefined, { suggestions: await suggestNames(ctx, name, me.id) });
    throw e;
  }
  return { ...me, ...patch };
}

/**
 * Give players from before step 59 a unique name key, oldest first, so the
 * oldest account keeps a name others share. Names that break the rules are
 * fitted (cut at a word boundary) or replaced. Each migrated player gets one
 * free change. Idempotent; returns how many were done.
 */
export async function migrateNames(ctx: ServerContext, batch = 200): Promise<number> {
  let done = 0;
  for (;;) {
    const list = await ctx.repo.playersWithoutNameKey(batch);
    if (!list.length) return done;
    const before = done;
    for (const p of list) {
      const fitted = fitShape(p.name);
      let name = !!fitted && !nameProblem(ctx, fitted) && (await nameFree(ctx, nameKey(fitted), p.id)) ? fitted : '';
      for (let attempt = 0; attempt < 5; attempt++) {
        if (!name) name = (await suggestNames(ctx, fitted || 'Shadow', p.id, 1))[0] ?? '';
        if (!name) break;
        try {
          await ctx.repo.updatePlayer(p.id, { name, nameKey: nameKey(name), freeRenames: 1, ...(p.base ? { base: { ...p.base, name } } : {}) });
          done++;
          break;
        } catch (e) {
          if (!(e instanceof NameTakenError)) throw e;
          name = '';
        }
      }
    }
    // Nobody in this batch could be named (should not happen): stop rather than loop.
    if (list.length < batch || done === before) return done;
  }
}
