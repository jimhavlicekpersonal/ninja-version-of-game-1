/**
 * The admin tool (roadmap step 48), behind ADMIN_TOKEN: look a player up,
 * see their account, village, ledger, purchases, ratings and reports; give or
 * take resources (a village kept on the server only: a device village is the
 * device's), suspend or lift a suspension, and reset ratings. Every action is
 * written to `staff_actions` with who did it and why.
 */
import { newRating } from '../../src/gameplay/sim/rating';
import { deserialize } from '../../src/gameplay/sim/save';
import { RESOURCE_KINDS, type ResourceKind } from '../../src/gameplay/sim/types';
import { NAME_HOLD_DAYS, nameKey } from '../../src/backend/net/names';
import { DELETED_PLAYER, NameTakenError, type Player } from '../repo';
import { nameFree, nameProblem, suggestNames } from './names';
import { ApiError, HOUR, type ServerContext } from './context';
import { appealText, notify } from './moderation';
import { applyServerResult } from './village';

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

async function playerOr404(ctx: ServerContext, id: string): Promise<Player> {
  const p = await ctx.repo.getPlayer(String(id));
  if (!p) throw new ApiError(404, 'not_found', 'No such player.');
  return p;
}

async function audit(ctx: ServerContext, actor: string, action: string, playerId: string | null, detail: Record<string, unknown>): Promise<void> {
  await ctx.repo.addStaffAction({ id: ctx.uuid(), at: ctx.now(), actor: actor || 'staff', action, playerId, detail });
  ctx.log('info', 'staff action', { actor, action, playerId });
}

function summary(p: Player, now: number) {
  return {
    id: p.id,
    name: p.name,
    honor: p.trophies,
    keep: p.hallLevel,
    createdAt: p.createdAt,
    lastSeenAt: p.lastSeenAt,
    banned: (p.bannedUntil ?? 0) > now ? { until: p.bannedUntil!, reason: p.banReason ?? null } : null,
  };
}

export async function search(ctx: ServerContext, q: unknown) {
  const query = text(q, 64);
  if (query.length < 2) throw new ApiError(400, 'bad_request', 'Type at least 2 characters of a name, or a player id.');
  return { players: (await ctx.repo.searchPlayers(query, 25)).map((p) => summary(p, ctx.now())) };
}

export async function detail(ctx: ServerContext, id: string) {
  const p = await playerOr404(ctx, id);
  const now = ctx.now();
  const row = await ctx.repo.getVillage(p.id);
  const village = row
    ? (() => {
        const s = deserialize(row.file, ctx.data);
        return { revision: row.revision, at: row.at, resources: s.resources, army: s.army, buildings: s.buildings.length, purchases: s.purchases.length };
      })()
    : null;
  const membership = await ctx.repo.getMembership(p.id);
  return {
    player: { ...summary(p, now), shieldUntil: p.shieldUntil, mutedUntil: p.mutedUntil ?? 0, groveId: p.groveId, hasBase: Boolean(p.base), ratings: p.ratings ?? null },
    links: (await ctx.repo.linksOf(p.id)).map((l) => ({ provider: l.provider, linkedAt: l.linkedAt })),
    ageGroup: await ctx.repo.getAgeGroup(p.id),
    alliance: membership ? { id: membership.groveId, role: membership.role } : null,
    village,
    ledger: await ctx.repo.ledgerOf(p.id, 30),
    purchases: await ctx.repo.purchasesOf(p.id, 50),
    defenses: (await ctx.repo.defensesFor(p.id, now - 7 * 24 * HOUR, 20)).map((a) => ({ at: a.at, attacker: a.attackerName, stars: a.result.stars, destruction: a.result.destruction, honor: a.defenderTrophies })),
    staffActions: await ctx.repo.staffActions(p.id, 30),
    importHolds: await ctx.repo.importHoldsOf(p.id),
  };
}

