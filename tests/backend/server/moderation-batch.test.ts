/**
 * Backend batch 2026-11-13: the server's own contact/link enforcement (C25, UK OSA), staff renames of an
 * offending name, complaints (EU DSA art. 16 / UK OSA), friend requests from duel partners (A14), sandbox
 * evidence beyond the flag and the staff release of held imports (GLOBAL-002).
 */
import { describe, expect, it } from 'vitest';
import { CONTACT_REMOVED, enforceChat, foldForContact, serverHasContact } from '../../../server/core/contactFilter';
import { sandboxEvidence } from '../../../server/core/villageImport';
import { Routes } from '../../../src/backend/net/protocol';
import { createNewVillage } from '../../../src/gameplay/sim/village';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { MemoryRepo } from '../../../server/repo';
import { world } from './harness';
import { setup } from './httpHarness';

const STAFF = 'staff-token-0123456789-abcdefgh';
const refusal = async (p: Promise<unknown>) => p.then(() => null, (e: { status: number; code: string }) => e);

describe('C25 / UK OSA: contacts written around the shared filter', () => {
  const dodges = [
    'add me on ｄｉｓｃｏｒｄ', // full-width
    'dіscord kage', // Cyrillic і
    'dis​cord me', // zero-width space
    'find me at kage dot com',
    'kage (dot) gg',
    'mail kage (at) example (dot) com',
    'join t.me/kagemura',
    'wa . me/123',
    'my skype is kage',
    'paypal me 5 dollars',
    'call nine eight seven six five four three two',
    'hxxps://evil.example',
  ];
  it('the server finds every one; ordinary chat passes', () => {
    for (const d of dodges) expect(serverHasContact(d), d).toBe(true);
    for (const ok of ['attack the left wall first', 'I have 500000 coins', 'good game, see you tomorrow', 'line up the archers', 'signal the attack', "don't. me neither", 'que tal amigo']) expect(enforceChat(ok), ok).toEqual({ text: ok, removed: false });
    expect(foldForContact('ＤＩＳＣＯＲＤ')).toBe('discord');
  });

  it('a chat message carrying one is replaced; a name carrying one is refused', async () => {
    const w = world();
    const ann = await w.player('Ann Swift');
    const g = await ann.createGrove('Hidden Leaf');
    void g;
    const posted = await ann.postChat('join t.me/kagemura for free jade');
    expect(posted.text).toBe(CONTACT_REMOVED);
    expect((await ann.postChat('attack at dawn')).text).toBe('attack at dawn');
    expect(await refusal(ann.rename('kage dot com'))).toMatchObject({ status: 400 });
    expect(await refusal(ann.rename('ＤＩＳＣＯＲＤ Kage'))).toMatchObject({ status: 400 });
    expect(await refusal(ann.createSquad('skype kage'))).toMatchObject({ status: 400 });
  });
});

describe('staff replace an offending name', () => {
  it('renames, holds the old name, gives a free rename, tells the player and logs it', async () => {
    const s = setup({ adminTokens: { mod: STAFF } });
    const a = await s.register('Rude Name');
    const r = await s.call('POST', `/admin/v1/players/${a.playerId}/rename`, STAFF, { reason: 'Insulting name' });
    expect(r.status).toBe(200);
    expect(r.body.player.name).not.toBe('Rude Name');
    expect((await s.call('POST', `/admin/v1/players/${a.playerId}/rename`, STAFF, {})).status).toBe(400); // a reason is required
    const p = (await s.repo.getPlayer(a.playerId))!;
    expect(p.freeRenames).toBe(1);
    // Nobody can take the old name at once.
    const b = await s.register('Rude Name');
    expect((await s.repo.getPlayer(b.playerId))!.name).not.toBe('Rude Name');
    expect((await s.repo.staffActions(a.playerId, 10)).some((x) => x.action === 'rename' && x.actor === 'mod')).toBe(true);
    expect((await s.call('GET', Routes.notices, a.token)).body.notices[0].text).toMatch(/changed by a moderator/);
    // A chosen replacement must pass the name rules.
    expect((await s.call('POST', `/admin/v1/players/${a.playerId}/rename`, STAFF, { name: 'kage dot com', reason: 'x' })).status).toBe(400);
    expect((await s.call('POST', `/admin/v1/players/${a.playerId}/rename`, STAFF, { name: 'Calm Fox', reason: 'x' })).body.player.name).toBe('Calm Fox');
  });
});

