/** Number and time formatting for the HUD. */

export function formatNumber(n: number): string {
  return Math.floor(n).toLocaleString('en-US');
}

/** Short amounts for tight spaces: 950, 1.2K, 34K, 1.5M. */
export function formatCompact(n: number): string {
  const v = Math.floor(n);
  if (v < 1000) return String(v);
  if (v < 10_000) return `${(v / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  if (v < 1_000_000) return `${Math.floor(v / 1000)}K`;
  return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
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
  if (d > 0) return h ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return s ? `${m}m ${s}s` : `${m}m`;
  return `${s}s`;
}
