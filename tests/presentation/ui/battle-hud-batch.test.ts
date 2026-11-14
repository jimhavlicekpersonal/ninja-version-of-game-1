/**
 * GUI batch 2026-11-13, battle side: edge chevrons (art F8), troop card badges (art F12), the review prompt policy
 * (retention G26), the scout chip text (art F16) and loot chips that rebuild only on change (audit M10).
 * There is no browser in `npm test`; the layout was also checked in Chromium (see docs/store/WORLDWIDE_AUDIT.md).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GAP_X, GAP_Y, layoutChevrons, spread } from '../../../src/presentation/ui/chevronLayout';
import { badgeIdFor } from '../../../src/presentation/ui/cardArt';
import { REVIEW_GAP_DAYS, REVIEW_MAX_ASKS, REVIEW_MIN_WINS, shouldAskForReview } from '../../../src/presentation/ui/reviewPrompt';
import { defaultData } from '../../../src/gameplay/sim/data';

const ROOT = join(__dirname, '../../..');
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const bounds = { left: 30, right: 330, top: 150, bottom: 470 };

describe('edge chevrons never overlap (art F8)', () => {
  it('merges points in the same direction into one chevron that pans to the first', () => {
    const out = layoutChevrons([{ item: 'E', x: 330, y: 300 }, { item: 'F', x: 330, y: 320 }], bounds);
    expect(out).toHaveLength(1);
    expect(out[0].items).toEqual(['E', 'F']);
  });

  it('spreads neighbours on one edge by at least a chevron', () => {
    const out = layoutChevrons([{ item: 'A', x: 330, y: 300 }, { item: 'B', x: 330, y: 345 }, { item: 'C', x: 330, y: 360 }], bounds);
    const ys = out.map((c) => c.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(GAP_Y);
    const top = layoutChevrons([{ item: 'A', x: 100, y: 150 }, { item: 'B', x: 150, y: 150 }], bounds);
    expect(Math.abs(top[0].x - top[1].x)).toBeGreaterThanOrEqual(GAP_X);
  });

  it('stays inside the edge when there is room, pushing back from the end', () => {
    expect(spread([440, 460, 470], 50, 150, 470)).toEqual([370, 420, 470]);
    expect(spread([100, 120], 50, 150, 470)).toEqual([150, 200]);
  });

  it('is used by the battle HUD', () => {
    expect(src('src/presentation/ui/battleHud.ts')).toContain('layoutChevrons(');
  });
});

describe('battle troop cards show the warrior badge (art F12)', () => {
  it('maps every live troop to its roster badge', () => {
    for (const troop of Object.keys(defaultData.troops)) expect(badgeIdFor(troop), troop).not.toBeNull();
    expect(badgeIdFor('no_such_troop')).toBeNull();
  });
  it('the card uses the badge and keeps the sprite only as a fallback', () => {
    expect(src('src/presentation/ui/battleHud.ts')).toMatch(/const thumb = badge \?\? this\.deps\.troopThumb\(type\)/);
  });
});

describe('in-app review prompt policy (retention G26)', () => {
  const day = 86_400_000;
  const base = { wins: REVIEW_MIN_WINS, last: 0, asked: 0 };
  it('asks only after a win, after the tutorial and after a few wins', () => {
    expect(shouldAskForReview(base, 1e12, true, true)).toBe(true);
    expect(shouldAskForReview(base, 1e12, false, true)).toBe(false);
    expect(shouldAskForReview(base, 1e12, true, false)).toBe(false);
    expect(shouldAskForReview({ ...base, wins: REVIEW_MIN_WINS - 1 }, 1e12, true, true)).toBe(false);
  });
  it('waits months between requests and stops for good after a few', () => {
    expect(shouldAskForReview({ ...base, last: 1e12, asked: 1 }, 1e12 + (REVIEW_GAP_DAYS - 1) * day, true, true)).toBe(false);
    expect(shouldAskForReview({ ...base, last: 1e12, asked: 1 }, 1e12 + REVIEW_GAP_DAYS * day, true, true)).toBe(true);
    expect(shouldAskForReview({ ...base, last: 1, asked: REVIEW_MAX_ASKS }, 1e13, true, true)).toBe(false);
  });
  it('the web has no review hook (no native plugin is installed yet)', () => {
    expect(src('src/main.ts')).not.toContain('provideReviewHook');
    expect(src('package.json')).not.toMatch(/in-app-review|app-review/);
  });
});

describe('scout chips and loot chips (art F16, audit M10)', () => {
  const hud = src('src/presentation/ui/battleHud.ts');
  it('write anti-air and splash out in visible text', () => {
    expect(hud).not.toContain('ui.aa_9b915ac88a');
    expect(hud).toMatch(/p\.antiAir \? t\('battle\.antiAir'\)/);
  });
  it('rebuild the loot chips only when a number changes', () => {
    expect(hud).toMatch(/if \(lootSig !== this\.lootSig\)/);
    expect(hud).not.toMatch(/clear\(this\.lootEl\);\s*this\.lootEl\.append/);
  });
});
