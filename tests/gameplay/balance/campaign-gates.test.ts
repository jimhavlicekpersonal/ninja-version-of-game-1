/**
 * Balance gates with real numbers (report section 5 step 11; economy E24, E25, E26).
 *
 * The balance tests had upper gates (no army too strong) but nothing that failed when the
 * model player could no longer win. These read the long campaigns in
 * docs/game-theory/campaign.json (`npm run balance:campaign`, about three minutes: real
 * timers, earned resources, real battles and offline raids to Keep 15) and hold them to
 * lower and upper bounds. The file carries a fingerprint of everything the campaigns depend
 * on (played data, battle rules, the model player, matchmaking, base generation, offline
 * raids), so a balance change that skips the rerun fails here instead of passing on old numbers.
 *
 * Model-player outcomes are not real players: real-player playtests are still owed (owner step).
 */
import { describe, expect, it } from 'vitest';
import campaigns from '../../../docs/game-theory/campaign.json';
import { defaultData } from '../../../src/gameplay/sim/data';
import { campaignData, campaignFingerprint, CAMPAIGNS, type CampaignResult } from '../../../tools/balance/campaign';

const results = campaigns.results as unknown as CampaignResult[];
const byId = (id: string) => {
  const r = results.find((x) => x.id === id);
  if (!r) throw new Error(`campaign ${id} missing: run npm run balance:campaign`);
  return r;
};
/** Keeps with enough raids to mean something. */
const rows = (id: string, minRaids = 5) => byId(id).byKeep.filter((k) => k.keep >= 3 && k.raids >= minRaids);

describe('the fortress campaign\'s layout is a lab flag only (P2-04)', () => {
  it('live data sets neither raids.labAutoLayout nor raids.labWalls; only the labLayout campaign does', () => {
    expect(defaultData.raids.labAutoLayout).toBeUndefined();
    expect(defaultData.raids.labWalls).toBeUndefined();
    for (const c of CAMPAIGNS) expect(Boolean(campaignData(c).raids.labAutoLayout), c.id).toBe(c.id === 'regular_fortress');
  });
});

describe('campaign results are current', () => {
  it('match the data and code they were played with (run npm run balance:campaign)', () => {
    expect(campaigns.fingerprint).toBe(campaignFingerprint());
    expect(results.map((r) => r.id)).toEqual(CAMPAIGNS.map((c) => c.id));
  });
});

describe('lower bounds: the model player keeps winning at every Keep (E24, E25)', () => {
  for (const id of ['regular', 'regular_defender', 'casual']) {
    it(`${id}: at least 0.9 stars and 55% wins at every Keep from 3 on`, () => {
      for (const k of rows(id)) {
        expect(k.stars, `${id} Keep ${k.keep} stars`).toBeGreaterThanOrEqual(0.9);
        expect(k.won, `${id} Keep ${k.keep} won`).toBeGreaterThanOrEqual(0.55);
      }
    });
  }

  it('Keep 3 is no longer a cliff after Keep 2 (E24: it was 0.88 stars, no three-stars)', () => {
    const k3 = byId('regular').byKeep.find((k) => k.keep === 3)!;
    expect(k3.stars).toBeGreaterThanOrEqual(1.2);
  });

  it('the late game has no losing streak Keep for the regular player (E25: Keep 12 was 0.84 stars)', () => {
    const late = rows('regular').filter((k) => k.keep >= 8);
    expect(late.length).toBeGreaterThanOrEqual(7);
    for (const k of late) expect(k.stars, `Keep ${k.keep}`).toBeGreaterThanOrEqual(1.2);
  });

  it('the casual explorer (newest warrior of each family) does not get worse (E25 still open for it)', () => {
    // Known gap: at the same army strength as the regular player, the explorer's mixed army wins
    // about a third as often at Keeps 8-14. Matchmaking is not the cause; the composition and the
    // simple attack plan are. This only stops it from getting worse until that is fixed.
    const mid = rows('casual_explorer').filter((k) => k.keep >= 8);
    for (const k of mid) expect(k.stars, `Keep ${k.keep}`).toBeGreaterThanOrEqual(0.1);
    expect(mid.reduce((a, k) => a + k.stars, 0) / mid.length).toBeGreaterThanOrEqual(0.3);
  });
});

