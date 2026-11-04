/**
 * Whether this game may play online with a server (roadmap step 75), shared
 * by the game and the server. A server lists the battle rules it
 * re-simulates (`supportedRules`) and the oldest game version it allows
 * (`minClientBuild`); a game outside them shows "Update Kagemura" instead of
 * getting results it cannot reproduce. Pure.
 */
import type { HelloResponse } from './protocol';

/** "0.1.0+ios" → [0, 1, 0]: the version before any "+platform", numbers only. */
export function buildParts(build: string): number[] {
  return String(build ?? '')
    .split('+')[0]
    .split(/[.-]/)
    .map((x) => Number.parseInt(x, 10))
    .filter((n) => Number.isFinite(n));
}

/** True when `build` is an older version than `min` (an unreadable build is never "older"). */
export function buildOlderThan(build: string, min: string): boolean {
  const a = buildParts(build);
  const b = buildParts(min);
  if (!a.length || !b.length) return false;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}

/** Why this game must update before playing online with this server, or null. */
export function updateReason(h: Pick<HelloResponse, 'supportedRules' | 'minClientBuild'>, rules: number, build: string): string | null {
  if (Array.isArray(h.supportedRules) && h.supportedRules.length && !h.supportedRules.includes(rules)) {
    return 'The server now plays by newer battle rules. Update Kagemura to keep playing online.';
  }
  if (h.minClientBuild && buildOlderThan(build, h.minClientBuild)) return `Kagemura ${h.minClientBuild} or newer is needed online. Update the game to keep playing online.`;
  return null;
}
