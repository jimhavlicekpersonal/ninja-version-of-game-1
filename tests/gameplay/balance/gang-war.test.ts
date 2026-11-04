/**
 * Gang War balance (roadmap step 69), with real battles: model Gangs at
 * Keeps 4-13 strike a base one Keep above theirs (Gang Wars match on rating
 * and power, not Keep). A coordinated relay (a half-army opener, then the
 * main force: `relayHousingShare` 1.5) must beat the best of two solo
 * strikes by a clear but limited margin; war chests must keep pace with the
 * Alliance War's across Keeps without outpacing it.
 */
import { describe, expect, it } from 'vitest';
import { createBattle, endDamage, runBattle } from '../../../src/gameplay/sim/battle/battle';
import { generateOpponent } from '../../../src/gameplay/sim/battle/basegen';
import { defaultData as data } from '../../../src/gameplay/sim/data';
import { botDeployments } from '../../../src/gameplay/sim/defense';
import { scaleReward } from '../../../src/gameplay/sim/economy';
import { botArmy } from '../../../src/gameplay/sim/matchmaking';
import { troopLevelCapAt } from '../../../src/gameplay/sim/research';
import { createRng } from '../../../src/gameplay/sim/rng';

const gw = data.social.gangWar;

function measure(keep: number, bases: number) {
  const out = { solo: 0, soloStars: 0, relay: 0, relayStars: 0 };
  for (let s = 0; s < bases; s++) {
    const base = generateOpponent(9000 + keep * 31 + s, Math.min(15, keep + 1), data);
    const full = botArmy(keep, 1, data);
    const levels: Record<string, number> = {};
    for (const t of Object.keys(full)) levels[t] = Math.max(1, Math.min(troopLevelCapAt(keep, data, t), data.troops[t].levels.length));
    const scaled = (f: number) => Object.fromEntries(Object.entries(full).map(([t, c]) => [t, Math.floor(c * f)]).filter(([, c]) => (c as number) > 0)) as Record<string, number>;
    const hit = (seed: number, army: Record<string, number>, startDamage?: Record<string, number>) => {
      const setup = { seed, base, army, levels, infiltration: true, ...(startDamage ? { startDamage } : {}) };
      const p = createBattle(setup, data);
      return runBattle(setup, botDeployments(p.deployable, p.grid.size, army, createRng(seed), data, levels, p.entry), data);
    };
    // Two members, two strikes: solo (best of two full armies) or one relay (opener + main force).
    const a = hit(100, full);
    const b = hit(101, full);
    out.solo += Math.max(a.result.destruction, b.result.destruction);
    out.soloStars += Math.max(a.result.stars, b.result.stars);
    const opener = hit(102, scaled(gw.relayHousingShare - 1));
    const main = hit(101, full, endDamage(opener.sim));
    out.relay += main.result.destruction;
    out.relayStars += main.result.stars;
  }
  return { solo: out.solo / bases, soloStars: out.soloStars / bases, relay: out.relay / bases, relayStars: out.relayStars / bases };
}

describe('Gang War balance', () => {
  it('a coordinated relay beats solo strikes by a clear but limited margin at every Keep', () => {
    const rows = [4, 7, 10, 13].map((keep) => ({ keep, ...measure(keep, 8) }));
    for (const r of rows) {
      const gain = r.relay - r.solo;
      expect(gain, `Keep ${r.keep}: relay ${r.relay.toFixed(1)} vs solo ${r.solo.toFixed(1)}`).toBeGreaterThanOrEqual(10); // clear
      expect(gain, `Keep ${r.keep}`).toBeLessThanOrEqual(40); // limited
      expect(r.relayStars, `Keep ${r.keep}: relays must not three-star everything`).toBeLessThan(2.6);
      expect(r.relayStars).toBeGreaterThanOrEqual(r.soloStars);
    }
  }, 300_000);

  it('war chests follow the Keep scaling of Alliance War chests, without outpacing them', () => {
    const ar = data.social.groveRaid.rewards;
    for (let keep = 1; keep <= data.hall.levels.length; keep++) {
      const win = scaleReward(gw.rewards.win, keep, data);
      const allianceWin = scaleReward({ acorns: ar.win.acorns, dew: ar.win.dew }, keep, data);
      // The same curve as the Alliance War: a constant share at every Keep.
      expect((win.acorns ?? 0) / (allianceWin.acorns ?? 1)).toBeCloseTo((gw.rewards.win.acorns ?? 0) / (ar.win.acorns ?? 1), 2);
      // Even a war won every day (one a day at most) adds up to under 2.5 weekly Alliance War chests.
      expect((7 * (win.acorns ?? 0)) / (allianceWin.acorns ?? 1)).toBeLessThanOrEqual(2.5);
    }
    // Losing still pays something, winning clearly more; Jade stays small (it is never the reason to play).
    expect((gw.rewards.loss.acorns ?? 0) / (gw.rewards.win.acorns ?? 1)).toBeGreaterThanOrEqual(0.2);
    expect(gw.rewards.win.moonstones ?? 0).toBeLessThanOrEqual(ar.win.moonstones ?? 0);
  });
});
