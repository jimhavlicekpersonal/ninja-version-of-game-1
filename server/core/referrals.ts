/**
 * Friend invites (retention audit G13, growth batch 2026-11-14; rules in src/backend/net/growth.ts).
 *
 * A new account enters an inviter's friend code (`link`). Nothing is paid then. Each side later asks
 * (`claim`): the server checks the recruit's village IT holds is at Keep `REFERRAL_KEEP`, that no
 * imported progress is still held back (GLOBAL-002 `import_holds`), that the recruit is not suspended
 * and that the two villages share no device; then it pays the asking side `REFERRAL_JADE` free Jade
 * into the village it holds (a `staffAdjust` server result with ledger reason `referral:*`), once per
 * side. The inviter's side counts against `REFERRAL_MONTHLY_CAP` per UTC month; over it, the reward
 * waits for next month. Fixed and never random; nothing is sold; no names are shown either way.
 *
 * Third verification fixes 2026-11-14: adults only (docs/DECISIONS.md): an under-18 or unstated band neither
 * enters a code, nor earns, nor makes the inviter earn. A claim locks the claiming player (`Repo.lockPlayer`)
 * and marks a side with a conditional write (`markReferralRewarded`), so parallel claims pay once and cannot
 * pass the monthly cap together; the cap counts an anonymised ledger (`referral_rewards`) that outlives a
 * deleted recruit. "No shared device" also compares the stable installation ids each game sends
 * (`ReferralRequest.install`, `player_installs`), not only the per-village command-queue ids.
 */
import { normalizeFriendCode } from '../../src/backend/net/names';
import { REFERRAL_INVITER_MIN_DAYS, REFERRAL_JADE, REFERRAL_KEEP, REFERRAL_MONTHLY_CAP, REFERRAL_WINDOW_DAYS, type ReferralRequest, type ReferralView } from '../../src/backend/net/growth';
import { deserialize } from '../../src/gameplay/sim/save';
import { hallLevel } from '../../src/gameplay/sim/village';
import type { Player, ReferralRow, Repo } from '../repo';
import { ageBandOf } from './ageBand';
import { HOUR, type ServerContext } from './context';
import { fail } from './errors';
import { deviceId } from './purchases';
import { applyServerResult } from './village';

const DAY = 24 * HOUR;

/** Start of the UTC month of `t`. */
export function monthStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

async function heldKeep(repo: Repo, ctx: ServerContext, playerId: string): Promise<{ keep: number; devices: string[] } | null> {
  const row = await repo.getVillage(playerId);
  if (!row) return null;
  return { keep: hallLevel(deserialize(row.file, ctx.data), ctx.data), devices: Object.keys(row.deviceSeqs ?? {}) };
}

/** Adults only (docs/DECISIONS.md 2026-11-14): an unknown band is not adult. */
async function adult(repo: Repo, playerId: string): Promise<boolean> {
  return (await ageBandOf(repo, playerId)) === 'adult';
}

/** Every device id the server knows for a player: their village's command queues and the installations their game named. */
async function knownDevices(repo: Repo, ctx: ServerContext, playerId: string): Promise<string[]> {
  const v = await heldKeep(repo, ctx, playerId);
  return [...(v?.devices ?? []), ...(await repo.installsOf(playerId))];
}

/** Whether the pair qualifies now (both adults, the recruit's held village at the Keep, nothing held back, no shared device). */
async function qualifies(repo: Repo, ctx: ServerContext, r: ReferralRow): Promise<boolean> {
  const recruit = await repo.getPlayer(r.recruitId);
  if (!recruit || (recruit.bannedUntil ?? 0) > ctx.now()) return false;
  if (!(await adult(repo, r.recruitId)) || !(await adult(repo, r.inviterId))) return false;
  const v = await heldKeep(repo, ctx, r.recruitId);
  if (!v || v.keep < REFERRAL_KEEP) return false;
  if ((await repo.importHoldsOf(r.recruitId)).some((h) => h.status === 'held')) return false;
  const mine = [...v.devices, ...(await repo.installsOf(r.recruitId))];
  if ((await knownDevices(repo, ctx, r.inviterId)).some((d) => mine.includes(d))) return false;
  return true;
}

/** Note the installation id a request carried (ignored when missing or malformed). */
async function noteInstall(ctx: ServerContext, me: Player, raw: unknown): Promise<string | null> {
  const install = deviceId(raw);
  if (install) await ctx.repo.noteInstall(me.id, install, ctx.now());
  return install;
}

export async function view(ctx: ServerContext, me: Player, granted?: number): Promise<ReferralView> {
  const g = ctx.repo;
  const mine = await g.referralOf(me.id);
  const recruits = await g.referralsBy(me.id);
  const now = ctx.now();
  const held = Boolean(await ctx.repo.getVillage(me.id));
  const rewardedThisMonth = await g.inviterRewardsSince(me.id, monthStart(now));
  const room = Math.max(0, REFERRAL_MONTHLY_CAP - rewardedThisMonth);
  const isAdult = await adult(g, me.id);
  const inviterReady = recruits.filter((r) => r.qualifiedAt !== null && r.inviterRewardedAt === null).length;
  const claimable = held && isAdult ? (mine && mine.qualifiedAt !== null && mine.recruitRewardedAt === null ? 1 : 0) + Math.min(room, inviterReady) : 0;
  return {
    invitedBy: mine ? { qualified: mine.qualifiedAt !== null, rewarded: mine.recruitRewardedAt !== null } : null,
    canEnterCode: isAdult && !mine && now - me.createdAt <= REFERRAL_WINDOW_DAYS * DAY,
    ...(isAdult ? {} : { adultsOnly: true }),
    recruits: {
      waiting: recruits.filter((r) => r.qualifiedAt === null).length,
      qualified: inviterReady,
      rewarded: recruits.filter((r) => r.inviterRewardedAt !== null).length,
    },
    claimable,
    ...(granted !== undefined ? { granted } : {}),
    needsServerVillage: !held,
    rewardJade: REFERRAL_JADE,
    keep: REFERRAL_KEEP,
    monthlyCap: REFERRAL_MONTHLY_CAP,
    rewardedThisMonth,
    windowDays: REFERRAL_WINDOW_DAYS,
  };
}

