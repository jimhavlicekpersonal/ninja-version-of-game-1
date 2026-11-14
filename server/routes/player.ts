/** Routes: identity, friends, linked sign-ins, account protections, the server-held village, purchases, push, reports and the no-token forms. */
import type {
  AckRequest,
  AgeRequest,
  BlockRequest,
  ComplaintRequest,
  DeletionRequestBody,
  FriendRequestBody,
  IntentReleaseRequest,
  PlatformFriendsRequest,
  PrivacyRequest,
  PurchaseIntentRequest,
  PushTokenRequest,
  RedeemRequest,
  RegisterRequest,
  RenameRequest,
  ReportRequest,
  RulesRequest,
  SignInRequest,
  CommandBatch,
} from '../../src/backend/net/protocol';
import { Routes } from '../../src/backend/net/protocol';
import type { StatsBatch } from '../../src/backend/net/stats';
import { COMPLAINT_PAGE_CSP, complaintPage } from '../complaintPage';
import { DELETION_PAGE_CSP, deletionPage } from '../accountPage';
import { BODY_LIMITS, type RateLimits } from '../rateLimit';
import type { RouteKit } from './kit';
import { array, body, boolean, fields, nullable, number, object, params, query, string } from './schema';

/** Lookups and friend requests are rate limited per minute and per day. */
const LOOKUP_RATE: (keyof RateLimits)[] = ['lookup', 'lookupDay'];
/** Most JSON bodies of a platform friend list stay under this. */
const PLATFORM_FRIENDS_BODY_LIMIT = 32 * 1024;

const nameBody = body(fields<RegisterRequest & RenameRequest>()({ name: string() }));
const idsBody = body(fields<AckRequest>()({ ids: array(string()) }));
const idParam = params('id');

