/** The account-age rule shared by the village import and base uploads (Beast Mode SEC-01; a leaf: no imports from core). */
/**
 * Ledger audit A2 / E11: the server cannot tell real offline play from a save
 * edited, or played with the phone's clock moved forward, so the device's own
 * dates prove nothing. What the server does know is how long this account has
 * existed. A village above IMPORT_FREE_KEEP moves only once the account is at
 * least IMPORT_AGE_SHARE of the days the regular model player (4 sessions a
 * day, no Jade spent: docs/game-theory/CAMPAIGN.md, 2026-11-05) needed to reach
 * its Keep. An honest offline player keeps playing on the device and moves
 * later; a forged Keep-15 village needs a 60-day-old account instead of a
 * minute, and deleting the account and registering again starts the wait over.
 * Limitation: accounts registered early and left to age still pass.
 */
export const MODEL_DAYS_TO_KEEP = [0, 0, 0, 0.7, 4.2, 10.4, 16.6, 23.4, 28, 32.6, 42.2, 52, 65.6, 93, 121.2];
export const IMPORT_FREE_KEEP = 5;
export const IMPORT_AGE_SHARE = 0.5;

/** Days an account must have existed before it may bring a village at this Keep. */
export function importMinAccountDays(keep: number): number {
  if (keep <= IMPORT_FREE_KEEP) return 0;
  return IMPORT_AGE_SHARE * MODEL_DAYS_TO_KEEP[Math.min(keep, MODEL_DAYS_TO_KEEP.length) - 1];
}

