/**
 * Account deletion (roadmap step 14; Apple 5.1.1(v), Google Play's account
 * deletion policy): in the game (DELETE /v1/me), or by a request from the web
 * form (GET /account/delete) that staff verify and carry out through the admin
 * API, for players who can no longer open the game.
 */
import { FRIEND_CODE_ALPHABET, NAME_HOLD_DAYS } from '../../src/backend/net/names';
import type { DeletionCodeResponse, DeletionRequestBody, DeletionRequestResponse } from '../../src/backend/net/protocol';
import { DELETED_PLAYER, type DeletionRequest, type Player } from '../repo';
import { HOUR, type ServerContext } from './context';
import { growthOf } from '../growthRepo';
import { complianceOf } from '../complianceRepo';
import { leaveGrove } from './groves';
import { revokeAppleTokens } from './links';
import { leave as leaveSquad } from './squads';
import { fail, staffError } from './errors';

/**
 * Delete the caller's online account. Leaves their Alliance first (handing over leadership), without naming them.
 * Sign in with Apple refresh tokens are revoked afterwards (App Review 5.1.1(v)): best effort, logged,
 * never holding the deletion up.
 */
export async function deleteAccount(ctx: ServerContext, me: Player): Promise<void> {
  if (await ctx.repo.getMembership(me.id)) await leaveGrove(ctx, me, { quiet: true });
  // A Gang leader hands over first (step 63); a war's roster lock does not stop a deletion.
  if (await ctx.repo.squadOf(me.id)) await leaveSquad(ctx, me, { quiet: true });
  const appleTokens = await ctx.repo.linkTokensOf(me.id).catch(() => []);
  await ctx.repo.deletePlayer(me.id, me.name, ctx.now());
  // Growth batch 2026-11-14: referrals either way and the player's shared replays (server/growthRepo.ts).
  await growthOf(ctx.repo).deletePlayer(me.id);
  // Compliance switches 2026-11-14: terms acceptance and consumption consent (server/complianceRepo.ts).
  await complianceOf(ctx.repo).deletePlayer(me.id);
  // Report section 5 step 7 (backend A12): the name stays taken for NAME_HOLD_DAYS, so nobody takes it at once
  // to pose as the deleted player (an ex-Alliance leader, a known rival).
  if (me.nameKey) await ctx.repo.holdName(me.nameKey, DELETED_PLAYER.id, ctx.now() + NAME_HOLD_DAYS * 24 * HOUR);
  await ctx.board.remove(me.id);
  await revokeAppleTokens(ctx, appleTokens, 'delete').catch((e) => ctx.log('warn', 'Sign in with Apple: revocation after deletion failed', { error: String(e) }));
}

/** How long a deletion code works. */
export const DELETION_CODE_DAYS = 30;
const CODE_LENGTH = 10;

/** Codes are typed by hand: letters and digits that don't look alike, any case, dashes and spaces ignored. */
export function normalizeDeletionCode(v: unknown): string {
  return String(v ?? '').toUpperCase().replace(/[\s-]/g, '').slice(0, 32);
}

/**
 * POST /v1/me/deletion-code: a one-time code that proves, on the web deletion
 * page, that a request is this player's (re-audit: player ids are visible to
 * other players, so an id alone proves nothing). Only its hash is kept, for
 * DELETION_CODE_DAYS; asking again replaces it.
 */
export async function deletionCode(ctx: ServerContext, me: Player): Promise<DeletionCodeResponse> {
  // ctx.newToken is cryptographically random; its characters pick from the friend-code alphabet.
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const ch of ctx.newToken()) {
      const v = B64.indexOf(ch);
      // 62 of the 64 values map evenly onto the 31 letters (no bias).
      if (v >= 0 && v < 62 && code.length < CODE_LENGTH) code += FRIEND_CODE_ALPHABET[v % FRIEND_CODE_ALPHABET.length];
    }
  }
  const at = ctx.now();
  const expiresAt = at + DELETION_CODE_DAYS * 24 * HOUR;
  await ctx.repo.setDeletionCode(me.id, await ctx.hash(`deletion:${code}`), at, expiresAt);
  return { code: `${code.slice(0, 5)}-${code.slice(5)}`, expiresAt };
}

