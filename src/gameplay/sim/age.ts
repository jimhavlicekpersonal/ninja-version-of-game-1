/**
 * Age bands (worldwide re-audit: minors online). A player states a birth year
 * (and month in a boundary year) on a neutral age screen, or the device's
 * store gives an age range (Apple Declared Age Range, Google Play Age Signals).
 * Self-declared or store-declared: this sets protections, it is not age
 * verification.
 *
 * - `under13`: no free-text chat (fixed phrases only), never findable by name,
 *   a generated name, no offer pop-ups, the under-18 spending limit.
 * - `13to17`: starts hidden from strangers (friends of friends) with online
 *   status off, no offer pop-ups, the under-18 spending limit.
 * - `adult`: no extra protections.
 *
 * A band only ever gets stricter on the device and on the server; support can
 * reset it after a check (`staffResetAge`).
 */
export type AgeBand = 'under13' | '13to17' | 'adult';
export const AGE_BANDS: readonly AgeBand[] = ['under13', '13to17', 'adult'];

/** 0 = strictest. */
export function bandRank(b: AgeBand): number {
  return AGE_BANDS.indexOf(b);
}

export function isAgeBand(v: unknown): v is AgeBand {
  return typeof v === 'string' && (AGE_BANDS as readonly string[]).includes(v);
}

/** The stricter of two bands (null counts as unknown: the other one wins). */
export function stricterBand(a: AgeBand | null | undefined, b: AgeBand | null | undefined): AgeBand | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return bandRank(a) <= bandRank(b) ? a : b;
}

/**
 * May a profile go from `current` to `next`? Only the same or stricter. A
 * profile that already said "under 18" (before bands existed) may not become
 * adult.
 */
export function bandChangeAllowed(current: AgeBand | null | undefined, under18: boolean | null | undefined, next: AgeBand): boolean {
  if (under18 === true && next === 'adult') return false;
  if (!current) return true;
  return bandRank(next) <= bandRank(current);
}

/**
 * The band for a birth year (and month, 1-12, when given) on `today` (UTC
 * year and month, read by the caller). Without a month the birthday is taken
 * as not yet reached this year, so a boundary year gives the stricter band.
 */
export function ageBandFromBirth(year: number, month: number | null, today: { year: number; month: number }): AgeBand {
  let age = today.year - year;
  // A birthday in this month or later this year has not (surely) happened yet.
  if (month === null || !(month >= 1 && month <= 12) || month >= today.month) age -= 1;
  if (age < 13) return 'under13';
  if (age < 18) return '13to17';
  return 'adult';
}

/** Does the birth year alone leave the band open (a month decides it)? */
export function birthYearNeedsMonth(year: number, today: { year: number }): boolean {
  const age = today.year - year;
  return age === 13 || age === 18;
}

/** The band an older profile implies: "18 or older" is adult; "under 18" stays unknown (asked again, never adult). */
export function bandFromProfile(p: { under18: boolean | null; ageBand?: AgeBand | null }): AgeBand | null {
  if (p.ageBand) return p.ageBand;
  return p.under18 === false ? 'adult' : null;
}
