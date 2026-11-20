/**
 * Security audit 2026-11-20 (docs/store/WORLDWIDE_AUDIT.md "2026-11-20 security audit"): raids, wars and battle
 * reports. Each test reproduces a finding against the code before the fix.
 *
 * S1: three refused reports burned a ticket, which gave a Gang War attack back and dodged a raid's forfeit.
 * S2: a raid reported without /attacks/start was accepted (ledger audit A1 regressed), and voiding a server-held
 *     village's scout ticket drew a new opponent for the same free scout (E15).
 * D1: a shared replay re-simulated almost any battle the request described (20 to 43 s of CPU each, uncounted).
 * D3: a body nested too deep to serialise was a server error on the shared-replay route.
 * D4: a troop id such as `constructor`, or a deployment that is not one, made the battle throw (a 500).
 */
import { expect, it, describe } from 'vitest';
import { REPORT_GRACE_MS } from '../../../server/core/pvp';
import { createBattle, runBattle, SIM_RULES } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { emulator, placeType } from './economyHarness';
import { baseAt, HOUR, startSeed, world } from './harness';

const MIN = 60_000;
const code = (p: Promise<unknown>) => p.then(() => 'ok', (e) => (e as { code?: string }).code ?? 'error');
const BAD = (ticket: string) => ({ ticket, army: { hedgehog_roller: 1 }, deployments: [null] }) as never;

async function trainedAnn(w: ReturnType<typeof world>) {
  const ann = await w.player('Ann');
  const game = emulator((await ann.startVillage()).file, w.data);
  placeType(game, w.data, 'burrow_barracks', w.now());
  placeType(game, w.data, 'army_camp', w.now());
  w.advance(60_000);
  expect(game.do({ type: 'train', troop: 'hedgehog_roller', count: 10 }, w.now())).toMatchObject({ ok: true });
  expect((await ann.sendCommands(game.batch())).corrections).toBeUndefined();
  return { ann, game };
}

describe('security audit 2026-11-20: raid commitment (S2)', () => {
  it('voiding a scout ticket and matching again shows the same base (no free rerolls)', async () => {
    const w = world();
    const { ann, game } = await trainedAnn(w);
    for (let i = 0; i < 4; i++) await w.player(`Def${i}`, baseAt(1, 20 + i));
    w.pastShields();
    expect(game.do({ type: 'scout', paid: false }, w.now())).toMatchObject({ ok: true });
    await ann.sendCommands(game.batch());
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const m = (await ann.match())!;
      seen.add(m.ticket);
      await ann.voidAttack(m.ticket);
    }
    expect(seen.size).toBe(1);
  });

  it('a raid reported without being started is refused', async () => {
    const w = world();
    const { ann, game } = await trainedAnn(w);
    await w.player('Dot', baseAt(1, 77, 3000));
    w.pastShields();
    expect(game.do({ type: 'scout', paid: false }, w.now())).toMatchObject({ ok: true });
    await ann.sendCommands(game.batch());
    const m = (await ann.match())!;
    const pts = createBattle({ seed: 0, base: m.base, army: { hedgehog_roller: 10 }, infiltration: true }, data).entry!.points;
    const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: Math.floor(pts[i % pts.length].x), y: Math.floor(pts[i % pts.length].y) }));
    expect(await code(ann.submitAttack({ ticket: m.ticket, army: { hedgehog_roller: 10 }, deployments } as never))).toBe('conflict');
    expect((await w.repo.getTicket(m.ticket))!.used).toBe(false);
  });
});

