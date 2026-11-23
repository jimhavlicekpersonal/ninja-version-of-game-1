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
import { holdNameAndLookalikes, nameFree, nameProblem, suggestNames } from './names';
import { HOUR, type ServerContext } from './context';
import { notify } from './moderation';
import { applyServerResult } from './village';
import { appeal, msg, staffError, utcDate } from './errors';

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

async function playerOr404(ctx: ServerContext, id: string): Promise<Player> {
  const p = await ctx.repo.getPlayer(String(id));
  if (!p) throw staffError(404, 'not_found', 'No such player.');
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
  if (query.length < 2) throw staffError(400, 'bad_request', 'Type at least 2 characters of a name, or a player id.');
  return { players: (await ctx.repo.searchPlayers(query, 25)).map((p) => summary(p, ctx.now())) };
}

/** Beast Mode SEC-07: a staff read of one player is logged too, at most once per staff member, player and hour. */
const lastViews = new Map<string, number>();
async function auditView(ctx: ServerContext, actor: string, playerId: string): Promise<void> {
  const k = `${actor}\u0000${playerId}`;
  const t = ctx.now();
  if ((lastViews.get(k) ?? -Infinity) > t - HOUR) return;
  if (lastViews.size > 10_000) lastViews.clear();
  lastViews.set(k, t);
  await audit(ctx, actor, 'view', playerId, {});
}

/** SEC-07: GET /admin/v1/players/:id/sessions: provider, device label, created and last used (never a hash). */
export async function sessions(ctx: ServerContext, actor: string, id: string) {
  const p = await playerOr404(ctx, id);
  await auditView(ctx, actor, p.id);
  const keys = await ctx.repo.keysOf(p.id);
  return { firstToken: keys.main ? 'active' : 'signed out', links: (await ctx.repo.linksOf(p.id)).map((l) => l.provider), devices: await ctx.repo.sessionsOf(p.id) };
}

/** SEC-07: POST /admin/v1/players/:id/revoke-sessions { note }: every device signed out; the player signs in again with a linked sign-in. */
export async function revokeSessions(ctx: ServerContext, actor: string, id: string, body: { note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 500);
  if (!note) throw staffError(400, 'bad_request', 'Say why (a note for the staff log).');
  const revoked = await ctx.repo.revokeAllTokens(p.id, `revoked:${ctx.uuid()}`);
  await audit(ctx, actor, 'revoke-sessions', p.id, { note, revoked });
  return { revoked };
}

/** SEC-07: POST /admin/v1/players/:id/reset-honor { to, note }: honor set (default 0) and the leaderboard moved with it. */
export async function resetHonor(ctx: ServerContext, actor: string, id: string, body: { to?: unknown; note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 500);
  if (!note) throw staffError(400, 'bad_request', 'Say why (a note for the staff log).');
  const to = body?.to === undefined ? 0 : Math.floor(Number(body.to));
  if (!Number.isFinite(to) || to < 0 || to > p.trophies) throw staffError(400, 'bad_request', 'Honor can only be lowered (to a whole number from 0 to the current honor).');
  await ctx.repo.updatePlayer(p.id, { trophies: to });
  if (p.base && !p.bannedUntil) await ctx.board.set(p.id, to, p.createdAt);
  await audit(ctx, actor, 'reset-honor', p.id, { note, from: p.trophies, to });
  return { honor: to };
}

/** Beast Mode SEC-06: GET /admin/v1/name-clashes: names that look alike across scripts and existed before the check. */
export async function nameClashes(ctx: ServerContext, actor: string) {
  const groups = (await ctx.repo.skeletonClashes(100)).map((g) => ({ players: g.players.map((p) => summary(p, ctx.now())) }));
  await audit(ctx, actor, 'view-name-clashes', null, { groups: groups.length });
  return { groups };
}

/**
 * Beast Mode SEC-07: POST /admin/v1/players/:id/reverse-raids { days, note }: for the player's recorded raids in the
 * last `days` (default 7, at most 30), each defender gets back the honor the raid took and the player loses what
 * it gained (never below 0). A raid is reversed once (earlier runs' attack ids are in the staff log). Logged.
 */
