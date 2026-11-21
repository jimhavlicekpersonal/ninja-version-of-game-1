/**
 * Beast Mode 2026-11-21 SEC-01 (BLOCKER, earlier S-1): villages kept on the device were fully trusted in ranked play.
 * With REQUIRE_SERVER_VILLAGE on, ranked routes need a village the server holds and both boards list only those;
 * with it off, base uploads follow the import's account-age rule and device rerolls are budgeted.
 */
import { describe, expect, it } from 'vitest';
import { HOUR } from '../../../server/core/context';
import { importMinAccountDays } from '../../../server/core/villageImport';
import { baseAt, world } from './harness';

const on = () => world({ shared: { policy: { requireServerVillage: true } } as never });

describe('SEC-01: REQUIRE_SERVER_VILLAGE on', () => {
  it('a device-held player gets 404 no_village from match, attack start, upload, war ticket, raid ticket and troop requests', async () => {
    const w = on();
    const dev = await w.player('Dev');
    const want = { code: 'no_village' };
    await expect(dev.uploadBase({ base: baseAt(2) })).rejects.toMatchObject(want);
    await expect(dev.match()).rejects.toMatchObject(want);
    await expect(dev.startAttack!('x')).rejects.toMatchObject(want);
    await expect(dev.raidTicket(0)).rejects.toMatchObject(want);
    await expect(dev.gangWarTicket({ warId: 'x', target: 'x' } as never)).rejects.toMatchObject(want);
    await expect(dev.requestTroops(5)).rejects.toMatchObject(want);
  });

  it('a server-held player plays on', async () => {
    const w = on();
    const held = await w.player('Held');
    await held.startVillage();
    await expect(held.match()).rejects.toMatchObject({ code: 'conflict' }); // scout first: the normal rule, not no_village
  });

  it('both boards list only server-held players', async () => {
    const w = world();
    const dev = await w.player('Dev', baseAt(2));
    const held = await w.player('Held');
    await held.startVillage();
    await w.repo.updatePlayer(dev.id, { trophies: 900 });
    await w.repo.updatePlayer(held.id, { trophies: 100 });
    // Off: both are listed.
    expect((await w.repo.topPlayers(10)).map((p) => p.id).sort()).toEqual([dev.id, held.id].sort());
    expect((await w.repo.topPlayers(10, { heldOnly: true })).map((p) => p.id)).toEqual([held.id]);
    expect(await w.repo.rankOf(100, { heldOnly: true })).toBe(1);
    expect((await w.repo.rankedPlayers({ heldOnly: true })).map((p) => p.id)).toEqual([held.id]);
    const w2 = on();
    const viewer = await w2.player('Viewer');
    await viewer.startVillage();
    const other = await w2.player('Other');
    await w2.repo.updatePlayer(other.id, { base: baseAt(2), trophies: 500 });
    const board = await viewer.leaderboard(10);
    expect(board.players).toHaveLength(1);
    expect(board.players[0].name).toBe((await w2.repo.getPlayer(viewer.id))!.name);
  });
});

describe('SEC-01 interim (policy off)', () => {
  it('a 1-day-old account cannot upload a Keep 15 base; an old enough one can', async () => {
    const w = world();
    const p = await w.player('New');
    w.advance(24 * HOUR);
    await expect(p.uploadBase({ base: baseAt(15) })).rejects.toMatchObject({ code: 'cooldown' });
    w.advance(importMinAccountDays(15) * 24 * HOUR);
    await expect(p.uploadBase({ base: baseAt(15) })).resolves.toBeUndefined();
  });

  it('after the first upload the Keep rises by one level per upload', async () => {
    const w = world();
    const p = await w.player('Riser', baseAt(2));
    w.advance(400 * 24 * HOUR);
    await expect(p.uploadBase({ base: baseAt(4) })).rejects.toMatchObject({ code: 'bad_request' });
    await expect(p.uploadBase({ base: baseAt(3) })).resolves.toBeUndefined();
  });

  it('a device player cannot draw more than the reroll budget of new opponents without a pause', async () => {
    const w = world();
    const p = await w.player('Roller', baseAt(3));
    for (let i = 0; i < 4; i++) await w.player(`D${i}`, baseAt(3, 30 + i));
    w.pastShields();
    let refused = 0;
    for (let i = 0; i < 20; i++) {
      try {
        await p.match();
      } catch (e) {
        if ((e as { code?: string }).code === 'rate_limited') refused++;
        else throw e;
      }
    }
    expect(refused).toBe(8);
    w.advance(11 * 60_000);
    await expect(p.match()).resolves.toBeTruthy();
  });
});