describe('complaints about illegal or harmful content', () => {
  it('anyone can send one; staff see and close it; the form is served', async () => {
    const s = setup({ adminTokens: { mod: STAFF } });
    expect((await s.call('POST', Routes.complaints, undefined, { subject: 'x' })).status).toBe(400);
    const sent = await s.call('POST', Routes.complaints, undefined, { subject: 'Player "Bad Name"', reason: 'The name is a slur against a group.', contact: 'me@example.com' });
    expect(sent.status).toBe(201);
    const queue = await s.call('GET', '/admin/v1/complaints', STAFF);
    expect(queue.body.complaints).toEqual([expect.objectContaining({ id: sent.body.id, status: 'open', contact: 'me@example.com' })]);
    expect((await s.call('POST', `/admin/v1/complaints/${sent.body.id}`, STAFF, { resolution: 'Name replaced, player warned.' })).body.status).toBe('done');
    expect((await s.call('GET', '/admin/v1/complaints', STAFF)).body.complaints).toEqual([]);
    const page = await s.app.inject({ method: 'GET', url: '/complaints' });
    expect(page.statusCode).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.body).toContain('/v1/complaints');
    expect((await s.call('GET', Routes.hello)).body.features).toContain('complaints');
  });

  it('is limited per address and kept a year after it was handled', async () => {
    const s = setup({ rateLimits: { complaint: { limit: 1, windowMs: 3_600_000 } } });
    const body = { subject: 'Something', reason: 'A long enough reason.' };
    expect((await s.call('POST', Routes.complaints, undefined, body)).status).toBe(201);
    expect((await s.call('POST', Routes.complaints, undefined, body)).status).toBe(429);
    const repo = new MemoryRepo();
    const w = world({ repo });
    await w.core.submitComplaint(body);
    const [c] = repo.complaintRows;
    await w.repo.resolveComplaint(c!.id, 'done', w.now());
    w.advance(366 * 24 * 3_600_000);
    await w.core.prune();
    expect(repo.complaintRows).toEqual([]);
  });
});

describe('A14: duel partners may ask to be friends again', () => {
  it('a former friend who dueled can be asked by id, even when hidden', async () => {
    const w = world();
    const [ann, bo] = await Promise.all(['Ann Swift', 'Bo Quietstep'].map((n) => w.player(n)));
    await bo.setPrivacy({ findable: 'nobody' });
    expect(await refusal(ann.sendFriendRequest({ playerId: bo.id }))).toMatchObject({ status: 404 });
    await w.repo.bumpDuelTally(bo.id, ann.id, true, 3, 100);
    expect((await ann.sendFriendRequest({ playerId: bo.id })).status).toBe('sent');
  });
});

describe('GLOBAL-002: sandbox villages and held imports', () => {
  it('sees the sandbox in its test-store purchases even without the flag', () => {
    const s = createNewVillage(Date.UTC(2026, 10, 13), data);
    expect(sandboxEvidence(s)).toBe(false);
    s.purchases.push({ id: 'mock:mock-abc-1', productId: 'moonstones_1', at: 0 } as never);
    expect(sandboxEvidence(s)).toBe(true);
  });

  it('staff release held Jade into the server-held village once, with a note', async () => {
    const s = setup({ adminTokens: { mod: STAFF } });
    const a = await s.register('Ann');
    await s.call('POST', Routes.village, a.token);
    await s.repo.addImportHold({ id: 'hold-1', playerId: a.playerId, at: s.now(), jade: 500, premium: false, purchases: [], status: 'held' });
    const before = (await s.call('GET', `/admin/v1/players/${a.playerId}`, STAFF)).body;
    expect(before.importHolds).toEqual([expect.objectContaining({ id: 'hold-1', status: 'held' })]);
    expect((await s.call('POST', `/admin/v1/players/${a.playerId}/import-holds/hold-1/release`, STAFF, {})).status).toBe(400);
    const r = await s.call('POST', `/admin/v1/players/${a.playerId}/import-holds/hold-1/release`, STAFF, { note: 'Receipt checked by support' });
    expect(r.status).toBe(200);
    expect(r.body.village.resources.moonstones - before.village.resources.moonstones).toBe(500);
    expect(r.body.ledger[0]).toMatchObject({ delta: 500, reason: 'staff:import-release' });
    expect((await s.call('POST', `/admin/v1/players/${a.playerId}/import-holds/hold-1/release`, STAFF, { note: 'again' })).status).toBe(404);
  });
});