export async function reverseRaids(ctx: ServerContext, actor: string, id: string, body: { days?: unknown; note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 500);
  if (!note) throw staffError(400, 'bad_request', 'Say why (a note for the staff log).');
  const d = Math.max(1, Math.min(30, Math.floor(Number(body?.days)) || 7));
  const done = new Set((await ctx.repo.staffActions(p.id, 200)).filter((a) => a.action === 'reverse-raids').flatMap((a) => (Array.isArray(a.detail.attacks) ? (a.detail.attacks as string[]) : [])));
  const raids = (await ctx.repo.attacksBy(p.id, ctx.now() - d * 24 * HOUR, 500)).filter((a) => !done.has(a.id));
  const back = new Map<string, number>();
  let taken = 0;
  for (const a of raids) {
    taken += Math.max(0, a.attackerTrophies ?? 0);
    const lost = Math.max(0, -(a.defenderTrophies ?? 0));
    if (lost && a.defenderId) back.set(a.defenderId, (back.get(a.defenderId) ?? 0) + lost);
  }
  let returned = 0;
  await ctx.repo.transaction(async (tx) => {
    for (const [defId, lost] of back) {
      const def = await tx.getPlayer(defId);
      if (!def) continue;
      await tx.updatePlayer(defId, { trophies: def.trophies + lost });
      returned += lost;
    }
    const me = (await tx.getPlayer(p.id)) ?? p;
    await tx.updatePlayer(p.id, { trophies: Math.max(0, me.trophies - taken) });
  });
  for (const defId of [...back.keys(), p.id]) {
    const q = await ctx.repo.getPlayer(defId);
    if (q?.base && !q.bannedUntil) await ctx.board.set(q.id, q.trophies, q.createdAt);
  }
  await audit(ctx, actor, 'reverse-raids', p.id, { note, days: d, attacks: raids.map((a) => a.id), returned, taken });
  return { raids: raids.length, returned, taken };
}

/**
 * SEC-07: GET /admin/v1/suspects?days=N: the players whose recorded raids gained the most honor in the last N days
 * (default 3, at most 14), with wins per active hour, late reports and whether the server holds their village.
 */
export async function suspects(ctx: ServerContext, actor: string, days: unknown) {
  const d = Math.max(1, Math.min(14, Math.floor(Number(days)) || 3));
  const since = ctx.now() - d * 24 * HOUR;
  const top = await ctx.repo.topPlayers(200);
  const rows = [];
  for (const p of top) {
    const raids = await ctx.repo.attacksBy(p.id, since, 500);
    const gained = raids.reduce((s, a) => s + Math.max(0, a.attackerTrophies ?? 0), 0);
    if (!raids.length) continue;
    const hours = new Set(raids.map((a) => Math.floor(a.at / HOUR))).size;
    rows.push({ ...summary(p, ctx.now()), honorGained: gained, perDay: Math.round(gained / d), raids: raids.length, winsPerActiveHour: Math.round((raids.filter((a) => a.result.stars > 0).length / Math.max(1, hours)) * 10) / 10, lateReports: p.lateReports ?? 0, heldOnServer: Boolean(await ctx.repo.getVillage(p.id)) });
  }
  await audit(ctx, actor, 'view-suspects', null, { days: d });
  return { days: d, players: rows.sort((a, b) => b.honorGained - a.honorGained).slice(0, 100) };
}

/**
 * Beast Mode GT-17: GET /admin/v1/pairs?days=N: pairs of players with at least two recorded raids between them in
 * the last N days (default 7, at most 30), raids both ways first: alternate accounts feeding a main raid each other
 * again and again, and donations between them. Read from the raids of the 200 highest-honor players (as `suspects`)
 * and the window's donations; the view is logged.
 */
