/**
 * The store's in-app review sheet (retention audit G26): asked only right after a win, never in the first raids,
 * never twice in four months and at most three times ever. The stores show their own sheet (and may show nothing:
 * Apple limits it to three a year); the game never asks "do you like it?" first and never gates anything on it.
 *
 * No native review plugin is installed, so `requestReview` does nothing until the composition root provides one
 * (`provideReviewHook`, e.g. a Capacitor in-app review plugin: owner/native work). On the web it is always a no-op.
 */
interface ReviewState {
  /** Wins counted on this device. */
  wins: number;
  /** When the sheet was last requested (ms), 0 = never. */
  last: number;
  /** How many times it was requested. */
  asked: number;
}

/** Wins before the first request: the player has seen enough of the game to judge it. */
export const REVIEW_MIN_WINS = 5;
/** Days between requests. */
export const REVIEW_GAP_DAYS = 120;
/** Requests ever (per device). */
export const REVIEW_MAX_ASKS = 3;

const KEY = 'tk.review';
let hook: (() => Promise<void> | void) | null = null;

/** The native review request (none on the web). */
export function provideReviewHook(fn: (() => Promise<void> | void) | null): void {
  hook = fn;
}

/** Whether a battle that just ended may be followed by the review sheet. Pure: tested without a browser. */
export function shouldAskForReview(state: ReviewState, now: number, win: boolean, tutorialDone: boolean): boolean {
  if (!win || !tutorialDone) return false;
  if (state.wins < REVIEW_MIN_WINS) return false;
  if (state.asked >= REVIEW_MAX_ASKS) return false;
  return !state.last || now - state.last >= REVIEW_GAP_DAYS * 86_400_000;
}

function load(): ReviewState {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<ReviewState> | null;
    return { wins: Number(v?.wins) || 0, last: Number(v?.last) || 0, asked: Number(v?.asked) || 0 };
  } catch {
    return { wins: 0, last: 0, asked: 0 };
  }
}

function save(s: ReviewState): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/**
 * Count a real raid's result and, after the result screen is closed, maybe ask the store for its review sheet.
 * Practice, trials, replays and simulated fights are not passed here.
 */
export function noteBattleResult(win: boolean, tutorialDone: boolean, now = Date.now()): boolean {
  const s = load();
  if (win) s.wins++;
  const ask = Boolean(hook) && shouldAskForReview(s, now, win, tutorialDone);
  if (ask) {
    s.last = now;
    s.asked++;
  }
  // Without storage the counts would restart every time: never ask then.
  if (!save(s) || !ask) return false;
  try {
    void Promise.resolve(hook!()).catch(() => undefined);
  } catch {
    /* the store said no: nothing to show */
  }
  return true;
}
