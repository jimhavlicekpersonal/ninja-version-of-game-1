/**
 * The age question after the tutorial (economy audit E02, report section 5 step 6). "Not now" used to end it for good
 * on that device, so a player who skipped it once never got the protections or the offers for their age. It now comes
 * back, rarely: at most three times in all, at least three days apart, never on top of another dialog or in a battle.
 * Until it is answered nothing changes: no offers for an unknown age, and the under-18 protections where the store's
 * signal or a purchase sets them.
 */
interface AskRecord {
  /** Times asked on this device. */
  count: number;
  /** When it was last asked (ms). */
  last: number;
}

export const AGE_ASK_GAP_DAYS = 3;
export const AGE_ASK_MAX = 3;

/** The stored record; the old flag ('1', asked once before this change) counts as asked just now. */
export function parseAskRecord(raw: string | null, now: number): AskRecord | null {
  if (!raw) return null;
  if (raw === '1') return { count: 1, last: now };
  try {
    const v = JSON.parse(raw) as Partial<AskRecord>;
    const count = Number(v.count);
    const last = Number(v.last);
    if (Number.isFinite(count) && Number.isFinite(last)) return { count, last };
  } catch {
    /* damaged: treat as asked now, never nag */
  }
  return { count: 1, last: now };
}

export function shouldAskAge(rec: AskRecord | null, now: number): boolean {
  if (!rec) return true;
  return rec.count < AGE_ASK_MAX && now - rec.last >= AGE_ASK_GAP_DAYS * 86_400_000;
}