export async function pairs(ctx: ServerContext, actor: string, days: unknown) {
  const d = Math.max(1, Math.min(30, Math.floor(Number(days)) || 7));
  const since = ctx.now() - d * 24 * HOUR;
  const byPair = new Map<string, { a: string; b: string; ab: number; ba: number; loot: number; honor: number; last: number }>();
  const seen = new Set<string>();
  for (const p of await ctx.repo.topPlayers(200)) {
    for (const r of await ctx.repo.attacksBy(p.id, since, 500)) {
      if (seen.has(r.id) || !r.defenderId) continue;
      seen.add(r.id);
      const [a, b] = [r.attackerId, r.defenderId].sort();
      const row = byPair.get(`${a}|${b}`) ?? { a, b, ab: 0, ba: 0, loot: 0, honor: 0, last: 0 };
      if (r.attackerId === a) row.ab++;
      else row.ba++;
      row.loot += (r.result.loot?.acorns ?? 0) + (r.result.loot?.dew ?? 0);
      row.honor += Math.max(0, r.attackerTrophies ?? 0);
      row.last = Math.max(row.last, r.at);
      byPair.set(`${a}|${b}`, row);
    }
  }
  // Donations between the same two players feed a main too: counted beside the raids.
  const gifts = new Map<string, { donations: number; warriors: number }>();
  for (const d of await ctx.repo.donationsSince(since, 5000)) {
    const [a, b] = [d.fromId, d.toId].sort();
    const g = gifts.get(`${a}|${b}`) ?? { donations: 0, warriors: 0 };
    g.donations++;
    g.warriors += d.count;
    gifts.set(`${a}|${b}`, g);
    if (!byPair.has(`${a}|${b}`)) byPair.set(`${a}|${b}`, { a, b, ab: 0, ba: 0, loot: 0, honor: 0, last: d.at });
  }
  const named = async (id: string) => ({ id, name: (await ctx.repo.getPlayer(id))?.name ?? '' });
  const rows = [];
  for (const x of [...byPair.values()].filter((x) => x.ab + x.ba >= 2 || (x.ab + x.ba >= 1 && gifts.has(`${x.a}|${x.b}`))).sort((p, q) => Math.min(q.ab, q.ba) - Math.min(p.ab, p.ba) || q.ab + q.ba - (p.ab + p.ba)).slice(0, 100)) {
    const g = gifts.get(`${x.a}|${x.b}`);
    rows.push({ a: await named(x.a), b: await named(x.b), raids: x.ab + x.ba, oneWay: Math.max(x.ab, x.ba), otherWay: Math.min(x.ab, x.ba), loot: x.loot, honor: x.honor, donations: g?.donations ?? 0, warriorsDonated: g?.warriors ?? 0, lastAt: x.last });
  }
  await audit(ctx, actor, 'view-pairs', null, { days: d });
  return { days: d, pairs: rows };
}

export async function detail(ctx: ServerContext, id: string, actor = '') {
  const p = await playerOr404(ctx, id);
  if (actor) await auditView(ctx, actor, p.id);
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
    player: { ...summary(p, now), shieldUntil: p.shieldUntil, mutedUntil: p.mutedUntil ?? 0, groveId: p.groveId, hasBase: Boolean(p.base), ratings: p.ratings ?? null, lateReports: p.lateReports ?? 0, lateReportAt: p.lateReportAt ?? 0, moveRefused: p.moveRefused ?? null },
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
  if (!reason) throw staffError(400, 'bad_request', 'Give a reason: the player is told it.');
  let name = text(body?.name, 40);
  if (name) {
    const problem = nameProblem(ctx, name);
    if (problem) throw staffError(400, 'bad_request', problem);
    if (!(await nameFree(ctx, nameKey(name), p.id))) throw staffError(409, 'name_taken', 'That name is taken.');
  } else {
    const [first] = await suggestNames(ctx, 'Shadow', p.id, 1);
    if (!first) throw staffError(503, 'conflict', 'Could not find a free name. Try again.');
    name = first;
  }
  const t = ctx.now();
  try {
    await ctx.repo.transaction(async (tx) => {
      await tx.updatePlayer(p.id, { name, nameKey: nameKey(name), previousName: null, nameChangedAt: 0, freeRenames: (p.freeRenames ?? 0) + 1, updatedAt: t, ...(p.base ? { base: { ...p.base, name } } : {}) });
      if (p.nameKey) await holdNameAndLookalikes(tx, p.nameKey, DELETED_PLAYER.id, t + NAME_HOLD_DAYS * 24 * HOUR);
    });
  } catch (e) {
    if (e instanceof NameTakenError) throw staffError(409, 'name_taken', 'That name was just taken.');
    throw e;
  }
  await notify(ctx, p.id, 'moderation_action', [msg('moderation.renamed', { reason }), appeal(ctx)]);
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
  if (!note) throw staffError(400, 'bad_request', 'Say what support confirmed (note): it goes in the staff log.');
  const hold = (await ctx.repo.importHoldsOf(p.id)).find((h) => h.id === holdId);
  if (!hold || hold.status !== 'held') throw staffError(404, 'not_found', 'No held import with that id for this player.');
  await ctx.repo.transaction(async (tx) => {
    if (!(await tx.resolveImportHold(hold.id, p.id))) throw staffError(409, 'conflict', 'That hold was already released.');
    if (hold.jade > 0) {
      const r = await applyServerResult(tx, ctx, p, [{ cmd: { type: 'staffAdjust', resources: { moonstones: hold.jade } }, reason: 'staff:import-release' }], `staff:${actor || 'staff'}`);
      if (!r) throw staffError(404, 'no_village', 'This village is no longer kept on the server.');
      if (!r.ok) throw staffError(400, 'bad_request', r.message);
    }
  });
  await audit(ctx, actor, 'import-release', p.id, { hold: hold.id, jade: hold.jade, premium: hold.premium, purchases: hold.purchases.length, note });
  return detail(ctx, p.id);
}

