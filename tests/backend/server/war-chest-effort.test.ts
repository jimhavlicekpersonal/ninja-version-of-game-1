/** Beast Mode 2026-11-21 GT-13: a token war attack (one warrior, no star) does not earn the war chest. */
import { describe, expect, it } from 'vitest';
import { maxHousingAtHall, warChestAttack } from '../../../src/gameplay/sim/army';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { baseAt, noTroops, world } from './harness';
import { ServerError } from '../../../src/backend/net/ports';

const code = (p: Promise<unknown>) => p.then(() => 'ok', (e: unknown) => (e instanceof ServerError ? e.code : String(e)));

describe('war chest effort (GT-13)', () => {
  it('the rule: a star, or most of the Keep\'s camp housing deployed', () => {
    const camps = maxHousingAtHall(5, data);
    const share = data.social.groveRaid.chestMinDeployShare!;
    expect(warChestAttack({ hedgehog_roller: 1 }, 0, 5, share, data)).toBe(false);
    expect(warChestAttack({ hedgehog_roller: 1 }, 1, 5, share, data)).toBe(true);
    const full = Math.ceil((share * camps) / data.troops.hedgehog_roller.housing);
    expect(warChestAttack({ hedgehog_roller: full }, 0, 5, share, data)).toBe(true);
    expect(data.social.gangWar.chestMinDeployShare).toBe(share);
  });

  it('an Alliance War member who only sent one warrior gets no chest', async () => {
    const w = world();
    const [ann, ben, cat, dan] = await Promise.all([w.player('Ann', baseAt(3, 1)), w.player('Ben', baseAt(3, 2)), w.player('Cat', baseAt(3, 3)), w.player('Dan', baseAt(3, 4))]);
    const ga = await ann.createGrove('Acorn Army');
    await ben.joinGrove(ga.id);
    const gb = await cat.createGrove('Beetle Band');
    await dan.joinGrove(gb.id);
    const week = w.intoRaid(1);
    await cat.me();
    const t = await ann.raidTicket(0);
    const r = await ann.submitRaidAttack({ ticket: t.ticket, seed: t.seed, ...noTroops(t) });
    expect(r.stars).toBe(0);
    w.setTime(w.raidEnd(week) + 1);
    expect((await ann.raid()).chests).toEqual([]);
    expect(await code(ann.claimRaid(week))).toBe('conflict');
  });
});