export function playerRoutes({ open, player, core }: RouteKit): void {
  // Identity
  open('POST', Routes.players, { body: nameBody, rate: 'register' }, async ({ body, reply }) => reply.code(201).send(await core.register(body?.name)));
  player('GET', Routes.me, {}, async (me) => core.me(me));
  player('PUT', Routes.me, { body: nameBody }, async (me, { body }) => core.rename(me, body?.name));
  player('DELETE', Routes.me, {}, async (me) => core.deleteAccount(me));

  // Friends and names (roadmap step 59).
  player('GET', Routes.friends, {}, async (me) => core.friends(me));
  player('PUT', Routes.privacy, { body: body(fields<PrivacyRequest>()({ findable: string(), showOnline: boolean() })) }, async (me, { body }) => core.setPrivacy(me, body));
  player('GET', Routes.playerLookup, { query: query('name'), rate: LOOKUP_RATE }, async (me, { query }) => core.lookupPlayer(me, query.name));
  player('GET', '/v1/players/code/:code', { params: params('code'), rate: LOOKUP_RATE }, async (me, { params }) => core.playerByCode(me, params.code));
  player('POST', Routes.friendRequests, { body: body(fields<FriendRequestBody>()({ name: string(), code: string(), playerId: string() })), rate: LOOKUP_RATE }, async (me, { body }) => core.friendRequest(me, body));
  player('POST', '/v1/friends/requests/:id', { params: idParam, body: body(fields<{ accept: boolean }>()({ accept: boolean() })) }, async (me, { params, body }) => core.answerFriendRequest(me, params.id, body?.accept));
  player('DELETE', '/v1/friends/requests/:id', { params: idParam }, async (me, { params }) => core.cancelFriendRequest(me, params.id));
  player('POST', Routes.platformFriends, { body: body(fields<PlatformFriendsRequest>()({ provider: string(), ids: array(string()) })), rate: LOOKUP_RATE, bodyLimit: PLATFORM_FRIENDS_BODY_LIMIT }, async (me, { body }) => core.platformFriends(me, body));
  player('DELETE', '/v1/friends/:id', { params: idParam }, async (me, { params }) => core.unfriend(me, params.id));

  // Linked sign-ins = cloud save (step 24)
  const signInFields = fields<SignInRequest>()({ provider: string(), credential: object(), device: string() });
  player('GET', Routes.links, {}, async (me) => core.links(me));
  player('POST', Routes.links, { body: body(signInFields), rate: 'moderation' }, async (me, { body }) => core.link(me, body));
  player('DELETE', '/v1/links/:provider', { params: params('provider') }, async (me, { params }) => core.unlink(me, params.provider));
  open('POST', Routes.sessions, { body: body(signInFields), rate: 'register' }, async ({ body }) => core.signIn(body));
  // Re-audit: account protections (age bands, notices, deletion codes, signing out other devices, Apple notifications).
  player('PUT', Routes.meAge, { body: body(fields<AgeRequest>()({ band: nullable(string()) })), rate: 'moderation' }, async (me, { body }) => core.stateAge(me, body));
  player('PUT', Routes.meRules, { body: body(fields<RulesRequest>()({ version: number() })) }, async (me, { body }) => core.acceptRules(me, body));
  player('POST', Routes.deletionCode, { rate: 'moderation' }, async (me) => core.deletionCode(me));
  player('GET', Routes.notices, {}, async (me) => core.notices(me));
  player('POST', Routes.noticesRead, { body: idsBody }, async (me, { body }) => core.markNoticesRead(me, body?.ids));
  player('POST', Routes.sessionsRevokeOthers, { rate: 'moderation' }, async (me) => core.revokeOtherSessions(me));
  // Backend A15/A16: sign-in nonces, signing out this device, rotating its token.
  open('POST', Routes.authNonce, { rate: 'nonce' }, async () => core.authNonce());
  player('DELETE', Routes.sessionsCurrent, { rate: 'moderation' }, async (me) => core.signOutDevice(me));
  player('POST', Routes.sessionsRotate, { rate: 'moderation' }, async (me) => core.rotateToken(me));
  open('POST', Routes.appleSignInNotifications, { body: body(fields<{ payload: string }>()({ payload: string() })), bodyLimit: BODY_LIMITS.base }, async ({ body }) => {
    await core.appleSignInNotification(body);
    return { ok: true };
  });

  // Server-owned village (roadmap Phase 2)
  player('GET', Routes.village, {}, async (me) => core.getVillage(me));
  player('POST', Routes.village, {}, async (me) => core.startVillage(me));
  player('POST', Routes.villageImport, { body: body(fields<{ file: object }>()({ file: object() })), rate: 'villageImport', bodyLimit: BODY_LIMITS.battle * 4 }, async (me, { body }) => core.importVillage(me, body));
  // Each command stays an object here: the core refuses a malformed one by itself and applies the rest.
  player('POST', Routes.villageCommands, { body: body(fields<CommandBatch>()({ stateHash: string(), commands: array(object()), device: string() })), rate: 'commands', bodyLimit: BODY_LIMITS.battle }, async (me, { body }) => core.villageCommands(me, body));
  player('GET', Routes.villageLedger, { query: query('limit') }, async (me, { query }) => core.ledger(me, query.limit));

  // Purchases (roadmap Phase 4): ask, redeem once, history; store notifications carry their own signatures.
  player('POST', Routes.purchaseIntent, { body: body(fields<PurchaseIntentRequest>()({ store: string(), productId: string(), under18: nullable(boolean()), device: string() })), rate: 'purchase' }, async (me, { body }) => core.purchaseIntent(me, body));
  player('POST', Routes.purchaseIntentRelease, { body: body(fields<IntentReleaseRequest>()({ accountToken: string(), outcome: string() })), rate: 'purchase' }, async (me, { body }) => core.releaseIntent(me, body));
  player('POST', Routes.purchases, { body: body(fields<RedeemRequest>()({ store: string(), storeProductId: string(), receipt: string() })), rate: 'purchase', bodyLimit: BODY_LIMITS.base }, async (me, { body }) => core.redeem(me, body));
  player('GET', Routes.purchases, { rate: 'purchase' }, async (me) => core.purchaseHistory(me));
  open('POST', Routes.appleNotifications, { body: body(fields<{ signedPayload: string }>()({ signedPayload: string() })), bodyLimit: BODY_LIMITS.base }, async ({ body }) => {
    await core.appleNotification(body);
    return { ok: true };
  });
  // Google's push body is checked by its OIDC token and then by the core (it is Google's, not the game's).
  open('POST', Routes.googleNotifications, { bodyLimit: BODY_LIMITS.base }, async ({ req, reply }) => {
    await core.googleNotification(req.headers.authorization, req.body);
    return reply.code(204).send();
  });

  // Server push (step 40): this device's token and choices.
  player('PUT', Routes.pushTokens, { body: body(fields<PushTokenRequest>()({ locale: string(), token: string(), platform: string(), types: array(string()), tzOffsetMinutes: number() })), rate: 'moderation' }, async (me, { body }) => core.putPushToken(me, body));
  player('DELETE', Routes.pushTokens, { query: query('token') }, async (me, { query }) => core.deletePushToken(me, query.token));

  // Reports and blocks
  player('POST', Routes.reports, { body: body(fields<ReportRequest>()({ kind: string(), messageId: string(), playerId: string(), reason: string(), note: string(), block: boolean() })), rate: 'moderation' }, async (me, { body, reply }) => reply.code(201).send(await core.report(me, body)));
  player('GET', Routes.blocks, {}, async (me) => core.blocks(me));
  player('POST', Routes.blocks, { body: body(fields<BlockRequest>()({ playerId: string() })), rate: 'moderation' }, async (me, { body }) => core.block(me, body?.playerId));
  player('DELETE', '/v1/blocks/:id', { params: idParam }, async (me, { params }) => core.unblock(me, params.id));

  // Account deletion without the game: the web page and its requests (no token).
  const lang = query('lang');
  open('GET', Routes.deletionPage, { query: lang }, async ({ query, reply }) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', DELETION_PAGE_CSP).header('Cache-Control', 'no-store').send(deletionPage(query.lang ?? 'en')));
  open('POST', Routes.deletionRequests, { body: body(fields<DeletionRequestBody>()({ playerId: string(), name: string(), contact: string(), note: string(), code: string() })), rate: 'deletionRequest' }, async ({ body, reply }) => reply.code(202).send(await core.requestDeletion(body)));
  // Complaints about illegal or harmful content (EU DSA art. 16, UK OSA): a form and its endpoint, no token.
  open('GET', '/complaints', { query: lang }, async ({ query, reply }) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', COMPLAINT_PAGE_CSP).header('Cache-Control', 'no-store').send(complaintPage(core.ctx.account?.supportContact, query.lang ?? 'en')));
  open('POST', Routes.complaints, { body: body(fields<ComplaintRequest>()({ subject: string(), reason: string(), contact: string(), playerId: string() })), rate: 'complaint', logLevel: 'warn' }, async ({ body, reply }) => reply.code(201).send(await core.submitComplaint(body)));

  // Shared play statistics (report section 5 step 5): no token, and no request log line (it would hold the IP address).
  // Events stay objects here: the core keeps the shareable ones and counts the rest out.
  open('POST', Routes.stats, { body: body(fields<StatsBatch>()({ install: string(), build: string(), arm: string(), tz: number(), events: array(object()) })), rate: 'stats', bodyLimit: BODY_LIMITS.base, logLevel: 'warn' }, async ({ body }) => core.postStats(body));
  open('DELETE', Routes.stats, { query: query('install'), rate: 'stats', logLevel: 'warn' }, async ({ query }) => core.deleteStats(query.install));
}
