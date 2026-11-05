/**
 * Account deletion (roadmap step 14; Apple 5.1.1(v), Google Play's account
 * deletion policy): in the game (DELETE /v1/me), or by a request from the web
 * form (GET /account/delete) that staff verify and carry out through the admin
 * API, for players who can no longer open the game.
 */
import type { DeletionRequestBody, DeletionRequestResponse } from '../../src/backend/net/protocol';
import type { DeletionRequest, Player } from '../repo';
import { ApiError, type ServerContext } from './context';
import { leaveGrove } from './groves';
import { leave as leaveSquad } from './squads';

/** Delete the caller's online account. Leaves their Alliance first (handing over leadership), without naming them. */
export async function deleteAccount(ctx: ServerContext, me: Player): Promise<void> {
  if (await ctx.repo.getMembership(me.id)) await leaveGrove(ctx, me, { quiet: true });
  // A Gang leader hands over first (step 63); a war's roster lock does not stop a deletion.
  if (await ctx.repo.squadOf(me.id)) await leaveSquad(ctx, me, { quiet: true });
  await ctx.repo.deletePlayer(me.id, me.name, ctx.now());
  await ctx.board.remove(me.id);
}

const text = (v: unknown, max: number): string => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/**
 * Store a web deletion request. The answer never says whether the player
 * exists (no way to probe for players); staff check that later.
 */
export async function requestDeletion(ctx: ServerContext, body: DeletionRequestBody | undefined): Promise<DeletionRequestResponse> {
  const playerId = text(body?.playerId, 64);
  const name = text(body?.name, 40);
  if (!playerId && !name) throw new ApiError(400, 'bad_request', 'Enter your Player ID (Settings → Online play) or your player name.');
  const r: DeletionRequest = { id: ctx.uuid(), at: ctx.now(), playerId, name, contact: text(body?.contact, 200), note: text(body?.note, 1000), status: 'open', resolvedAt: null, resolution: null };
  await ctx.repo.addDeletionRequest(r);
  return { id: r.id };
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

/** Staff: carry out ('delete') or turn down ('reject') a request. */
export async function resolveDeletion(ctx: ServerContext, id: string, action: unknown, note: unknown): Promise<DeletionRequest> {
  const r = await ctx.repo.getDeletionRequest(String(id));
  if (!r) throw new ApiError(404, 'not_found', 'No such deletion request.');
  if (r.status !== 'open') throw new ApiError(409, 'conflict', 'That request was already handled.');
  if (action !== 'delete' && action !== 'reject') throw new ApiError(400, 'bad_request', "action must be 'delete' or 'reject'");
  let resolution = text(note, 500);
  if (action === 'delete') {
    const p = r.playerId ? await ctx.repo.getPlayer(r.playerId) : null;
    if (p) await deleteAccount(ctx, p);
    resolution = resolution || (p ? 'Account deleted.' : 'No account with that ID (nothing to delete).');
  }
  await ctx.repo.resolveDeletionRequest(r.id, action === 'delete' ? 'done' : 'rejected', resolution, ctx.now());
  return (await ctx.repo.getDeletionRequest(r.id))!;
}