describe('security audit 2026-11-20: refused reports never give an attack back (S1)', () => {
  it('Gang War: a ticket refused three times still uses its attack', async () => {
    const w = world();
    const names = ['Ann Swift', 'Bo Quietstep', 'Cy Ironpine', 'Dee Swiftwind'];
    const gangs: Awaited<ReturnType<typeof w.player>>[][] = [];
    let n = 0;
    for (let g = 0; g < 2; g++) {
      const members = [await w.player(names[n], baseAt(3, 10 + n++)), await w.player(names[n], baseAt(3, 10 + n++))];
      const [lead, m] = members;
      await lead.createSquad(`Gang Number ${g + 1}`);
      await lead.sendFriendRequest({ playerId: m.id });
      await m.sendFriendRequest({ playerId: lead.id });
      await lead.squadInvite(m.id);
      await m.answerSquadInvite((await m.squad()).invites[0].id, true);
      gangs.push(members);
    }
    const [[ann], [cy]] = gangs;
    await ann.gangWarQueue();
    await cy.gangWarQueue();
    w.advance(data.social.gangWar.prepHours * HOUR + MIN);
    let issued = 0;
    for (let round = 0; round < 4; round++) {
      const t = await ann.gangWarTicket({ target: 0 }).catch(() => null);
      if (!t) break;
      issued++;
      for (let i = 0; i < 4; i++) await code(ann.gangWarAttack(BAD(t.ticket)));
    }
    expect(issued).toBe(data.social.gangWar.attacksPerMember);
  });

  it('a started raid refused three times is settled as a lost raid', async () => {
    const w = world();
    const a = await w.player('Ann', baseAt(2, 5));
    await w.player('Dot', baseAt(2, 77, 3000));
    w.pastShields();
    await w.repo.updatePlayer(a.id, { trophies: 400 });
    const m = (await a.match())!;
    await startSeed(a, m.ticket);
    for (let i = 0; i < 3; i++) await code(a.submitAttack(BAD(m.ticket)));
    w.advance(REPORT_GRACE_MS + MIN);
    await a.match();
    expect((await w.repo.getPlayer(a.id))!.trophies).toBeLessThan(400);
    expect(((await w.repo.getTicket(m.ticket))!.response as { forfeit?: boolean }).forfeit).toBe(true);
  });

  it('a malformed deployment is a refused report (400), not a server error', async () => {
    const w = world();
    const a = await w.player('Ann', baseAt(2, 5));
    await w.player('Dot', baseAt(2, 77, 3000));
    w.pastShields();
    const m = (await a.match())!;
    await startSeed(a, m.ticket);
    await expect(a.submitAttack(BAD(m.ticket))).rejects.toMatchObject({ status: 400 });
  });
});

describe('security audit 2026-11-20: prototype ids in a battle (D4)', () => {
  it('a troop id such as constructor deploys nothing and the battle ends normally', () => {
    const base = generateOpponent(3, 5, data);
    for (const t of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const { result } = runBattle({ seed: 1, base, army: { hedgehog_roller: 5 }, infiltration: true }, [{ tick: 0, troop: t, x: 0, y: 0 }], data);
      expect(result.stars).toBe(0);
    }
  });
});

describe('security audit 2026-11-20: shared replays are battles the game could play (D1, D3)', () => {
  const honest = () => {
    const base = generateOpponent(7, 2, data);
    const deployments = Array.from({ length: 10 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 1 + i }));
    return { setup: { seed: 1234, base, army: { hedgehog_roller: 10 }, infiltration: true }, deployments, rules: SIM_RULES };
  };
  const refused = (p: Promise<unknown>) => p.then(() => 'shared', (e) => (e as { key?: string; code?: string }).code ?? 'error');

  it('an honest share still works; a packed base or an army past the top Keep is refused before any battle', async () => {
    const w = world();
    const me = (await w.repo.getPlayer((await w.player('Ayla')).id))!;
    expect(await refused(w.core.growth.shareReplay(me, honest()))).toBe('shared');
    const packed = honest();
    const keep = packed.setup.base.buildings.find((b) => data.buildings[b.type].category === 'hall')!;
    const tower = packed.setup.base.buildings.find((b) => data.buildings[b.type].category === 'defense')!;
    packed.setup.base = { ...packed.setup.base, buildings: [keep, ...Array.from({ length: 300 }, (_, i) => ({ ...tower, id: `t${i}`, level: data.buildings[tower.type].levels.length, x: i % 40, y: Math.floor(i / 40) + 20 }))] };
    expect(await refused(w.core.growth.shareReplay(me, packed))).toBe('bad_request');
    const horde = honest();
    horde.setup.army = { hedgehog_roller: 2000 };
    expect(await refused(w.core.growth.shareReplay(me, horde))).toBe('bad_request');
  });

  it('every generated fortress is a base the check accepts (Trials, rival outposts)', async () => {
    const w = world();
    const me = (await w.repo.getPlayer((await w.player('Ayla')).id))!;
    for (const keep of [1, 8, 15]) {
      const r = honest();
      r.setup.base = generateOpponent(keep, keep * 13, data);
      expect(await refused(w.core.growth.shareReplay(me, r)), `keep ${keep}`).toBe('shared');
    }
  });

  it('a body nested too deep to serialise is a bad request', async () => {
    const w = world();
    const me = (await w.repo.getPlayer((await w.player('Ayla')).id))!;
    let deep: unknown = [];
    for (let i = 0; i < 20_000; i++) deep = [deep];
    const r = honest();
    expect(await refused(w.core.growth.shareReplay(me, { ...r, setup: { ...r.setup, base: { ...r.setup.base, buildings: [deep] } } } as never))).toBe('bad_request');
  });
});

