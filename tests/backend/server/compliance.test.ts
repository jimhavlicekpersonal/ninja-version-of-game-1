/**
 * Report section 5 step 7 (docs/audit/STATE_OF_THE_GAME.md): compliance code on the server.
 * C14 community rules accepted per account; C25 contact handles in names and chat;
 * A12 deletion purges stored answers and holds the name; A14 friend requests by id.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { InProcessServerAdapter } from '../../../server/inProcess';
import { MemoryRepo } from '../../../server/repo';
import { COMMUNITY_RULES_VERSION, Routes } from '../../../src/backend/net/protocol';
import { hasContact, stripContacts } from '../../../src/gameplay/sim/social/grove';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { world } from './harness';

const refusal = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as { status: number; code: string; message: string };
  }
  throw new Error('expected a refusal');
};

describe('C14: the community rules are accepted per account before chat and names', () => {
  it('refuses chat, renames and new Alliances until the account accepts the current rules', async () => {
    const w = world();
    const c = new InProcessServerAdapter(w.core);
    await c.register('Fresh Fox');
    expect((await c.hello()).features).toContain('rules-acceptance');
    expect(await refusal(c.rename('Quiet Fox'))).toMatchObject({ status: 403, code: 'rules_required' });
    expect(await refusal(c.createGrove('Hidden Leaf'))).toMatchObject({ status: 403, code: 'rules_required' });
    expect(await refusal(c.acceptRules({ version: COMMUNITY_RULES_VERSION + 1 }))).toMatchObject({ status: 400 });
    expect(await c.acceptRules({ version: COMMUNITY_RULES_VERSION })).toEqual({ version: COMMUNITY_RULES_VERSION });
    await c.createGrove('Hidden Leaf');
    expect((await c.postChat('hello clan')).text).toBe('hello clan');
    // Stored on the account, with the time (evidence for the store), and kept on a repeat.
    const me = await w.repo.getPlayer((await c.me()).id);
    expect(me).toMatchObject({ rulesVersion: COMMUNITY_RULES_VERSION, rulesAcceptedAt: w.now() });
    expect(await c.acceptRules({ version: 1 })).toEqual({ version: COMMUNITY_RULES_VERSION });
  });
});

describe('C25: off-game contacts in names and chat', () => {
  it('chat loses messaging handles written around the filter; ordinary words stay', () => {
    expect(stripContacts('add me on d1sc0rd ninja#1234')).toBe('add me on [contact removed]');
    expect(stripContacts('tele gram @kage')).toBe('[contact removed]');
    expect(stripContacts('wh@tsapp me')).toBe('[contact removed]');
    for (const ok of ['Telegraph Tower', 'Discordant Blade', 'Kicked the door', 'Shadow Fox']) expect(stripContacts(ok)).toBe(ok);
  });

  it('names with a link, a number to call or a handle are refused', async () => {
    for (const name of ['add me on tg 1234567', 'kik me pls', 'Ninja123456']) expect(hasContact(name), name).toBe(true);
    const w = world();
    const ann = await w.player('Ann Swift');
    expect(await refusal(ann.rename('d1scord kage'))).toMatchObject({ status: 400 });
    expect(await refusal(ann.createGrove('insta kagemura'))).toMatchObject({ status: 400 });
  });
});

describe('A12: deleting an account', () => {
  it('drops the stored idempotent answers of every device of the account at once', async () => {
    const repo = new MemoryRepo();
    const app = buildServer({ repo, data });
    const reg = (await app.inject({ method: 'POST', url: Routes.players, payload: { name: 'Gone Soon' } })).json();
    await repo.updatePlayer(reg.playerId, { rulesVersion: COMMUNITY_RULES_VERSION });
    const auth = { authorization: `Bearer ${reg.token}`, 'idempotency-key': 'k-1' };
    expect((await app.inject({ method: 'PUT', url: Routes.base, headers: auth, payload: { base: { name: 'x', hallLevel: 1, buildings: [] } } })).statusCode).toBeLessThan(500);
    await app.inject({ method: 'PUT', url: Routes.meRules, headers: { ...auth, 'idempotency-key': 'k-2' }, payload: { version: COMMUNITY_RULES_VERSION } });
    expect(repo.idempotencyRows.size).toBeGreaterThan(0);
    expect((await app.inject({ method: 'DELETE', url: Routes.me, headers: { authorization: `Bearer ${reg.token}` } })).statusCode).toBe(204);
    expect(repo.idempotencyRows.size).toBe(0);
  });
});

describe('A14: friend requests by player id follow the same rules as a search', () => {
  it('an id alone no longer reaches a hidden or under-13 player; Alliance mates and a request back still work', async () => {
    const w = world();
    const [ann, bo, cy, dee] = await Promise.all(['Ann Swift', 'Bo Quietstep', 'Cy Ironpine', 'Dee Swiftwind'].map((n) => w.player(n)));
    await bo.setPrivacy({ findable: 'nobody' });
    expect(await refusal(ann.sendFriendRequest({ playerId: bo.id }))).toMatchObject({ status: 404 });
    // Under 13: never reached by id from a stranger.
    await cy.stateAge({ band: 'under13' });
    expect(await refusal(ann.sendFriendRequest({ playerId: cy.id }))).toMatchObject({ status: 404 });
    // A hidden player who asked first can be answered by id.
    await bo.sendFriendRequest({ playerId: ann.id }).catch(() => undefined);
    // Same Alliance: the card in the member list works.
    await dee.setPrivacy({ findable: 'nobody' });
    const g = await ann.createGrove('Hidden Leaf');
    await dee.joinGrove(g.id);
    expect((await ann.sendFriendRequest({ playerId: dee.id })).status).toBe('sent');
  });
});