const text = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Store a web deletion request. The answer never says whether the player
 * exists (no way to probe for players); staff check that later.
 */
export async function requestDeletion(ctx: ServerContext, body: DeletionRequestBody | undefined): Promise<DeletionRequestResponse & { verified: boolean }> {
  const playerId = text(body?.playerId, 64);
  const name = text(body?.name, 40);
  if (!playerId && !name) throw fail(400, 'bad_request', 'account.enter_id');
  // The one-time code from Settings proves the request is the player's own (re-audit). It is used up.
  const code = normalizeDeletionCode(body?.code);
  let verified = false;
  if (playerId && code) {
    const kept = await ctx.repo.deletionCodeOf(playerId);
    if (kept && kept.expiresAt > ctx.now() && kept.codeHash === (await ctx.hash(`deletion:${code}`))) {
      verified = true;
      await ctx.repo.clearDeletionCode(playerId);
    }
  }
  const r: DeletionRequest = { id: ctx.uuid(), at: ctx.now(), playerId, name, contact: '' /* GLOBAL-019: no email is collected or kept (an older page may still send one) */, note: text(body?.note, 1000), status: 'open', resolvedAt: null, resolution: null, verified };
  await ctx.repo.addDeletionRequest(r);
  return { id: r.id, verified };
}

export interface DeletionQueueEntry extends DeletionRequest {
  /** The player the ID names, if any, to help staff verify (name, last seen). */
  player: { id: string; name: string; lastSeenAt: number; createdAt: number } | null;
}

/** Staff: deletion requests, oldest first, with the player each one names. */
export async function deletionQueue(ctx: ServerContext, status: 'open' | 'all'): Promise<{ requests: DeletionQueueEntry[] }> {
  const out: DeletionQueueEntry[] = [];
  for (const r of await ctx.repo.deletionRequests(status, 200)) {
    const p = r.playerId ? await ctx.repo.getPlayer(r.playerId) : null;
    out.push({ ...r, player: p ? { id: p.id, name: p.name, lastSeenAt: p.lastSeenAt, createdAt: p.createdAt } : null });
  }
  return { requests: out };
}

/**
 * Staff: carry out ('delete') or turn down ('reject') a request. Only a
 * verified request (it carried the player's one-time code) can be deleted
 * directly: anyone can type someone else's Player ID. An unverified one is
 * rejected, or deleted with 'override' and a note saying how ownership was
 * checked (support contact, a linked sign-in, a store receipt).
 */
export async function resolveDeletion(ctx: ServerContext, id: string, action: unknown, note: unknown): Promise<DeletionRequest> {
  const r = await ctx.repo.getDeletionRequest(String(id));
  if (!r) throw staffError(404, 'not_found', 'No such deletion request.');
  if (r.status !== 'open') throw staffError(409, 'conflict', 'That request was already handled.');
  if (action !== 'delete' && action !== 'reject' && action !== 'override') throw staffError(400, 'bad_request', "action must be 'delete', 'reject' or 'override'");
  let resolution = text(note, 500);
  if (action === 'delete' && !r.verified) {
    throw staffError(409, 'conflict', "This request did not carry the player's deletion code, so it may not be theirs. Reject it, or use 'override' with a note saying how you checked the account is theirs.");
  }
  if (action === 'override') {
    if (resolution.length < 10) throw staffError(400, 'bad_request', 'An override needs a note (at least 10 characters) saying how ownership was checked.');
    resolution = `Staff override: ${resolution}`;
  }
  if (action === 'delete' || action === 'override') {
    const p = r.playerId ? await ctx.repo.getPlayer(r.playerId) : null;
    if (p) await deleteAccount(ctx, p);
    resolution = resolution || (p ? 'Account deleted.' : 'No account with that ID (nothing to delete).');
  }
  if (action === 'reject' && !resolution && !r.verified) resolution = 'Not verified: the request did not carry the deletion code from the game.';
  await ctx.repo.resolveDeletionRequest(r.id, action === 'reject' ? 'rejected' : 'done', resolution, ctx.now());
  return (await ctx.repo.getDeletionRequest(r.id))!;
}