/**
 * Backend batch 2026-11-13: staff replace an offending player name (community rules, UK OSA / EU DSA).
 * With `name` it must pass the usual name rules and be free; without one the player gets a neutral
 * generated name. The old name is held for NAME_HOLD_DAYS by nobody (neither they nor anyone else takes it
 * back at once), the player gets a free rename to choose another, a notice with the reason and the appeal
 * route, and the staff log a line.
 */
export async function rename(ctx: ServerContext, actor: string, id: string, body: { name?: unknown; reason?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const reason = text(body?.reason, 200);
  if (!reason) throw new ApiError(400, 'bad_request', 'Give a reason: the player is told it.');
  let name = text(body?.name, 40);
  if (name) {
    const problem = nameProblem(ctx, name);
    if (problem) throw new ApiError(400, 'bad_request', problem);
    if (!(await nameFree(ctx, nameKey(name), p.id))) throw new ApiError(409, 'name_taken', 'That name is taken.');
  } else {
    const [first] = await suggestNames(ctx, 'Shadow', p.id, 1);
    if (!first) throw new ApiError(503, 'conflict', 'Could not find a free name. Try again.');
    name = first;
  }
  const t = ctx.now();
  try {
    await ctx.repo.transaction(async (tx) => {
      await tx.updatePlayer(p.id, { name, nameKey: nameKey(name), previousName: null, nameChangedAt: 0, freeRenames: (p.freeRenames ?? 0) + 1, updatedAt: t, ...(p.base ? { base: { ...p.base, name } } : {}) });
      if (p.nameKey) await tx.holdName(p.nameKey, DELETED_PLAYER.id, t + NAME_HOLD_DAYS * 24 * HOUR);
    });
  } catch (e) {
    if (e instanceof NameTakenError) throw new ApiError(409, 'name_taken', 'That name was just taken.');
    throw e;
  }
  await notify(ctx, p.id, 'moderation_action', `Your name was changed by a moderator because it broke the community rules. Reason: ${reason}. You can choose a new name in Settings now. ${appealText(ctx)}`);
  await audit(ctx, actor, 'rename', p.id, { from: p.name, to: name, reason });
  return detail(ctx, p.id);
}

/**
 * GLOBAL-002: release what a village move held back (`import_holds`) after support confirmed it (a store
 * receipt, a purchase made before the account existed). The held Jade goes into the server-held village
 * (ledger `staff:import-release`); a held premium Season Scroll cannot be granted from here and is only
 * marked, so support tells the player how it is restored. The staff log keeps the note.
 */
export async function releaseImportHold(ctx: ServerContext, actor: string, id: string, holdId: string, body: { note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 200);
  if (!note) throw new ApiError(400, 'bad_request', 'Say what support confirmed (note): it goes in the staff log.');
  const hold = (await ctx.repo.importHoldsOf(p.id)).find((h) => h.id === holdId);
  if (!hold || hold.status !== 'held') throw new ApiError(404, 'not_found', 'No held import with that id for this player.');
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.resolveImportHold(hold.id, p.id))) throw new ApiError(409, 'conflict', 'That hold was already released.');
    if (hold.jade > 0) {
      const r = await applyServerResult(tx, ctx, p, [{ cmd: { type: 'staffAdjust', resources: { moonstones: hold.jade } }, reason: 'staff:import-release' }], `staff:${actor || 'staff'}`);
      if (!r) throw new ApiError(404, 'no_village', 'This village is no longer kept on the server.');
      if (!r.ok) throw new ApiError(400, 'bad_request', r.message);
    }
  });
  await audit(ctx, actor, 'import-release', p.id, { hold: hold.id, jade: hold.jade, premium: hold.premium, purchases: hold.purchases.length, note });
  return detail(ctx, p.id);
}

