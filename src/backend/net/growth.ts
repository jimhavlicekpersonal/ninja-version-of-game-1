/**
 * Growth batch protocol additions (2026-11-14; docs/PROTOCOL.md "Growth batch"). Additive: new routes
 * announced by `/v1/hello` features, no protocol bump. Shared by the game and the server.
 *
 * - Referrals (`referrals`, retention audit G13): a new account may enter a friend's code within
 *   `REFERRAL_WINDOW_DAYS`; once the server holds the recruit's village at Keep `REFERRAL_KEEP` or
 *   above (no import held back, no device in common), each side may collect `REFERRAL_JADE` Jade
 *   once, into a village the server holds; an inviter collects at most `REFERRAL_MONTHLY_CAP` a
 *   month. Fixed, never random, never sold.
 * - Shared replays (`shared-replays`, G14): the player picks one of their replays and chooses to
 *   share it; the server re-simulates it under the battle rules it names (refused when it cannot
 *   check them), stores it under a short code for `SHARED_REPLAY_DAYS` days, and anyone can open it
 *   (`?replay=<code>` on the web game). No player names unless an adult sharer asked for theirs;
 *   the opponent is never named, only whether it was a real player, a generated base or practice.
 * - Event schedule (`event-schedule`, G10): `HelloResponse.events` (`eventSchedule.ts`).
 */
import type { BattleResult, BattleSetup, Deployment } from '../../gameplay/sim/battle/types';

export const GrowthRoutes = {
  referrals: '/v1/referrals',
  referralClaim: '/v1/referrals/claim',
  sharedReplays: '/v1/replays/shared',
  /** GET /v1/replays/shared/:code (no token needed), DELETE (the sharer). */
  sharedReplay: (code: string) => `/v1/replays/shared/${encodeURIComponent(code)}`,
} as const;

export const REFERRAL_JADE = 20;
export const REFERRAL_KEEP = 3;
export const REFERRAL_MONTHLY_CAP = 5;
export const REFERRAL_WINDOW_DAYS = 7;
/** An inviter's account must be at least this old when the code is entered (a fresh account made to farm). */
export const REFERRAL_INVITER_MIN_DAYS = 1;

/** POST /v1/referrals. */
export interface ReferralRequest {
  /** The inviter's friend code ("KAGE-XXXXXX"). */
  code: string;
  /** This device's command-queue id (`VillageSync.device`): a device the inviter also plays on is refused. */
  device?: string;
}

/** GET /v1/referrals, and the answers to POST /v1/referrals and /claim. */
export interface ReferralView {
  /** This account came from a friend's code: whether the recruit side qualified and was paid. */
  invitedBy: { qualified: boolean; rewarded: boolean } | null;
  /** Whether a code may still be entered here (new account, none entered yet). */
  canEnterCode: boolean;
  /** Friends who joined with this player's code (counts only, no names). */
  recruits: { waiting: number; qualified: number; rewarded: number };
  /** Rewards ready to collect now (needs a village on the server). */
  claimable: number;
  /** Jade paid by the last claim (claim answers only). */
  granted?: number;
  /** The player's village is on the device: rewards wait until it is on the server. */
  needsServerVillage: boolean;
  rewardJade: number;
  keep: number;
  monthlyCap: number;
  rewardedThisMonth: number;
  windowDays: number;
}

export type SharedOpponent = 'player' | 'generated' | 'practice';

/** POST /v1/replays/shared. */
export interface ShareReplayRequest {
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
  rules: number;
  dataVersion?: string;
  opponent: SharedOpponent;
  /** An adult may show their own name; ignored for anyone else. */
  showName?: boolean;
}

export interface ShareReplayResponse {
  code: string;
  expiresAt: number;
}

/** GET /v1/replays/shared/:code. */
export interface SharedReplayView {
  code: string;
  at: number;
  expiresAt: number;
  rules: number;
  setup: BattleSetup;
  deployments: Deployment[];
  endTick?: number;
  /** The server's own re-simulation. */
  result: Pick<BattleResult, 'stars' | 'destruction'>;
  /** Only when an adult sharer chose to show it. */
  sharerName: string | null;
  opponent: SharedOpponent;
  views: number;
}

export const SHARED_REPLAY_DAYS = 90;
/** Shares one player may make per day. */
export const SHARED_REPLAYS_PER_DAY = 10;
/** Code letters (no look-alikes), as typed or linked. */
export const SHARE_CODE = /^[2-9A-HJKMNP-Z]{10}$/;

/** A pasted code or link, normalized (`?replay=` link, spaces and dashes ignored); null when it is not one. */
export function parseShareCode(input: string): string | null {
  const m = /[?&]replay=([^&#]+)/.exec(input);
  const raw = (m ? decodeURIComponent(m[1]) : input).toUpperCase().replace(/[\s-]/g, '');
  return SHARE_CODE.test(raw) ? raw : null;
}

/** The web link that opens a shared replay. */
export function shareLink(base: string, code: string): string {
  const u = new URL(base);
  u.search = '';
  u.hash = '';
  u.searchParams.set('replay', code);
  return u.toString();
}
