/** Number and time formatting for the HUD, in the player's language (report section 5 step 9, compliance L03). */
import { fmtNumber, language, t } from './i18n';

export function formatNumber(n: number): string {
  return fmtNumber(n);
}

let compact: Intl.NumberFormat | null = null;
let compactFor = '';
/** Short amounts for tight spaces: 950, 1.2K, 34K, 1.5M (the language's own short forms). */
export function formatCompact(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return fmtNumber(v);
  const code = language().code;
  if (!compact || compactFor !== code) {
    try {
      compact = new Intl.NumberFormat(code, { notation: 'compact', maximumFractionDigits: 1, numberingSystem: 'latn' } as Intl.NumberFormatOptions);
    } catch {
      compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
    }
    compactFor = code;
  }
  // 10K-999K show no decimals (34K, not 34.2K), as before.
  return v >= 10_000 && v < 1_000_000 ? compact.format(Math.floor(v / 1000) * 1000) : compact.format(v);
}

/** 45s, 4m 10s, 3h 40m, 1d 16h. Shows the two biggest units. */
export function formatDuration(ms: number): string {
  let s = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  s -= m * 60;
  if (d > 0) return h ? t('time.dh', { d, h }) : t('time.d', { d });
  if (h > 0) return m ? t('time.hm', { h, m }) : t('time.h', { h });
  if (m > 0) return s ? t('time.ms', { m, s }) : t('time.m', { m });
  return t('time.s', { s });
}