/** Give (positive) or take (negative) resources from a village kept on the server. */
export async function adjust(ctx: ServerContext, actor: string, id: string, body: { resources?: unknown; note?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const note = text(body?.note, 200);
  if (!note) throw staffError(400, 'bad_request', 'Say why (note): it goes in the ledger and the staff log.');
  const raw = (body?.resources ?? {}) as Record<string, unknown>;
  const known = RESOURCE_KINDS;
  const resources: Partial<Record<ResourceKind, number>> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (!known.includes(k as ResourceKind) || !Number.isFinite(Number(v)) || Math.abs(Number(v)) > 10_000_000) throw staffError(400, 'bad_request', `Bad amount for ${k}.`);
    if (Number(v)) resources[k as ResourceKind] = Math.round(Number(v));
  }
  if (!Object.keys(resources).length) throw staffError(400, 'bad_request', 'Nothing to change.');
  const r = await ctx.repo.transaction((tx) => applyServerResult(tx, ctx, p, [{ cmd: { type: 'staffAdjust', resources }, reason: `staff:${note.slice(0, 60)}` }], `staff:${actor || 'staff'}`));
  if (!r) throw staffError(404, 'no_village', 'This village lives on the device: the server cannot change it. Ask the player to move it to the server (Settings → Online play).');
  if (!r.ok) throw staffError(400, 'bad_request', r.message);
  await audit(ctx, actor, 'adjust', p.id, { resources, note });
  return detail(ctx, p.id);
}

/** Suspend from online play for `hours` (0 lifts it). A suspended player is not matched or ranked. */
export async function ban(ctx: ServerContext, actor: string, id: string, body: { hours?: unknown; reason?: unknown } | undefined) {
  const p = await playerOr404(ctx, id);
  const hours = Number(body?.hours);
  if (!Number.isFinite(hours) || hours < 0 || hours > 24 * 3650) throw staffError(400, 'bad_request', 'hours must be 0 (lift) to 87600.');
  const reason = text(body?.reason, 200);
  if (hours > 0 && !reason) throw staffError(400, 'bad_request', 'Give a reason: the player is told it.');
  const until = hours > 0 ? ctx.now() + hours * HOUR : 0;
  await ctx.repo.updatePlayer(p.id, { bannedUntil: until, banReason: hours > 0 ? reason : null });
  if (until) await ctx.board.remove(p.id);
  else if (p.base) await ctx.board.set(p.id, p.trophies, p.createdAt);
  // Statement of reasons with the appeal route (re-audit, EU DSA art. 17); the 403 on every request says it too.
  if (hours > 0 || (p.bannedUntil ?? 0) > ctx.now()) await notify(ctx, p.id, 'moderation_action', hours > 0 ? [msg('moderation.suspended', { until: utcDate(until), reason }), appeal(ctx)] : [msg('moderation.unsuspended')]);
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
  if (!note) throw staffError(400, 'bad_request', 'Say what was checked (note): it goes in the staff log.');
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