/** POST /v1/referrals: this new account came from `code`. */
export async function link(ctx: ServerContext, me: Player, body: Partial<ReferralRequest> | undefined): Promise<ReferralView> {
  const now = ctx.now();
  if (now - me.createdAt > REFERRAL_WINDOW_DAYS * DAY) throw fail(409, 'conflict', 'referral.too_late', { days: REFERRAL_WINDOW_DAYS });
  const code = normalizeFriendCode(body?.code);
  const inviter = code ? await ctx.repo.playerByFriendCode(code) : null;
  if (!inviter) throw fail(404, 'not_found', 'referral.no_code');
  if (inviter.id === me.id) throw fail(400, 'bad_request', 'referral.self');
  // Adults only: a minor's (or an unstated) entry changes nothing; the game shows the kind message instead of the field.
  if (!(await adult(ctx.repo, me.id))) throw fail(403, 'age_restricted', 'referral.adults_only');
  const g = ctx.repo;
  if (await g.referralOf(me.id)) throw fail(409, 'conflict', 'referral.already');
  // Anti-abuse: an inviter made minutes ago, a device the inviter plays on, a block either way.
  if (now - inviter.createdAt < REFERRAL_INVITER_MIN_DAYS * DAY || inviter.createdAt >= me.createdAt) throw fail(409, 'conflict', 'referral.not_allowed');
  // A minor's code earns nothing either (the same answer as any other refusal: no age is revealed).
  if (!(await adult(ctx.repo, inviter.id))) throw fail(409, 'conflict', 'referral.not_allowed');
  const blocks = [...(await ctx.repo.blocksOf(me.id)), ...(await ctx.repo.blocksOf(inviter.id))];
  if (blocks.some((b) => b.blockedId === inviter.id || b.blockedId === me.id)) throw fail(409, 'conflict', 'referral.not_allowed');
  await noteInstall(ctx, me, body?.install);
  const theirDevices = await knownDevices(ctx.repo, ctx, inviter.id);
  const myDevices = [...(await knownDevices(ctx.repo, ctx, me.id)), ...(typeof body?.device === 'string' ? [body.device.slice(0, 64)] : [])];
  if (myDevices.some((d) => theirDevices.includes(d))) throw fail(409, 'conflict', 'referral.not_allowed');
  if (!(await g.addReferral({ recruitId: me.id, inviterId: inviter.id, at: now, qualifiedAt: null, recruitRewardedAt: null, inviterRewardedAt: null }))) throw fail(409, 'conflict', 'referral.already');
  ctx.metrics.count('tk_referrals_total', { what: 'linked' });
  return view(ctx, me);
}

/** POST /v1/referrals/claim: check every pair this player is in and pay what is due to them. */
export async function claim(ctx: ServerContext, me: Player, body?: { install?: unknown }): Promise<ReferralView> {
  const g0 = ctx.repo;
  await noteInstall(ctx, me, body?.install);
  const pairs = [...(await g0.referralsBy(me.id))];
  const mine = await g0.referralOf(me.id);
  if (mine) pairs.unshift(mine);
  // Qualification is recorded once seen (it never goes back), then rewards are paid inside one transaction each.
  for (const r of pairs) if (r.qualifiedAt === null && (await qualifies(ctx.repo, ctx, r))) await g0.updateReferral(r.recruitId, { qualifiedAt: ctx.now() });
  let granted = 0;
  if (await ctx.repo.getVillage(me.id)) {
    for (const r0 of pairs) {
      const paid = await ctx.repo.transaction(async (tx) => {
        const g = tx;
        // Parallel claims of this player wait here (cross-instance advisory lock), so the cap count below and the
        // write after it are one step; the conditional write still refuses a side another request just marked.
        await g.lockPlayer(me.id);
        const r = await g.referralOf(r0.recruitId);
        if (!r || r.qualifiedAt === null) return 0;
        if (!(await adult(g, me.id))) return 0;
        const side = r.recruitId === me.id ? 'recruit' : 'inviter';
        if (side === 'recruit' ? r.recruitRewardedAt !== null : r.inviterRewardedAt !== null) return 0;
        if (side === 'inviter' && (await g.inviterRewardsSince(me.id, monthStart(ctx.now()))) >= REFERRAL_MONTHLY_CAP) return 0;
        if (!(await g.markReferralRewarded(r.recruitId, side, ctx.now()))) return 0;
        const out = await applyServerResult(tx, ctx, me, [{ cmd: { type: 'staffAdjust', resources: { moonstones: REFERRAL_JADE } }, reason: `referral:${side}` }], `referral:${r.recruitId}`);
        if (!out || !out.ok) throw fail(409, 'conflict', 'village.changed');
        return REFERRAL_JADE;
      });
      if (paid) ctx.metrics.count('tk_referrals_total', { what: 'rewarded' });
      granted += paid;
    }
  }
  return view(ctx, me, granted);
}
