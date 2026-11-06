/**
 * Protocol contract: what any Toadstool Kingdoms server must do, checked
 * through the game's own HTTP adapter. Run it against a deployed or future
 * server with
 *
 *   CONTRACT_URL=https://your-server.example.com npm run test:contract
 *
 * Without CONTRACT_URL it starts our server (memory storage) on a free port,
 * so it also runs with every `npm test`.
 *
 * It uses the server's real clock and leaves a few test players and a test
 * Grove behind (names start with "Contract"), so point it at a staging server
 * rather than production when you can.
 */
import { COMMUNITY_RULES_VERSION } from '../../../src/backend/net/protocol';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { HttpServerAdapter, memoryTokenStore } from '../../../src/backend/net/httpAdapter';
import { ServerError } from '../../../src/backend/net/ports';
import { PROTOCOL_VERSION, Routes } from '../../../src/backend/net/protocol';
import { createBattle, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { pointAt } from '../../../src/gameplay/sim/battle/infiltration';
import { createRng } from '../../../src/gameplay/sim/rng';
import { defaultData as data } from '../../../src/gameplay/sim/data';

let url = process.env.CONTRACT_URL ?? '';
let close: (() => Promise<void>) | null = null;
const tag = Math.random().toString(36).slice(2, 7);

beforeAll(async () => {
  if (url) return;
  const app = buildServer({ repo: new MemoryRepo(), data });
  await app.listen({ port: 0, host: '127.0.0.1' });
  url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  close = () => app.close();
});
afterAll(async () => {
  await close?.();
});

const client = () => new HttpServerAdapter(url, { tokens: memoryTokenStore(), retryDelayMs: 200 });

async function player(name: string, hall = 1) {
  const c = client();
  const reg = await c.register(`Contract ${name} ${tag}`);
  await c.acceptRules({ version: COMMUNITY_RULES_VERSION });
  await c.uploadBase({ base: generateOpponent(hall * 101 + name.length, hall, data) });
  return Object.assign(c, { id: reg.playerId });
}

async function errorOf(p: Promise<unknown>): Promise<ServerError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e;
    throw e;
  }
  throw new Error('expected the server to refuse this');
}

const rush = (n: number) => ({ army: { hedgehog_roller: n }, deployments: Array.from({ length: n }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i })) });

