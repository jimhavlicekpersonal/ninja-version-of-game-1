/**
 * Unique names and friends (roadmap step 59), on every storage adapter.
 * Rules: src/backend/net/names.ts; design: docs/backend/PVP_ROADMAP.md 5.2.
 */
import { describe, expect, it } from 'vitest';
import { ServerError } from '../../../src/backend/net/ports';
import { isReservedName, nameKey, nameShapeProblem, normalizeFriendCode } from '../../../src/backend/net/names';
import { nameWidth } from '../../../src/gameplay/sim/social/names';
import { HOUR, world } from './harness';
import { repoFactories } from './pg';

const DAY = 24 * HOUR;

async function refusal(p: Promise<unknown>): Promise<ServerError> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ServerError) return e;
    throw e;
  }
  throw new Error('expected a refusal');
}

describe('name rules (classic-game precedent)', () => {
  it('Unicode display width, starts with a letter, single separators', () => {
    expect(nameShapeProblem('Shadow of the Pine')).toBeNull(); // 18
    expect(nameShapeProblem('A'.repeat(25))).toMatch(/at most 24/);
    expect(nameShapeProblem('Al')).toBeNull();
    expect(nameShapeProblem('影')).toBeNull();
    expect(nameShapeProblem('a')).toMatch(/too short/);
    expect(nameShapeProblem('7Ronin')).toMatch(/starts with a letter/);
    expect(nameShapeProblem('Ronin  Two')).toMatch(/one space/);
    expect(nameShapeProblem('Ronin_')).toMatch(/cannot end/);
    expect(nameShapeProblem('Rōnin')).toBeNull();
    expect(nameShapeProblem('pаypal')).toMatch(/one alphabet/);
  });

  it('case and space/_/- make the same name; digits do not', () => {
    expect(nameKey('Silent Crane')).toBe(nameKey('silent_crane'));
    expect(nameKey('SILENT-CRANE')).toBe(nameKey('Silent Crane'));
    expect(nameKey('S1lent Crane')).not.toBe(nameKey('Silent Crane'));
  });

  it('blocks reserved words and their digit look-alikes, not innocent names', () => {
    for (const n of ['Admin', 'adm1n', 'Kag3mura Fan', 'Mod Bob', 'M0d', 'GM', 'Official Shop', 'Ruler']) expect(isReservedName(n), n).toBe(true);
    for (const n of ['Modest Fox', 'Badger', 'Gemma', 'Silent Crane']) expect(isReservedName(n), n).toBe(false);
  });

  it('friend codes forgive spacing, case and the prefix', () => {
    expect(normalizeFriendCode('kage 7q4m2k')).toBe('KAGE-7Q4M2K');
    expect(normalizeFriendCode('7Q4M-2K')).toBe('KAGE-7Q4M2K');
    expect(normalizeFriendCode('KAGE-7Q4M2')).toBeNull();
    expect(normalizeFriendCode('KAGE-0O1IL2')).toBeNull();
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`unique names on ${label} storage`, () => {
    it('gives a new player the closest free name, never "Ruler"', async () => {
      const w = world({ repo: await makeRepo() });
      const a = await w.player('Silent Crane');
      const b = await w.player('silent_crane');
      const r = await w.player('Ruler');
      const long = await w.player('Silent Crane of the Hidden Mountain');
      expect((await a.me()).name).toBe('Silent Crane');
      const bName = (await b.me()).name;
      expect(nameKey(bName)).not.toBe(nameKey('Silent Crane'));
      expect(bName).toMatch(/^silent_crane \d+$/);
      expect((await r.me()).name).not.toMatch(/ruler/i);
      expect((await long.me()).name).toBe('Silent Crane of the');
    });

    it('preserves Unicode names through uniqueness, suggestions and exact friend lookup', async () => {
      const w = world({ repo: await makeRepo() });
      const full = '影'.repeat(12);
      const a = await w.player(full);
      const b = await w.player(full);
      expect((await a.me()).name).toBe(full);
      const alternate = (await b.me()).name;
      expect(alternate).not.toBe(full);
      expect(alternate).toMatch(/^影+ \d+$/);
      expect(nameWidth(alternate)).toBeLessThanOrEqual(24);
      const accent = await w.player('Cafe\u0301');
      expect((await accent.me()).name).toBe('Café');
      expect((await a.lookupPlayer('Cafe\u0301')).id).toBe(accent.id);
      expect((await b.lookupPlayer(full)).id).toBe(a.id);
      expect((await refusal(b.rename('pаypal'))).code).toBe('bad_request');
    });

    it('renames strictly: taken and reserved names are refused with free suggestions', async () => {
      const w = world({ repo: await makeRepo() });
      await w.player('Iron Lotus');
      const p = await w.player('Kit Fox');
      const taken = await refusal(p.rename('IRON-LOTUS'));
      expect(taken.code).toBe('name_taken');
      const reserved = await refusal(p.rename('Adm1n Kit'));
      expect(reserved.code).toBe('bad_request');
      expect(reserved.message).toMatch(/reserved/);
      expect((await p.rename('Kit the Fox')).name).toBe('Kit the Fox');
    });

    it('one change per 28 days (capitals are free), and the old name is held 35 days for its owner', async () => {
      const w = world({ repo: await makeRepo() });
      const p = await w.player('Ember Ren');
      const other = await w.player('Frost Mei');
      const first = await p.rename('Ember Kaito');
      expect(first.nameChangeAt).toBeGreaterThan(w.now());
      expect((await refusal(p.rename('Ember Sora'))).code).toBe('name_cooldown');
      expect((await p.rename('EMBER KAITO')).name).toBe('EMBER KAITO');
      // Nobody else can take the old name while it is held...
      expect((await refusal(other.rename('Ember Ren'))).code).toBe('name_taken');
      w.advance(29 * DAY);
      // ...but its owner can take it back.
      expect((await p.rename('Ember Ren')).name).toBe('Ember Ren');
      w.advance(29 * DAY);
      expect((await p.rename('Ember Ash')).name).toBe('Ember Ash');
      w.advance(36 * DAY);
      expect((await other.rename('Ember Ren')).name).toBe('Ember Ren');
    });

    it('migrates names from before step 59: the oldest keeps a shared name, all get one free change', async () => {
      const repo = await makeRepo();
      const w = world({ repo });
      const base = { tokenHash: '', trophies: 0, hallLevel: 1, shieldUntil: 0, base: null, groveId: null, updatedAt: 0, lastSeenAt: 0 };
      await repo.createPlayer({ ...base, id: 'old-1', name: 'Pip', createdAt: 1, tokenHash: 'h1' });
      await repo.createPlayer({ ...base, id: 'old-2', name: 'pip', createdAt: 2, tokenHash: 'h2' });
      await repo.createPlayer({ ...base, id: 'old-3', name: 'Ruler', createdAt: 3, tokenHash: 'h3' });
      await repo.createPlayer({ ...base, id: 'old-4', name: 'A very long old name indeed', createdAt: 4, tokenHash: 'h4' });
      expect(await w.core.migrateNames()).toBe(4);
      expect(await w.core.migrateNames()).toBe(0);
      const got = await Promise.all(['old-1', 'old-2', 'old-3', 'old-4'].map((id) => repo.getPlayer(id)));
      expect(got[0]!.name).toBe('Pip');
      expect(got[1]!.name).toMatch(/^pip \d+$/);
      expect(got[2]!.name).not.toMatch(/ruler/i);
      expect(got[3]!.name).toBe('A very long old name');
      expect(new Set(got.map((p) => p!.nameKey)).size).toBe(4);
      expect(got.every((p) => p!.freeRenames === 1)).toBe(true);
    });
  });

  describe(`friends on ${label} storage`, () => {
    async function scene() {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann Swift');
      const bo = await w.player('Bo Quietstep');
      const cy = await w.player('Cy Ironpine');
      return { w, ann, bo, cy };
    }

    it('finds a player by exact name only, and makes friends by request and answer', async () => {
      const { ann, bo } = await scene();
      expect(await ann.lookupPlayer('bo_quietstep')).toMatchObject({ name: 'Bo Quietstep', relation: 'none', keep: 1 });
      expect((await refusal(ann.lookupPlayer('Bo Quiet'))).status).toBe(404);
      const sent = await ann.sendFriendRequest({ name: 'BO QUIETSTEP' });
      expect(sent.status).toBe('sent');
      // Asking twice changes nothing.
      expect((await ann.sendFriendRequest({ name: 'Bo Quietstep' })).request!.id).toBe(sent.request!.id);
      const box = await bo.friends();
      expect(box.incoming).toHaveLength(1);
      expect(box.incoming[0].player).toMatchObject({ name: 'Ann Swift', relation: 'incoming' });
      await bo.answerFriendRequest(box.incoming[0].id, true);
      expect((await ann.friends()).friends.map((f) => f.name)).toEqual(['Bo Quietstep']);
      expect((await bo.friends()).friends[0]).toMatchObject({ name: 'Ann Swift', relation: 'friend' });
    });

    it('asking someone who already asked you makes you friends; decline and cancel clear requests', async () => {
      const { ann, bo, cy } = await scene();
      await ann.sendFriendRequest({ playerId: bo.id });
      expect((await bo.sendFriendRequest({ playerId: ann.id })).status).toBe('friends');
      const r = await cy.sendFriendRequest({ playerId: ann.id });
      await ann.answerFriendRequest((await ann.friends()).incoming[0].id, false);
      expect((await cy.friends()).outgoing).toEqual([]);
      await cy.sendFriendRequest({ playerId: bo.id });
      await cy.cancelFriendRequest((await cy.friends()).outgoing[0].id);
      expect((await bo.friends()).incoming).toEqual([]);
      expect(r.status).toBe('sent');
    });

    it('friend codes find anyone who has not blocked you, whatever their privacy', async () => {
      const { ann, bo } = await scene();
      const code = (await bo.friends()).code;
      await bo.setPrivacy({ findable: 'nobody' });
      expect((await refusal(ann.lookupPlayer('Bo Quietstep'))).status).toBe(404);
      expect((await ann.playerByCode(code.toLowerCase().replace('-', ' '))).name).toBe('Bo Quietstep');
      expect((await ann.sendFriendRequest({ code })).status).toBe('sent');
    });

    it('friends of friends: hidden from strangers, visible through a mutual friend', async () => {
      const { ann, bo, cy } = await scene();
      await cy.setPrivacy({ findable: 'friends_of_friends' });
      expect((await refusal(ann.lookupPlayer('Cy Ironpine'))).status).toBe(404);
      await bo.sendFriendRequest({ playerId: ann.id });
      await ann.sendFriendRequest({ playerId: bo.id });
      // Report section 5 step 7 (A14): an id alone no longer reaches a hidden player; a friend code still does.
      expect((await refusal(bo.sendFriendRequest({ playerId: cy.id }))).status).toBe(404);
      await bo.sendFriendRequest({ code: (await cy.friends()).code });
      await cy.sendFriendRequest({ playerId: bo.id });
      expect((await ann.lookupPlayer('Cy Ironpine')).name).toBe('Cy Ironpine');
    });

    it('a block ends the friendship, its requests, and every way to find each other', async () => {
      const { ann, bo } = await scene();
      await ann.sendFriendRequest({ playerId: bo.id });
      await bo.sendFriendRequest({ playerId: ann.id });
      await bo.block(ann.id);
      expect((await ann.friends()).friends).toEqual([]);
      expect((await refusal(ann.lookupPlayer('Bo Quietstep'))).status).toBe(404);
      expect((await refusal(ann.playerByCode((await bo.friends()).code))).status).toBe(404);
      expect((await refusal(ann.sendFriendRequest({ playerId: bo.id }))).status).toBe(404);
    });

    it('requests lapse after 14 days; online status can be hidden; a renamed friend shows "formerly"', async () => {
      const { w, ann, bo } = await scene();
      await ann.sendFriendRequest({ playerId: bo.id });
      w.advance(15 * DAY);
      expect((await bo.friends()).incoming).toEqual([]);
      await ann.sendFriendRequest({ playerId: bo.id });
      await bo.sendFriendRequest({ playerId: ann.id });
      expect((await ann.friends()).friends[0].lastSeen).toBeGreaterThan(0);
      await bo.setPrivacy({ showOnline: false });
      expect((await ann.friends()).friends[0].lastSeen).toBeUndefined();
      await bo.rename('Bo the Swift');
      expect((await ann.friends()).friends[0]).toMatchObject({ name: 'Bo the Swift', formerly: 'Bo Quietstep' });
    });

    it('deleting an account ends its friendships and frees its name after the hold (report section 5 step 7, A12)', async () => {
      const { w, ann, bo } = await scene();
      await ann.sendFriendRequest({ playerId: bo.id });
      await bo.sendFriendRequest({ playerId: ann.id });
      await bo.deleteAccount();
      expect((await ann.friends()).friends).toEqual([]);
      // Nobody can take the name at once to pose as the deleted player.
      const early = await w.player('Bo Quietstep');
      expect((await early.me()).name).not.toBe('Bo Quietstep');
      w.advance(36 * DAY);
      const again = await w.player('Bo Quietstep');
      expect((await again.me()).name).toBe('Bo Quietstep');
    });
  });
}

for (const [label, makeRepo] of repoFactories) {
  describe(`platform friends (step 61) on ${label} storage`, () => {
    it('shows which Game Center friends play, only to a player who linked Game Center', async () => {
      const repo = await makeRepo();
      const w = world({ repo });
      const me = await w.player('Ann Swift');
      const bo = await w.player('Bo Quietstep');
      const cy = await w.player('Cy Ironpine');
      const dee = await w.player('Dee Swiftwind');
      // Before linking: refused (the ids must be the caller's own friends list).
      expect((await refusal(me.platformFriends({ provider: 'gamecenter', ids: ['T:bo'] }))).status).toBe(403);
      for (const [id, sub] of [[me.id, 'T:me'], [bo.id, 'T:bo'], [cy.id, 'T:cy'], [dee.id, 'T:dee']] as const) await repo.addLink({ provider: 'gamecenter', subject: sub, playerId: id, linkedAt: w.now() });
      await cy.setPrivacy({ findable: 'nobody' });
      await dee.block(me.id);
      const r = await me.platformFriends({ provider: 'gamecenter', ids: ['T:bo', 'T:cy', 'T:dee', 'T:me', 'T:stranger'] });
      expect(r.players.map((p) => p.name)).toEqual(['Bo Quietstep']);
      expect((await refusal(me.platformFriends({ provider: 'nope' as 'gamecenter', ids: [] }))).status).toBe(400);
    });
  });
}