/** Give (positive) or take (negative) resources from a village kept on the server. */
export async function adjust(ctx: ServerContext, actor: string, id: string, body: { resources?: unknown; note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 200);
  if (!note) throw new ApiError(400, 'bad_request', 'Say why (note): it goes in the ledger and the staff log.');
  const raw = (body?.resources ?? {}) as Record<string, unknown>;
  const known = RESOURCE_KINDS;
  const resources: Partial<Record<ResourceKind, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.includes(k as ResourceKind) || !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 10_000_000) throw new ApiError(400, 'bad_request', `Bad amount for ${k}.`);
    if (Number(v)) resources[k as ResourceKind] = Math.round(Number(v));
  }
  if (!Object.keys(resources).length) throw new ApiError(400, 'bad_request', 'Nothing to change.');
  const r = await ctx.repo.transaction((tx) => applyServerResult(tx, ctx, p, [{ cmd: { type: 'staffAdjust', resources }, reason: `staff:${note.slice(0, 60)}` }], `staff:${actor || 'staff'}`));
  if (!r) throw new ApiError(404, 'no_village', 'This village lives on the device: the server cannot change it. Ask the player to move it to the server (Settings → Online play).');
  if (!r.ok) throw new ApiError(400, 'bad_request', r.message);
  await audit(ctx, actor, 'adjust', p.id, { resources, note });
  return detail(ctx, p.id);
}

/** Suspend from online play for `hours` (0 lifts it). A suspended player is not matched or ranked. */
export async function ban(ctx: ServerContext, actor: string, id: string, body: { hours?: unknown; reason?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const hours = Number(body?.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 3650) throw new ApiError(400, 'bad_request', 'hours must be 0 (lift) to 87600.');
  const reason = text(body?.reason, 200);
  if (hours > 0 && !reason) throw new ApiError(400, 'bad_request', 'Give a reason: the player is told it.');
  const until = hours > 0 ? ctx.now() + hours * HOUR : 0;
  await ctx.repo.updatePlayer(p.id, { bannedUntil: until, banReason: hours > 0 ? reason : null });
  if (until) await ctx.board.remove(p.id);
  else if (p.base) await ctx.board.set(p.id, p.trophies, p.createdAt);
  // Statement of reasons with the appeal route (re-audit, EU DSA art. 17); the 403 on every request says it too.
  if (hours > 0 || (p.bannedUntil ?? 0) > ctx.now()) await notify(ctx, p.id, 'moderation_action', hours > 0 ? `Your account is suspended from online play until ${new Date(until).toUTCString()}. Reason: ${reason}. ${appealText(ctx)}` : 'The suspension of your account has been lifted.');
  await audit(ctx, actor, hours > 0 ? 'ban' : 'unban', p.id, { hours, reason });
  return detail(ctx, p.id);
}

/** Start a player's hidden ratings over (a smurf moved to a fresh account, a ratings bug). */
export async function resetRating(ctx: ServerContext, actor: string, id: string, body: { which?: unknown; note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const which = body?.which === 'attack' || body?.which === 'base' ? body.which : 'both';
  const now = ctx.now();
  const fresh = newRating(now, ctx.data.ranks.rating);
  const current = p.ratings ?? { attack: fresh, base: fresh };
  await ctx.repo.updatePlayer(p.id, { ratings: { attack: which === 'base' ? current.attack : fresh, base: which === 'attack' ? current.base : fresh } });
  await audit(ctx, actor, 'reset-rating', p.id, { which, note: text(body?.note, 200) });
  return detail(ctx, p.id);
}

/**
 * Clear a player's age group after a support check (GLOBAL-006): the game
 * never turns "under 18" back to adult on its own, so a wrong answer is
 * fixed here. The player is asked again before the next purchase.
 */
export async function resetAge(ctx: ServerContext, actor: string, id: string, body: { note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 200);
  if (!note) throw new ApiError(400, 'bad_request', 'Say what was checked (note): it goes in the staff log.');
  const before = await ctx.repo.getAgeGroup(p.id);
  await ctx.repo.transaction(async (tx) => {
    await tx.setAgeGroup(p.id, null, ctx.now());
    await applyServerResult(tx, ctx, p, [{ cmd: { type: 'staffResetAge' }, reason: 'staff:age-reset' }], `staff:${actor || 'staff'}`);
  });
  await audit(ctx, actor, 'reset-age', p.id, { before: before?.under18 ?? null, note });
  return detail(ctx, p.id);
}

export async function actions(ctx: ServerContext) {
  return { actions: await ctx.repo.staffActions(null, 100) };
}
