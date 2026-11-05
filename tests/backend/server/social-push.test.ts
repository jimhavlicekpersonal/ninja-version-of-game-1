/**
 * Pushes for Friends, Gangs and Gang Wars (roadmap step 68): friend requests,
 * Gang invites, a war found, the battle day, 2 hours left (only to members
 * with attacks left), the relay hand-off and "under attack". Each type is a
 * Settings switch (notifications.json), and the server only pushes the types
 * a device switched on (push.test.ts covers that filter).
 */
import { describe, expect, it } from 'vitest';
import type { PushMessage } from '../../../server/push/push';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, HOUR, world } from './harness';

describe('social pushes (step 68)', () => {
  it('every new type is a switch players can turn off', () => {
    const ids = data.notifications.types.map((t) => t.id);
    expect(ids).toEqual(expect.arrayContaining(['friends', 'gang', 'gangWar']));
  });

  it('friend requests, invites, war found, battle day, 2 hours left, relay hand-off, under attack', async () => {
    const sent: { to: string; m: PushMessage }[] = [];
    const w = world({ shared: { push: { enabled: true, notify: (to, m) => void sent.push({ to, m }) } } });
    const ann = await w.player('Ann Swift', baseAt(3, 1));
    const bo = await w.player('Bo Quietstep', baseAt(3, 2));
    await ann.sendFriendRequest({ playerId: bo.id });
    expect(sent.at(-1)).toMatchObject({ to: bo.id, m: { type: 'friends', title: '⁨Ann Swift⁩ wants to be friends' } });
    await bo.answerFriendRequest((await bo.friends()).incoming[0].id, true);
    expect(sent.at(-1)).toMatchObject({ to: ann.id, m: { type: 'friends' } });
    await ann.createSquad('Pine Gate');
    await ann.squadInvite(bo.id);
    expect(sent.at(-1)).toMatchObject({ to: bo.id, m: { type: 'gang' } });
    await bo.answerSquadInvite((await bo.squad()).invites[0].id, true);
    await ann.gangWarQueue();
    w.advance((data.social.gangWar.botAfterMinutes + 1) * 60_000);
    await ann.gangWar();
    expect(sent.filter((s) => s.m.title === 'Gang War found!').map((s) => s.to).sort()).toEqual([ann.id, bo.id].sort());
    w.advance(data.social.gangWar.prepHours * HOUR + 60_000);
    sent.length = 0;
    expect(await w.core.gangWarReminders()).toBe(1);
    expect(sent.map((s) => s.m.title)).toEqual(['The Gang War battle day has begun', 'The Gang War battle day has begun']);
    expect(await w.core.gangWarReminders()).toBe(0); // once
    // Ann uses both attacks (one relay); Bo hears the hand-off and later the 2-hour warning, Ann does not.
    const t1 = await ann.gangWarTicket({ target: 0, relay: true });
    await ann.gangWarAttack({ ticket: t1.ticket, seed: t1.seed, army: { hedgehog_roller: 1 }, deployments: [] });
    expect(sent.at(-1)).toMatchObject({ to: bo.id, m: { type: 'gangWar', title: 'Your turn in the relay' } });
    const t2 = await ann.gangWarTicket({ target: 1 });
    await ann.gangWarAttack({ ticket: t2.ticket, seed: t2.seed, army: { hedgehog_roller: 1 }, deployments: [] });
    w.advance((data.social.gangWar.battleHours - 1.5) * HOUR);
    sent.length = 0;
    await w.core.gangWarReminders();
    expect(sent).toEqual([{ to: bo.id, m: expect.objectContaining({ title: '2 hours left in the Gang War' }) }]);
  });
});
