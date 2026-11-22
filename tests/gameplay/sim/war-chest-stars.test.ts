/** Beast Mode GT-13: Alliance and Gang War chests split chestStarShare (30%) by the member's own stars. */
import { describe, expect, it } from 'vitest';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { applyCommand, createNewVillage } from '../../../src/gameplay/sim/village';

const T = Date.UTC(2026, 3, 6, 12);
function gained(cmd: Parameters<typeof applyCommand>[1]) {
  const s = createNewVillage(T, data);
  s.resources.acorns = 0;
  s.resources.dew = 0;
  const r = applyCommand(s, cmd, T, data);
  if (!r.ok) throw new Error(r.message);
  const e = r.events.find((x) => x.kind === 'reward');
  return e && e.kind === 'reward' ? e.grants : {};
}

describe('GT-13: war chests by own stars', () => {
  it('an Alliance War chest pays 70% with no stars of the member, all of it at full stars, and all of it when no share is sent (older servers)', () => {
    const full = gained({ type: 'claimRaidChest', week: 1, outcome: 'win', ours: 9, theirs: 3 });
    const none = gained({ type: 'claimRaidChest', week: 1, outcome: 'win', ours: 9, theirs: 3, starShare: 0 });
    const all = gained({ type: 'claimRaidChest', week: 1, outcome: 'win', ours: 9, theirs: 3, starShare: 1 });
    expect(data.social.groveRaid.chestStarShare).toBe(0.3);
    expect(all).toEqual(full);
    expect(none.moonstones).toBe(Math.floor(full.moonstones! * 0.7));
    expect(none.acorns).toBe(Math.floor(full.acorns! * 0.7));
  });

  it('a Gang War chest does the same (Jade shown: resources are storage-capped on a new village)', () => {
    const jade = (cmd: Parameters<typeof applyCommand>[1]) => {
      const s = createNewVillage(T, data);
      const before = s.resources.moonstones;
      const r = applyCommand(s, cmd, T, data);
      if (!r.ok) throw new Error(r.message);
      return r.state.resources.moonstones - before;
    };
    const full = jade({ type: 'claimGangChest', warId: 'w', outcome: 'win' });
    expect(full).toBeGreaterThan(0);
    expect(jade({ type: 'claimGangChest', warId: 'w', outcome: 'win', starShare: 0.5 })).toBe(Math.floor(full * 0.85));
    expect(jade({ type: 'claimGangChest', warId: 'w', outcome: 'win', starShare: 1 })).toBe(full);
  });
});
