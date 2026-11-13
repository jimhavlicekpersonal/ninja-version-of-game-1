import { labelText } from './i18n';

/** What sharing play statistics means, in Settings and in the one-time question (main.ts). Keep it matching `STATS_EVENTS`. */
export const STATS_EXPLAINER =
  'Sends what you do in the game (sessions, tutorial steps, raids, upgrades, offers seen and purchases, with their numbers) under a random statistics id, never your name, Player ID, village, chat or IP address, so we can see where players get stuck. Turning it on also sends what this device recorded so far; turning it off deletes what was sent.';

/** The explainer in the player's language. Never show `STATS_EXPLAINER` itself: it is the English catalog source. */
export function statsExplainer(): string {
  return labelText(STATS_EXPLAINER);
}
