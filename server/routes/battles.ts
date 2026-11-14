/** Routes: PvP (bases, matches, reports), Friendly Duels, Gang Wars and the Grove Raid. Every battle report is re-simulated by the core. */
import type {
  AttackStartRequest,
  BattleSubmission,
  DuelLayoutRequest,
  DuelTicketRequest,
  GangWarTicketRequest,
  RaidClaimRequest,
  RaidTicketRequest,
  UploadBaseRequest,
} from '../../src/backend/net/protocol';
import { Routes } from '../../src/backend/net/protocol';
import { BODY_LIMITS } from '../rateLimit';
import { client, type RouteKit } from './kit';
import { array, body, boolean, fields, nullable, number, object, query, record, requiredBody, string } from './schema';

/**
 * A battle report. The fields every supported game sends are required; deployments and the hero stay
 * objects here (the re-simulation reads them, and refuses what it cannot replay).
 */
const battleBody = requiredBody(
  fields<BattleSubmission>()(
    {
      ticket: string(),
      seed: number(),
      army: record(number()),
      levels: record(number()),
      reinforcements: record(object()),
      hero: object(),
      deployments: array(object()),
      endTick: number(),
      clientHash: string(),
      rules: number(),
      dataVersion: string(),
    },
    ['ticket'],
  ),
);
const ticketBody = body(fields<AttackStartRequest>()({ ticket: string(), stake: number() }));

export function battleRoutes({ player, core }: RouteKit): void {
  // PvP
  player('PUT', Routes.base, { body: requiredBody(fields<UploadBaseRequest>()({ base: object(), name: string() }, ['base'])), bodyLimit: BODY_LIMITS.base }, async (me, { body, req }) => core.uploadBase(me, body, client(req)));
  player('GET', Routes.match, { rate: 'match' }, async (me, { req }) => core.match(me, client(req)));
  player('POST', Routes.attacks, { body: battleBody, rate: 'battle', bodyLimit: BODY_LIMITS.battle }, async (me, { body }) => core.attack(me, body));
  player('POST', Routes.attackStart, { body: ticketBody, rate: 'battle' }, async (me, { body }) => core.startAttack(me, body));
  player('POST', Routes.attackVoid, { body: ticketBody, rate: 'battle' }, async (me, { body }) => core.voidAttack(me, body));
  player('GET', Routes.defenses, { query: query('since') }, async (me, { query }) => core.defenses(me, Number(query.since ?? 0)));
  player('GET', Routes.leaderboard, { query: query('limit') }, async (me, { query }) => core.leaderboard(me, Number(query.limit ?? 50)));
  player('GET', Routes.powerLeaderboard, { query: query('limit') }, async (me, { query }) => core.powerLeaderboard(me, Number(query.limit ?? 50)));

  // Friendly Duels (step 62): re-simulated like attacks, so they count against the battle limit.
  player('POST', Routes.duelTicket, { body: body(fields<DuelTicketRequest>()({ friendId: string(), layout: string(), challengeId: string() })), rate: 'match' }, async (me, { body, req }) => core.duelTicket(me, body, client(req)));
  player('POST', Routes.duels, { body: battleBody, rate: 'battle', bodyLimit: BODY_LIMITS.battle }, async (me, { body }) => core.reportDuel(me, body));
  player('GET', Routes.duels, { query: query('since') }, async (me, { query }) => core.duels(me, query.since));
  player('PUT', Routes.duelLayout, { body: body(fields<DuelLayoutRequest>()({ base: nullable(object()) })), bodyLimit: BODY_LIMITS.base }, async (me, { body, req }) => core.setDuelLayout(me, body, client(req)));
  player('POST', Routes.duelChallenges, { body: body(fields<{ friendId: string }>()({ friendId: string() })), rate: 'moderation' }, async (me, { body }) => core.challenge(me, body?.friendId));
  player('GET', Routes.duelChallenges, {}, async (me) => core.challenges(me));

  // Gang Wars (steps 65-66)
  player('GET', Routes.squadWar, {}, async (me) => core.gangWar(me));
  player('POST', Routes.squadWarQueue, { rate: 'match' }, async (me) => core.gangWarQueue(me));
  player('DELETE', Routes.squadWarQueue, {}, async (me) => core.gangWarCancel(me));
  player('POST', Routes.squadWarBase, { rate: 'moderation' }, async (me) => core.gangWarBase(me));
  player('POST', Routes.squadWarTicket, { body: body(fields<GangWarTicketRequest>()({ target: number(), relay: boolean() })), rate: 'match' }, async (me, { body, req }) => core.gangWarTicket(me, body, client(req)));
  player('POST', Routes.squadWarAttacks, { body: battleBody, rate: 'battle', bodyLimit: BODY_LIMITS.battle }, async (me, { body }) => core.gangWarAttack(me, body));
  player('POST', Routes.squadWarClaim, { body: body(fields<{ warId: string }>()({ warId: string() })) }, async (me, { body }) => core.gangWarClaim(me, body?.warId));

  // Grove Raid
  player('GET', Routes.groveRaid, {}, async (me) => core.raid(me));
  player('POST', Routes.groveRaidTicket, { body: body(fields<RaidTicketRequest>()({ target: number() })), rate: 'match' }, async (me, { body, req }) => core.raidTicket(me, body?.target, client(req)));
  player('POST', Routes.groveRaidAttacks, { body: battleBody, rate: 'battle', bodyLimit: BODY_LIMITS.battle }, async (me, { body }) => core.raidAttack(me, body));
  player('POST', Routes.groveRaidClaim, { body: body(fields<RaidClaimRequest>()({ week: number() })) }, async (me, { body }) => core.claimRaid(me, body?.week));
}
