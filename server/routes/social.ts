/** Routes: Alliances (groves: chat, troop requests, donations) and Gangs. */
import type { AckRequest, CreateGroveRequest, CreateRequestRequest, DonateRequest, MyGroveResponse, PostChatRequest } from '../../src/backend/net/protocol';
import { Routes } from '../../src/backend/net/protocol';
import type { RouteKit } from './kit';
import { array, body, boolean, fields, number, params, query, requiredBody, string } from './schema';

const nameBody = body(fields<CreateGroveRequest>()({ name: string() }));
const chatBody = body(fields<PostChatRequest>()({ text: string() }));
const capacityBody = body(fields<CreateRequestRequest>()({ capacity: number() }));
const donateBody = requiredBody(fields<DonateRequest>()({ troop: string(), count: number(), level: number() }, ['troop', 'count', 'level']));
const friendBody = body(fields<{ friendId: string }>()({ friendId: string() }));
const idParam = params('id');

export function socialRoutes({ player, core }: RouteKit): void {
  // Groves
  player('GET', Routes.groves, { query: query('q') }, async (me, { query }) => core.listGroves(me, query.q ?? ''));
  player('POST', Routes.groves, { body: nameBody }, async (me, { body, reply }) => reply.code(201).send(await core.createGrove(me, body?.name)));
  player('POST', '/v1/groves/:id/join', { params: idParam }, async (me, { params }) => core.joinGrove(me, params.id));
  player('GET', Routes.grove, {}, async (me): Promise<MyGroveResponse> => ({ grove: await core.myGrove(me) }));
  player('POST', Routes.groveLeave, {}, async (me) => core.leaveGrove(me));
  player('GET', Routes.groveChat, { query: query('after') }, async (me, { query }) => core.chat(me, query.after));
  player('POST', Routes.groveChat, { body: chatBody }, async (me, { body, reply }) => reply.code(201).send(await core.postChat(me, body?.text)));
  player('GET', Routes.groveRequests, {}, async (me) => core.requests(me));
  player('POST', Routes.groveRequests, { body: capacityBody }, async (me, { body, reply }) => reply.code(201).send(await core.requestTroops(me, body?.capacity)));
  player('POST', '/v1/grove/requests/:id/donate', { params: idParam, body: donateBody }, async (me, { params, body }) => core.donate(me, params.id, body));
  player('GET', Routes.groveInbox, {}, async (me) => core.inbox(me));
  player('POST', Routes.groveInboxAck, { body: body(fields<AckRequest>()({ ids: array(string()) })) }, async (me, { body }) => core.ackInbox(me, body?.ids));

  // Gangs (step 63)
  player('GET', Routes.squad, {}, async (me) => core.squad(me));
  player('POST', Routes.squad, { body: nameBody, rate: 'moderation' }, async (me, { body }) => core.createSquad(me, body?.name));
  player('POST', Routes.squadInvites, { body: friendBody, rate: 'moderation' }, async (me, { body }) => core.squadInvite(me, body?.friendId));
  player('POST', '/v1/squad/invites/:id', { params: idParam, body: body(fields<{ accept: boolean }>()({ accept: boolean() })) }, async (me, { params, body }) => core.answerSquadInvite(me, params.id, body?.accept));
  player('POST', Routes.squadLeave, {}, async (me) => core.leaveSquad(me));
  player('POST', Routes.squadLeader, { body: body(fields<{ playerId: string }>()({ playerId: string() })) }, async (me, { body }) => core.squadLeader(me, body?.playerId));
  player('GET', Routes.squadChat, { query: query('after') }, async (me, { query }) => core.squadChat(me, query.after));
  player('POST', Routes.squadChat, { body: chatBody }, async (me, { body, reply }) => reply.code(201).send(await core.postSquadChat(me, body?.text)));
  player('GET', Routes.squadRequests, {}, async (me) => core.squadRequests(me));
  player('POST', Routes.squadRequests, { body: capacityBody }, async (me, { body, reply }) => reply.code(201).send(await core.squadRequestTroops(me, body?.capacity)));
  player('POST', '/v1/squad/requests/:id/donate', { params: idParam, body: donateBody }, async (me, { params, body }) => core.squadDonate(me, params.id, body));
}
