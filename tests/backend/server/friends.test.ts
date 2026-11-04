/**
 * One unique name per player and friends (roadmap steps 59-61): names are
 * refused with suggestions, unique by case and separators, changed once every
 * 28 days and held 35 days for their previous owner; lookup is exact and
 * honours "who can find me"; friend requests by code or name, accept, decline,
 * withdraw, remove; blocking cuts ties; suggestions and Game Center import;
 * names from before step 59 are migrated.
 */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo, type Player } from '../../../server/repo';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { nameKey, nameProblem } from '../../../src/gameplay/sim/social/names';
import { baseAt, HOUR, rush, world } from './harness';
import { repoFactories } from './pg';

const DAY = 24 * HOUR;

describe('name rules (shared with the game)', () => {
  it('allows 3-18 Latin letters, digits and single separators, starting with a letter', () => {
    for (const ok of ['Ann', 'Silent Crane', 'silent_crane', 'Midnight Lotus 27', 'Ryu-9', 'S1lent Crane']) expect(nameProblem(ok, data), ok).toBeNull();
    expect(nameProblem('Al', data)).toBe('length');
    expect(nameProblem('A very long name indeed', data)).toBe('length');
    expect(nameProblem('9Lives', data)).toBe('start');
    expect(nameProblem('Two  Spaces', data)).toBe('separators');
    expect(nameProblem('Ends_', data)).toBe('separators');
    expect(nameProblem('Kōji', data)).toBe('characters');
    // Reserved, including digit look-alikes; staff-like exact names.
    for (const bad of ['Admin', 'adm1n', 'Kag3mura Fan', 'Support Team', 'mod', 'G-M', 'Ruler', 'Moderator 7']) expect(nameProblem(bad, data), bad).toBe('reserved');
    expect(nameKey('SILENT-CRANE')).toBe(nameKey('silent crane'));
    expect(nameKey('S1lent Crane')).not.toBe(nameKey('Silent Crane'));
  });
});