describe('upper bounds: no farming (audit F22)', () => {
  it('no campaign three-stars more than half its raids at any Keep from 6 on', () => {
    for (const r of results) for (const k of r.byKeep.filter((x) => x.keep >= 6 && x.raids >= 10)) expect(k.threeStar, `${r.id} Keep ${k.keep}`).toBeLessThanOrEqual(0.5);
  });

  it('the regular player reaches Keep 15 in 100-140 days, and casual play gets there inside the 400-day run', () => {
    expect(byId('regular').reached[15]).toBeGreaterThanOrEqual(100);
    expect(byId('regular').reached[15]).toBeLessThanOrEqual(140);
    expect(byId('casual').reached[15]).toBeDefined();
  });
});

describe('defense is measured (E26)', () => {
  it('every campaign reports raids against the village, what they took and how many were held', () => {
    for (const r of results) {
      const raided = r.byKeep.filter((k) => k.defenses > 0);
      expect(raided.length, r.id).toBeGreaterThanOrEqual(8);
      for (const k of raided) expect(k.stolen, `${r.id} Keep ${k.keep}`).toBeGreaterThanOrEqual(0);
      expect(r.totals.looted, r.id).toBeGreaterThan(0);
    }
  });

  it('raids against a regular village take less than it loots (non-regression; casual villages still lose more, E26 open)', () => {
    const r = byId('regular');
    expect(r.totals.stolen / r.totals.looted).toBeLessThan(0.8);
  });
});

describe('policy dominance margins (balance audit 2026-11-08 Change-12, PS-1)', () => {
  it('sandbagging does not pay: holding research back to meet weaker bases reaches Keeps 12 and 15 no sooner', () => {
    const reg = byId('regular').reached;
    const sand = byId('regular_sandbagger').reached;
    expect(sand[12], 'Keep 12').toBeGreaterThanOrEqual(reg[12]);
    expect(sand[15], 'Keep 15').toBeGreaterThanOrEqual(reg[15]);
  });

  // P2-04 (DEF-03, 2026-11-18): the gates that say what defense is for, replacing the KNOWN FAILING PS-1 assertion
  // (rusher >= 1.1 x the defender's days to Keep 12, which held defense to a pace cost it should not have). They read
  // the fortress campaign (counters within two levels of the caps, walled generated layout, garrison crew of 2).
  // Set from the first full run (2026-11-18) with at least five points or two days of margin:
  // held 42% at Keeps 9-15 (gate 37%); stolen/looted 0.57x the rusher's (gate 0.62x); Keep 12 at 1.17x the
  // rusher's days, 3.9 days inside 1.25x (gate 1.25x, which needs the garrison crew: 1.34x without it).
  const late = (id: string) => byId(id).byKeep.filter((k) => k.keep >= 9 && k.defenses);
  it('the fortress holds at least 37% of the raids against it at Keeps 9-15', () => {
    const ks = late('regular_fortress');
    const n = ks.reduce((a, k) => a + k.defenses, 0);
    expect(n).toBeGreaterThan(50);
    expect(ks.reduce((a, k) => a + k.held * k.defenses, 0) / n).toBeGreaterThanOrEqual(0.37);
  });

  it('defense keeps loot: the fortress loses at most 0.62x the rusher\'s share of what it looted', () => {
    const ratio = (id: string) => byId(id).totals.stolen / byId(id).totals.looted;
    expect(ratio('regular_fortress') / ratio('regular_rusher')).toBeLessThanOrEqual(0.62);
  });

  it('defense does not cost the climb: the fortress reaches Keep 12 within 1.25x the rusher\'s days', () => {
    expect(byId('regular_fortress').reached[12] / byId('regular_rusher').reached[12]).toBeLessThanOrEqual(1.25);
  });
});