describe('security audit 2026-11-20: Alliances (S3, S4)', () => {
  it('S3: a donor the server keeps gives warriors at most at its own research level', async () => {
    const w = world();
    const don = await w.player('Donna');
    const game = emulator((await don.startVillage()).file, w.data);
    const keep = game.state.buildings.find((b) => w.data.buildings[b.type].category === 'hall')!;
    expect(game.do({ type: 'upgrade', id: keep.id }, w.now())).toMatchObject({ ok: true });
    w.advance(61_000);
    placeType(game, w.data, 'burrow_barracks', w.now());
    placeType(game, w.data, 'army_camp', w.now());
    w.advance(60_000);
    expect(game.do({ type: 'train', troop: 'hedgehog_roller', count: 5 }, w.now())).toMatchObject({ ok: true });
    expect((await don.sendCommands(game.batch())).corrections).toBeUndefined();
    w.advance(10 * 60_000);
    await don.uploadBase({ base: baseAt(2) });
    const rec = await w.player('Rex', baseAt(3));
    const g = await rec.createGrove('Moss Den');
    await don.joinGrove(g.id);
    const req = await rec.requestTroops(10);
    expect(await code(don.donate(req.id, { troop: 'hedgehog_roller', count: 2, level: 2 }))).toBe('bad_request');
    expect(await code(don.donate(req.id, { troop: 'hedgehog_roller', count: 2, level: 1 }))).toBe('ok');
  });

  it('S4: a member who hides being online shows no last-seen time in the Alliance list', async () => {
    const w = world();
    const teen = await w.player('Tara', baseAt(3));
    await w.core.stateAge((await w.repo.getPlayer(teen.id))!, { band: '13to17' });
    const g = await teen.createGrove('Quiet Pines');
    const stranger = await w.player('Sly', baseAt(3, 9));
    const view = await stranger.joinGrove(g.id);
    const row = view.members.find((m) => m.id === teen.id)!;
    expect(row.lastSeenAt).toBeUndefined();
    expect(view.members.find((m) => m.id === stranger.id)!.lastSeenAt).toBeTypeOf('number');
  });
});

describe('security audit 2026-11-20: a private base stays out of shared replays (S7)', () => {
  it('a raid on a 13-17 player cannot be shared under another seed', async () => {
    const w = world();
    const ann = await w.player('Ann', baseAt(2, 5));
    await w.core.stateAge((await w.repo.getPlayer(ann.id))!, { band: 'adult' });
    const teen = await w.player('Teen', baseAt(2, 77, 3000));
    await w.core.stateAge((await w.repo.getPlayer(teen.id))!, { band: '13to17' });
    w.pastShields();
    const m = (await ann.match())!;
    const seed = await startSeed(ann, m.ticket);
    const army = { hedgehog_roller: 20 };
    const pts = createBattle({ seed, base: m.base, army, infiltration: true }, data).entry!.points;
    const deployments = Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: Math.floor(pts[i % pts.length].x), y: Math.floor(pts[i % pts.length].y) }));
    await ann.submitAttack({ ticket: m.ticket, seed, army, deployments } as never);
    const me = (await w.repo.getPlayer(ann.id))!;
    const body = (s: number) => ({ setup: { seed: s, base: m.base, army, infiltration: true }, deployments, rules: SIM_RULES, opponent: 'player' as const, showName: true });
    for (const s of [seed, seed + 1]) {
      await expect(w.core.growth.shareReplay(me, body(s) as never)).rejects.toMatchObject({ code: 'conflict' });
    }
  });
});