for (const [label, makeRepo] of repoFactories) {
  describe(`names and friends on ${label} storage`, () => {
    it('refuses taken and unfit names with suggestions; one change every 28 days; old names held 35 days', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Silent Crane');
      await expect(w.player('silent_crane')).rejects.toMatchObject({ code: 'name_taken', suggestions: expect.arrayContaining([expect.any(String)]) });
      const bad = await w.player('Admin').catch((e) => e);
      expect(bad).toMatchObject({ code: 'bad_name' });
      for (const s of bad.suggestions) expect(nameProblem(s, data)).toBeNull();
      // Case and separators only: the same name, no cooldown.
      expect((await ann.rename('SILENT-CRANE')).name).toBe('SILENT-CRANE');
      expect((await ann.rename('Quiet Heron')).name).toBe('Quiet Heron');
      await expect(ann.rename('Loud Heron')).rejects.toMatchObject({ code: 'cooldown' });
      // The old name is held for Ann: nobody else can take it…
      const ben = await w.player('Ben');
      await expect(ben.rename('Silent Crane')).rejects.toMatchObject({ code: 'name_taken' });
      // …but Ann can take it back once she may change again.
      w.advance(29 * DAY);
      expect((await ann.rename('Silent Crane')).name).toBe('Silent Crane');
      // After 35 days a released name is free.
      w.advance(29 * DAY);
      await ann.rename('Calm Heron');
      w.advance(36 * DAY);
      expect((await ben.rename('Silent Crane')).name).toBe('Silent Crane');
    });

    it('finds a player only by their exact name, as they allow', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann', baseAt(2));
      const ben = await w.player('Ben');
      const cat = await w.player('Cat');
      expect(await ben.lookup('ANN')).toMatchObject({ name: 'Ann', hallLevel: 2, league: expect.any(String), staff: false, gang: null });
      await expect(ben.lookup('An')).rejects.toMatchObject({ code: 'not_found', message: 'No player with that name.' });
      // Nobody: only friends find her.
      await ann.setPrivacy({ findable: 'nobody' });
      await expect(ben.lookup('Ann')).rejects.toMatchObject({ code: 'not_found' });
      const code = (await ann.friends()).code;
      expect(code).toMatch(/^KAGE-[2-9A-HJKMNP-Z]{6}$/);
      await ben.requestFriend({ code: code.toLowerCase().replace('-', ' ') }); // codes are forgiving
      const req = (await ann.friends()).incoming[0];
      await ann.answerFriendRequest(req.id, true);
      expect((await ben.lookup('Ann')).name).toBe('Ann');
      // Friends of friends: Cat is a friend of Ben, who is Ann's friend.
      await ann.setPrivacy({ findable: 'friends_of_friends' });
      await expect(cat.lookup('Ann')).rejects.toMatchObject({ code: 'not_found' });
      await cat.requestFriend({ name: 'Ben' });
      await ben.answerFriendRequest((await ben.friends()).incoming[0].id, true);
      expect((await cat.lookup('Ann')).name).toBe('Ann');
      // A block either way hides them.
      await ann.block(cat.id);
      await expect(cat.lookup('Ann')).rejects.toMatchObject({ code: 'not_found' });
    });

    it('requests, accepts, declines, withdraws, removes; asking back accepts; blocking cuts ties', async () => {
      const w = world({ repo: await makeRepo() });
      const ann = await w.player('Ann');
      const ben = await w.player('Ben');
      const cat = await w.player('Cat');
      expect(await ann.requestFriend({ name: 'Ben' })).toEqual({ status: 'sent' });
      expect((await ann.friends()).outgoing.map((r) => r.player.name)).toEqual(['Ben']);
      // Ben asks back: friends at once.
      expect(await ben.requestFriend({ name: 'Ann' })).toEqual({ status: 'friends' });
      expect((await ann.friends()).friends.map((f) => f.name)).toEqual(['Ben']);
      await expect(ann.requestFriend({ name: 'Ben' })).rejects.toMatchObject({ code: 'conflict' });
      await expect(ann.requestFriend({ code: (await ann.friends()).code })).rejects.toMatchObject({ code: 'bad_request' });
      // Decline and withdraw.
      await cat.requestFriend({ name: 'Ann' });
      await ann.answerFriendRequest((await ann.friends()).incoming[0].id, false);
      expect((await cat.friends()).outgoing).toEqual([]);
      await cat.requestFriend({ name: 'Ben' });
      await cat.answerFriendRequest((await cat.friends()).outgoing[0].id, false);
      expect((await ben.friends()).incoming).toEqual([]);
      // Friends see "formerly …" and when last online (unless hidden).
      w.advance(29 * DAY);
      await ben.rename('Bennet');
      const seen = (await ann.friends()).friends[0];
      expect(seen).toMatchObject({ name: 'Bennet', formerly: 'Ben', lastSeen: expect.any(Number) });
      await ben.setPrivacy({ hideOnline: true });
      expect((await ann.friends()).friends[0].lastSeen).toBeNull();
      // Remove, then block: no friendship, no requests, and requests "go through" without arriving.
      await ann.removeFriend(ben.id);
      expect((await ann.friends()).friends).toEqual([]);
      await ann.requestFriend({ name: 'Bennet' });
      await ben.block(ann.id);
      expect((await ben.friends()).incoming).toEqual([]);
      expect(await ann.requestFriend({ code: (await ben.friends()).code })).toEqual({ status: 'sent' });
      expect((await ben.friends()).incoming).toEqual([]);
      // Open requests expire after 14 days.
      await cat.requestFriend({ name: 'Ann' });
      w.advance(15 * DAY);
      expect((await ann.friends()).incoming).toEqual([]);
    });

    it('suggests recent opponents and Alliance mates, and Game Center friends who play', async () => {
      const w = world({ repo: await makeRepo() });
      const dot = await w.player('Dot', baseAt(1, 77));
      const ann = await w.player('Ann', baseAt(1));
      const mate = await w.player('Mate');
      const g = await ann.createGrove('Pair');
      await mate.joinGrove(g.id);
      w.pastShields();
      await w.repo.updatePlayer(dot.id, { shieldUntil: 0 });
      const m = (await ann.match())!;
      expect(m.opponent.name).toBe('Dot');
      await ann.submitAttack({ ticket: m.ticket, seed: m.seed, ...rush(5) });
      const s = (await ann.friendSuggestions()).players.map((p) => [p.name, p.reason]);
      expect(s).toEqual(expect.arrayContaining([
        ['Dot', 'opponent'],
        ['Mate', 'alliance'],
      ]));
      await w.repo.addLink({ provider: 'gamecenter', subject: 'G:dot', playerId: dot.id, linkedAt: w.now() });
      expect((await ann.importFriends({ provider: 'gamecenter', ids: ['G:dot', 'G:nobody'] })).players.map((p) => [p.name, p.reason])).toEqual([['Dot', 'gamecenter']]);
      await dot.setPrivacy({ findable: 'nobody' });
      expect((await ann.importFriends({ provider: 'gamecenter', ids: ['G:dot'] })).players).toEqual([]);
    });

    it('migrates names from before step 59: fixes unfit ones, the oldest account keeps a shared name', async () => {
      const repo = await makeRepo();
      const w = world({ repo });
      const t = w.now();
      const raw = (id: string, name: string, at: number): Player => ({ id, name, tokenHash: `h-${id}`, trophies: 0, hallLevel: 1, shieldUntil: 0, base: null, groveId: null, createdAt: at, updatedAt: at, lastSeenAt: at, mutedUntil: 0 });
      await repo.createPlayer(raw('old', 'Kaito', t - 3 * DAY));
      await repo.createPlayer(raw('new', 'kaito', t - DAY));
      await repo.createPlayer(raw('long', 'Kaito Swiftwind of the Hidden Leaf', t - 2 * DAY));
      await repo.createPlayer(raw('ruler', 'Ruler', t));
      expect(await w.core.migrateNames()).toBe(4);
      expect(await w.core.migrateNames()).toBe(0);
      const get = async (id: string) => (await repo.getPlayer(id))!;
      expect((await get('old')).name).toBe('Kaito');
      expect((await get('new')).name).not.toBe('kaito');
      expect((await get('long')).name).toBe('Kaito Swiftwind of');
      expect((await get('ruler')).name).not.toBe('Ruler');
      const all = await Promise.all(['old', 'new', 'long', 'ruler'].map(get));
      expect(new Set(all.map((p) => p.nameKey)).size).toBe(4);
      for (const p of all) {
        expect(nameProblem(p.name, data)).toBeNull();
        expect(p.friendCode).toMatch(/^KAGE-/);
        expect(p.nameChangeFree).toBe(true);
      }
    });
  });
}

describe('names over HTTP', () => {
  it('limits name lookups and serves share links', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, gameUrl: 'https://game.example/play/' });
    const reg = (await app.inject({ method: 'POST', url: Routes.players, payload: { name: 'Ann' } })).json();
    const auth = { authorization: `Bearer ${reg.token}` };
    const codes: number[] = [];
    for (let i = 0; i < 31; i++) codes.push((await app.inject({ method: 'GET', url: `${Routes.lookup}?name=Nobody${i}`, headers: auth })).statusCode);
    expect(codes.slice(0, 30).every((c) => c === 404)).toBe(true);
    expect(codes[30]).toBe(429);
    const page = await app.inject({ method: 'GET', url: Routes.shareLink('kage-abc234') });
    expect(page.statusCode).toBe(200);
    expect(page.body).toContain('KAGE-ABC234');
    expect(page.body).toContain('https://game.example/play/?friend=KAGE-ABC234');
    const taken = await app.inject({ method: 'POST', url: Routes.players, payload: { name: 'ann' } });
    expect(taken.statusCode).toBe(409);
    expect(taken.json()).toMatchObject({ error: 'name_taken', suggestions: expect.any(Array) });
  });
});