describe('protocol contract', () => {
  it('hello: names the game, its protocol range and features', async () => {
    const h = await client().hello(); // the adapter also checks compatibility
    expect(h.name).toBe('toadstool-kingdoms');
    expect(h.minProtocol).toBeLessThanOrEqual(PROTOCOL_VERSION);
    expect(h.protocol).toBeGreaterThanOrEqual(PROTOCOL_VERSION);
    expect(h.minProtocol).toBeGreaterThanOrEqual(7);
    expect(h.features).toContain('warriors-50');
    expect(Math.abs(h.serverTime - Date.now())).toBeLessThan(5 * 60_000);
    expect(h.features).toEqual(expect.arrayContaining(['pvp', 'leaderboard', 'groves', 'grove-chat', 'donations', 'grove-raid', 'server-seed']));
  });

  it('answers CORS preflights so the web game can call it', async () => {
    const res = await fetch(`${url}${Routes.match}`, { method: 'OPTIONS', headers: { origin: 'https://example.github.io', 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('identity: register gives a token; calls without it get 401 unauthorized with an error body', async () => {
    const c = client();
    const e = await errorOf(c.me());
    expect(e.status).toBe(401);
    expect(e.code).toBe('unauthorized');
    expect(e.message).toBeTruthy();
    const r = await c.register(`Contract Pip ${tag}`);
    await c.acceptRules({ version: COMMUNITY_RULES_VERSION });
    expect(r.playerId).toBeTruthy();
    expect(r.token.length).toBeGreaterThanOrEqual(16);
    const me = await c.me();
    expect(me).toMatchObject({ id: r.playerId, groveId: null, hallLevel: 1 });
    expect(me.shieldUntil).toBeGreaterThan(Date.now()); // new players start shielded
    // Names are unique and 3-18 characters (step 59): a valid one is taken as typed.
    expect((await c.rename(`Bold Pip ${tag}`)).name).toBe(`Bold Pip ${tag}`);
  });

  /** Two friends, ready for duels and Gangs. */
  async function friendPair(a: string, b: string) {
    const x = client();
    const y = client();
    const rx = await x.register(`${a} ${tag}`);
    const ry = await y.register(`${b} ${tag}`);
    await x.acceptRules({ version: COMMUNITY_RULES_VERSION });
    await y.acceptRules({ version: COMMUNITY_RULES_VERSION });
    for (const c of [x, y]) await c.uploadBase({ base: generateOpponent(303 + a.length, 3, data) });
    await x.sendFriendRequest({ playerId: ry.playerId });
    await y.sendFriendRequest({ playerId: rx.playerId });
    return { x: Object.assign(x, { id: rx.playerId }), y: Object.assign(y, { id: ry.playerId }) };
  }

  it('duels: ticket, report, history, layout, challenges (step 62)', async () => {
    if (!(await client().hello()).features.includes('duels')) return;
    const { x, y } = await friendPair('Duo', 'Rival');
    const t = await x.duelTicket({ friendId: y.id });
    expect(t.base.buildings.every((b) => !Object.values(b.loot ?? {}).some(Boolean))).toBe(true);
    const r = await x.reportDuel({ ticket: t.ticket, seed: t.seed, army: { hedgehog_roller: 1 }, deployments: [] });
    expect(r.rivalry).toMatchObject({ friendId: y.id, duels: 1 });
    expect((await y.duels()).duels[0]).toMatchObject({ side: 'defense', seed: t.seed });
    await y.setDuelLayout({ base: generateOpponent(77, 3, data) });
    expect((await x.duelTicket({ friendId: y.id, layout: 'duel' })).layout).toBe('duel');
    const c = await x.challenge(y.id);
    expect((await y.challenges()).challenges.map((v) => v.id)).toContain(c.id);
  });

  it('Gangs and Gang Wars: found, invite, join, chat, requests, queue, leave (steps 63, 65)', async () => {
    const features = (await client().hello()).features;
    if (!features.includes('gangs')) return;
    const { x, y } = await friendPair('Lead', 'Mate');
    await x.createSquad(`Crew ${tag}`);
    await x.squadInvite(y.id);
    const inv = (await y.squad()).invites[0];
    expect((await y.answerSquadInvite(inv.id, true)).squad!.members).toHaveLength(2);
    const m = await y.postSquadChat('hello');
    expect((await x.squadChat()).messages.map((v) => v.id)).toContain(m.id);
    expect(Array.isArray((await x.squadRequests()).requests)).toBe(true);
    if (features.includes('gang-wars')) {
      const q = await x.gangWarQueue();
      expect(q.war !== null || q.queued !== null).toBe(true);
      if (!q.war) expect((await x.gangWarCancel()).queued).toBeNull();
      expect((await errorOf(x.gangWarClaim('no-such-war'))).status).toBe(404);
    }
    if (!(await x.gangWar().catch(() => null))?.war) {
      await y.leaveSquad();
      expect((await y.squad()).squad).toBeNull();
    }
  });

  it('platform friends need a linked platform (step 61)', async () => {
    if (!(await client().hello()).features.includes('platform-friends')) return;
    const c = client();
    await c.register(`Lonely ${tag}`);
    expect((await errorOf(c.platformFriends({ provider: 'gamecenter', ids: ['x'] }))).status).toBe(403);
  });

  it('friends: exact name lookup, codes, requests, privacy (step 59)', async () => {
    const hello = await client().hello();
    if (!hello.features.includes('friends')) return;
    const a = client();
    const b = client();
    await a.register(`Kit ${tag}`);
    const bName = `Rook ${tag}`;
    await b.register(bName);
    // Case and separators do not matter; partial names find nobody.
    const card = await a.lookupPlayer(bName.toUpperCase().replace(' ', '_'));
    expect(card).toMatchObject({ name: bName, relation: 'none' });
    expect((await errorOf(a.lookupPlayer(bName.slice(0, -1)))).status).toBe(404);
    const sent = await a.sendFriendRequest({ name: bName });
    expect(sent.status).toBe('sent');
    const theirs = await b.friends();
    expect(theirs.code).toMatch(/^KAGE-[2-9A-HJKMNP-Z]{6}$/);
    expect(theirs.incoming.map((r) => r.player.name)).toEqual([`Kit ${tag}`]);
    await b.answerFriendRequest(theirs.incoming[0].id, true);
    expect((await a.friends()).friends.map((f) => f.name)).toEqual([bName]);
    // Hidden from name search, still found by code; friends still find each other.
    await b.setPrivacy({ findable: 'nobody' });
    const c = client();
    await c.register(`Wren ${tag}`);
    expect((await errorOf(c.lookupPlayer(bName))).status).toBe(404);
    expect((await c.playerByCode(theirs.code)).name).toBe(bName);
    expect((await a.lookupPlayer(bName)).relation).toBe('friend');
    await a.unfriend(card.id);
    expect((await a.friends()).friends).toEqual([]);
  });

  it('bases: valid ones are stored, impossible ones are refused with bad_request', async () => {
    const c = client();
    await c.register(`Contract Base ${tag}`);
    await c.uploadBase({ base: generateOpponent(5, 2, data) });
    expect((await c.me()).hallLevel).toBe(2);
    const bad = generateOpponent(5, 2, data);
    bad.buildings[1] = { ...bad.buildings[1], x: bad.buildings[0].x, y: bad.buildings[0].y };
    const e = await errorOf(c.uploadBase({ base: bad }));
    expect(e).toMatchObject({ status: 400, code: 'bad_request' });
  });

  it('pvp: match gives a base within one Elder Toadstool level; the server re-runs the battle exactly like the game', async () => {
    const a = await player('Attacker', 2);
    const m = (await a.match())!;
    expect(m).not.toBeNull();
    expect(Math.abs(m.base.hallLevel - 2)).toBeLessThanOrEqual(1);
    expect(['player', 'bot']).toContain(m.opponent.kind);
    expect(m.expiresAt).toBeGreaterThan(Date.now() + 3 * 60_000);
    // Protocol 10 (ledger audit A1): the match carries no seed; starting the raid returns the server's
    // battle seed (a 32-bit integer), the same one on a retry, and the server re-simulates with it.
    expect(m.seed).toBeUndefined();
    const { seed } = await a.startAttack!(m.ticket);
    expect(Number.isInteger(seed) && seed! >= 0 && seed! < 2 ** 32).toBe(true);
    expect((await a.startAttack!(m.ticket)).seed).toBe(seed);
    // A report played with any other seed is refused, and does not use the ticket up.
    expect(await errorOf(a.submitAttack({ ticket: m.ticket, seed: (seed! + 1) >>> 0, ...rush(25) }))).toMatchObject({ status: 400, code: 'bad_request' });
    const sub = { ticket: m.ticket, seed: seed!, ...rush(25) };
    const r = await a.submitAttack(sub);
    const local = runBattle({ seed: sub.seed, base: m.base, army: sub.army, infiltration: true }, sub.deployments, data).result;
    expect(r.result.hash).toBe(local.hash); // same deterministic battle on both sides
    expect(r.result.stars).toBe(local.stars);
    expect((await a.me()).trophies).toBe(r.playerTrophies);
    // Retrying a report returns the first answer (protocol 6), never a second settlement.
    expect(await a.submitAttack(sub)).toEqual(r);
    expect((await a.me()).trophies).toBe(r.playerTrophies);
  });

  it('pvp: refuses foreign tickets, oversized armies and troop levels above the hall cap', async () => {
    const a = await player('Ann');
    const b = await player('Ben');
    const m = (await a.match())!;
    expect(await errorOf(b.startAttack!(m.ticket))).toMatchObject({ status: 404, code: 'not_found' });
    const seed = (await a.startAttack!(m.ticket)).seed!;
    expect(await errorOf(b.submitAttack({ ticket: m.ticket, seed, army: {}, deployments: [] }))).toMatchObject({ status: 404, code: 'not_found' });
    expect(await errorOf(a.submitAttack({ ticket: m.ticket, seed, army: { beetle_brute: 999 }, deployments: [] }))).toMatchObject({ status: 400, code: 'bad_request' });
    expect(await errorOf(a.submitAttack({ ticket: m.ticket, seed, army: { hedgehog_roller: 5 }, levels: { hedgehog_roller: 5 }, deployments: [] }))).toMatchObject({ status: 400, code: 'bad_request' });
    const { defenses } = await a.defenses(0);
    expect(Array.isArray(defenses)).toBe(true);
    const lb = await a.leaderboard(5);
    expect(lb.players.length).toBeLessThanOrEqual(5);
    for (const p of lb.players) expect(p).toEqual(expect.objectContaining({ rank: expect.any(Number), name: expect.any(String), trophies: expect.any(Number), hallLevel: expect.any(Number) }));
  });

  it('pvp: all fifty warriors reproduce the same result over HTTP', async () => {
    const a = await player('Full roster', 15);
    const m = (await a.match())!;
    const army = Object.fromEntries(Object.keys(data.troops).map((id) => [id, 1]));
    const levels = Object.fromEntries(Object.keys(army).map((id) => [id, 1]));
    // The server applies Infiltration Points: deploy through the base's points, a squad per point.
    const setup = { seed: (await a.startAttack!(m.ticket)).seed!, base: m.base, army, levels, infiltration: true };
    const probe = createBattle(setup, data);
    const deployments = botDeployments(probe.deployable, probe.grid.size, army, createRng(5), data, levels, probe.entry);
    // One warrior dropped on open ground outside every point is refused by the server, as in the game.
    const n = probe.grid.size;
    let open = -1;
    for (let i = 0; i < n * n && open < 0; i++) if (probe.deployable[i] && pointAt(probe.entry!, i % n, Math.floor(i / n)) < 0) open = i;
    expect(open).toBeGreaterThanOrEqual(0);
    const offPoint = { tick: 0, troop: 'hedgehog_roller', x: open % n, y: Math.floor(open / n) };
    const sub = { ticket: m.ticket, seed: setup.seed, army, levels, deployments: [offPoint, ...deployments] };
    const server = await a.submitAttack(sub);
    const local = runBattle(setup, sub.deployments, data).result;
    expect(server.result).toEqual(local);
    expect(Object.keys(server.result.used)).toHaveLength(50);
    expect(server.result.used.hedgehog_roller).toBe(1);
  });

  it('groves: found, find, join, chat (filtered), request and donate troops, inbox, leave', async () => {
    const lead = await player('Leader', 3);
    const mate = await player('Mate', 3);
    expect(await lead.myGrove()).toBeNull();
    const g = await lead.createGrove(`Contract ${tag}`);
    expect(g.you.role).toBe('Leader');
    expect(await errorOf(lead.createGrove('Twice'))).toMatchObject({ status: 409, code: 'already_in_grove' });
    expect((await mate.listGroves(tag)).groves.map((x) => x.id)).toContain(g.id);
    const joined = await mate.joinGrove(g.id);
    expect(joined.members.map((m) => m.id).sort()).toEqual([lead.id, mate.id].sort());
    const start = await lead.chat();
    const msg = await mate.postChat('hello you stupid idiot');
    expect(msg.text).not.toMatch(/stupid|idiot/);
    const after = await lead.chat(start.cursor);
    expect(after.messages.map((m) => m.id)).toContain(msg.id);
    const req = await lead.requestTroops(10);
    expect(req.size).toBeGreaterThan(0);
    expect(await errorOf(lead.requestTroops(10))).toMatchObject({ status: 429, code: 'cooldown' });
    const seen = await mate.requests();
    expect(seen.requests.find((r) => r.id === req.id)).toMatchObject({ mine: false, filled: 0 });
    const don = await mate.donate(req.id, { troop: 'hedgehog_roller', count: 2, level: 1 });
    expect(don.request.filled).toBe(2);
    expect(don.xp).toBeGreaterThan(0);
    const inbox = await lead.inbox();
    expect(inbox.donations).toEqual([expect.objectContaining({ troop: 'hedgehog_roller', count: 2, level: 1 })]);
    await lead.ackInbox(inbox.donations.map((d) => d.id));
    expect((await lead.inbox()).donations).toHaveLength(0);
    await mate.leaveGrove();
    expect(await mate.myGrove()).toBeNull();
    expect(await errorOf(mate.chat())).toMatchObject({ status: 404, code: 'not_in_grove' });
  });

  it('grove raid: the weekly schedule, attack rules and claims', async () => {
    const lead = await player('Raider', 2);
    await lead.createGrove(`Contract Raid ${tag}`);
    const v = await lead.raid();
    expect(['upcoming', 'live', 'ended']).toContain(v.phase);
    expect(v.end - v.start).toBe(data.social.groveRaid.durationHours * 3_600_000);
    expect(v.nextStart).toBeGreaterThan(Date.now() - 1000);
    expect(Array.isArray(v.chests)).toBe(true);
    // Founded just now, so not part of a raid that already started.
    expect(await errorOf(lead.claimRaid(v.week + 1))).toMatchObject({ status: 409, code: 'raid_not_ended' });
    if (v.phase === 'live') {
      expect(v.eligible).toBe(false);
      expect(await errorOf(lead.raidTicket(0))).toMatchObject({ code: 'no_attacks_left' });
    } else {
      expect(await errorOf(lead.raidTicket(0))).toMatchObject({ status: 409, code: 'raid_not_live' });
    }
  });

  it('account deletion: DELETE /v1/me deletes the player and its token stops working; web requests are accepted', async () => {
    const tokens = memoryTokenStore();
    const c = new HttpServerAdapter(url, { tokens, retryDelayMs: 200 });
    await c.register(`Contract Leaving ${tag}`);
    await c.uploadBase({ base: generateOpponent(7, 1, data) });
    const saved = tokens.get();
    await c.deleteAccount();
    expect(c.hasIdentity()).toBe(false);
    const again = new HttpServerAdapter(url, { tokens: memoryTokenStore(saved), retryDelayMs: 200 });
    expect(await errorOf(again.me())).toMatchObject({ status: 401, code: 'unauthorized' });
    expect((await client().hello()).features).toContain('account-deletion');
    const res = await fetch(`${url}${Routes.deletionRequests}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: `Contract Nobody ${tag}`, note: 'contract test' }) });
    expect(res.status).toBe(202);
    expect((await res.json()).id).toBeTruthy();
    const page = await fetch(`${url}${Routes.deletionPage}`);
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toMatch(/text\/html/);
  });

  it('reports and blocks: report a chat message, block and unblock its author', async () => {
    const lead = await player('Moderated', 2);
    const mate = await player('Reporter', 2);
    expect((await lead.hello()).features).toEqual(expect.arrayContaining(['reports', 'blocks']));
    const g = await lead.createGrove(`Contract Mod ${tag}`);
    await mate.joinGrove(g.id);
    const msg = await lead.postChat('a message to report');
    expect(await errorOf(mate.report({ kind: 'chat', messageId: msg.id, reason: 'bogus' as never }))).toMatchObject({ status: 400, code: 'bad_request' });
    const r = await mate.report({ kind: 'chat', messageId: msg.id, reason: 'spam', note: 'contract test' });
    expect(r).toMatchObject({ alreadyReported: false, blocked: false });
    expect(r.id).toBeTruthy();
    expect((await mate.report({ kind: 'chat', messageId: msg.id, reason: 'spam' })).alreadyReported).toBe(true);
    await mate.block(lead.id);
    expect((await mate.blocks()).blocked.map((b) => b.id)).toEqual([lead.id]);
    const after = await mate.chat();
    expect(after.messages.some((m) => m.from?.id === lead.id)).toBe(false);
    expect(Array.isArray(after.hidden)).toBe(true);
    await mate.unblock(lead.id);
    expect((await mate.blocks()).blocked).toEqual([]);
    expect(await errorOf(mate.block(mate.id))).toMatchObject({ status: 400, code: 'bad_request' });
    await mate.leaveGrove();
    await lead.leaveGrove();
  });

  it('protocol 7: old games are told to update; a repeated Idempotency-Key gets the first answer', async () => {
    const tokens = memoryTokenStore();
    const c = new HttpServerAdapter(url, { tokens, retryDelayMs: 200 });
    await c.register(`Contract Idem ${tag}`);
    const auth = { authorization: `Bearer ${tokens.get()}`, 'content-type': 'application/json' };
    const old = await fetch(`${url}${Routes.me}`, { headers: { ...auth, 'x-protocol': '6' } });
    expect(old.status).toBe(426);
    expect((await old.json()).error).toBe('version_mismatch');
    const put = (name: string) => fetch(`${url}${Routes.me}`, { method: 'PUT', headers: { ...auth, 'x-protocol': '7', 'idempotency-key': `contract-${tag}` }, body: JSON.stringify({ name }) });
    const first = await (await put(`Contract One ${tag}`)).json();
    const second = await (await put(`Contract Two ${tag}`)).json();
    expect(second).toEqual(first);
  });

  it('purchases and push: a store the server does not check is refused before paying; forged receipts are refused; push tokens are checked', async () => {
    const hello = await client().hello();
    const p = await player('Buyer');
    for (const store of ['apple', 'google'] as const) {
      if (hello.features.includes(`purchases-${store}`)) {
        const intent = await p.purchaseIntent({ store, productId: data.store.packs[0].id, under18: false });
        expect(intent.accountToken).toMatch(/^[0-9a-f-]{36}$/);
        expect(await errorOf(p.redeem({ store, storeProductId: intent.storeProductId, receipt: 'forged.receipt.value' }))).toMatchObject({ code: 'bad_request' });
      } else {
        expect(await errorOf(p.purchaseIntent({ store, productId: data.store.packs[0].id, under18: false }))).toMatchObject({ status: 403, code: 'purchase_refused' });
      }
    }
    expect((await p.purchaseHistory()).purchases).toEqual([]);
    expect(await errorOf(p.putPushToken({ token: 'x', platform: 'ios', types: [], tzOffsetMinutes: 0 }))).toMatchObject({ code: 'bad_request' });
    await p.putPushToken({ token: `contract${tag}`.padEnd(64, '0'), platform: 'ios', types: ['raided'], tzOffsetMinutes: 0 });
    await p.deletePushToken(`contract${tag}`.padEnd(64, '0'));
    // Store notifications refuse unsigned payloads (404 where the store is not set up).
    const forged = await fetch(`${url}${Routes.appleNotifications}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ signedPayload: 'a.b.c' }) });
    expect([400, 404]).toContain(forged.status);
  });
});
