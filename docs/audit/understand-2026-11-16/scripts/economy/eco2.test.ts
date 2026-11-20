import { describe, expect, it } from 'vitest';
import { defaultData as data } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/data';
import { applyCommand, createNewVillage, canHireArtisan, placeQuote } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/village';
import { rematchReward } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/rematch';
import { currentTasks } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/pass';
import type { VillageState } from '/home/user/ninja-version-of-game-1/src/gameplay/sim/types';

const DAY = 86_400_000;
const T0 = data.pass.epoch + 400 * DAY + 3 * 3_600_000;

describe('ECO scratch 2', () => {
  it("Artisan's Bundle is offered with 4 huts, where the next hut costs 1,000 Jade and the Bundle holds 650", () => {
    const v = createNewVillage(T0 - 30 * DAY, data);
    let id = 7000;
    const huts = [0, 1].map((i) => ({ id: `h${id++}`, type: 'beaver_lodge', x: 30 + i * 3, y: 30, level: 1 }));
    const s: VillageState = { ...v, buildings: [...v.buildings.filter((b) => data.buildings[b.type].category !== 'obstacle'), ...huts] as never, profile: { ...v.profile, under18: false, ageBand: 'adult' } as never, offers: { ...v.offers, lastShown: { starter_pack: T0 - 10 * DAY }, bought: ['starter_pack'] } };
    expect(s.buildings.filter((b) => b.type === 'beaver_lodge').length).toBe(4);
    expect(canHireArtisan(s, data)).toBe(true);
    const q = placeQuote(s, data, 'beaver_lodge', T0);
    const r = applyCommand(s, { type: 'triggerOffer', trigger: 'all_builders_busy' } as never, T0, data);
    const rule = data.offers.rules.find((x) => x.id === 'builder_pack')!;
    console.log('BUNDLE: huts 4, next hut price', JSON.stringify(q.quote?.cost), 'offer shown', r.ok, r.ok ? JSON.stringify(r.events) : r.code, 'bundle Jade', rule.contents.moonstones, '| text:', rule.description);
    expect(r.ok).toBe(true);
  });

  it('rematch reward vs army cost; daily task targets vs economy', () => {
    for (const k of [5, 10, 15]) console.log(`REMATCH K${k}: 3-star pays`, JSON.stringify(rematchReward(3, k, data)), '1-star', JSON.stringify(rematchReward(1, k, data)));
    for (const keep of [5, 10, 15]) {
      const v = createNewVillage(T0, data);
      const s = { ...v, buildings: v.buildings.map((b) => (b.type === 'elder_toadstool' ? { ...b, level: keep } : b)) };
      const fixed = data.pass.dailyTasks.map((t) => `${t.id}=${t.base + t.perHall * (keep - 1)}`).join(' ');
      console.log(`TASKS K${keep}:`, fixed, '| today:', currentTasks(s, keep, data).map((t) => `${t.kind}:${t.id}:${t.target}`).join(' '));
    }
  });
});
