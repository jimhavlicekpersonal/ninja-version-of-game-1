// @vitest-environment happy-dom
/** Beast Mode 2026-11-21 OPS-14 / UX-10: wins counted on show, asked on close, never after a problem this session. */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { REVIEW_MIN_WINS, blockReviewThisSession, countBattleResult, maybeAskForReview, provideReviewHook, resetReviewSession } from '../../../src/presentation/ui/reviewPrompt';

let asked = 0;
beforeEach(() => {
  localStorage.removeItem('tk.review');
  resetReviewSession();
  asked = 0;
  provideReviewHook(() => void asked++);
});
afterEach(() => provideReviewHook(null));

const winsOf = () => JSON.parse(localStorage.getItem('tk.review') ?? '{}').wins ?? 0;

describe('review prompt', () => {
  it('counts each win once when shown; asks on close after enough wins, whatever button closed it', () => {
    for (let i = 0; i < REVIEW_MIN_WINS - 1; i++) {
      countBattleResult(true);
      expect(maybeAskForReview(true, true)).toBe(false);
    }
    countBattleResult(false);
    expect(winsOf()).toBe(REVIEW_MIN_WINS - 1);
    countBattleResult(true);
    expect(winsOf()).toBe(REVIEW_MIN_WINS);
    expect(maybeAskForReview(true, true)).toBe(true);
    expect(asked).toBe(1);
  });

  it('never after a loss or during the tutorial', () => {
    for (let i = 0; i < REVIEW_MIN_WINS; i++) countBattleResult(true);
    expect(maybeAskForReview(false, true)).toBe(false);
    expect(maybeAskForReview(true, false)).toBe(false);
    expect(asked).toBe(0);
  });

  it('no request after a purchase problem (or a crash, or a refused server) in the same session', () => {
    for (let i = 0; i < REVIEW_MIN_WINS; i++) countBattleResult(true);
    blockReviewThisSession('purchase');
    expect(maybeAskForReview(true, true)).toBe(false);
    expect(asked).toBe(0);
    resetReviewSession(); // the next session may
    expect(maybeAskForReview(true, true)).toBe(true);
  });

  it('the result screen counts on show and asks through every button; practice, trials, replays never count', () => {
    const hud = readFileSync('src/presentation/ui/battleHud.ts', 'utf8');
    expect(hud).toMatch(/const realRaid = !this\.deps\.grove && !this\.deps\.trial && !this\.deps\.practice && !this\.deps\.special && !this\.deps\.replayOf;\s*if \(realRaid\) countBattleResult\(r\.stars > 0\);/);
    expect(hud).toContain("{ label: t('battle.watchReplay'), onClick: leave(() => this.deps.onReplay()) }");
    expect(hud).toContain('onClick: leave(() => a.onClick())');
    expect(hud).toContain("onClick: leave(() => this.deps.onHome())");
    const econ = readFileSync('src/presentation/ui/economyUi.ts', 'utf8');
    expect(econ).toMatch(/blockReviewThisSession\('purchase'\)/);
    const main = readFileSync('src/main.ts', 'utf8');
    expect(main).toMatch(/connection\.status === 'suspended' \|\| connection\.status === 'incompatible'\) blockReviewThisSession\('server'\)/);
  });
});
