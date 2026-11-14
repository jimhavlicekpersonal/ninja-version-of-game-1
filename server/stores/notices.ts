/** Helpers both adapters share: store notifications that set refund state, and Alliance notices that name a player. */
import { isolateName } from '../../src/gameplay/sim/social/names';

/** Store notifications that set a purchase's refund state (backend A29: the latest by signed time wins). */
export const STATE_NOTICES = new Set(['REFUND', 'REVOKE', 'REFUND_REVERSED']);

/**
 * The Alliance notices that name a player (server/core/groves.ts writes them):
 * "<name> founded …!", "<name> joined the Alliance. Say hello!",
 * "<name> left the Alliance.", "<name> is the new leader.".
 */
export function nameNoticePatterns(name: string): { exact: string[]; prefixes: string[] } {
  const names = [name, isolateName(name)];
  return {
    exact: names.flatMap((n) => [
      `${n} joined the Alliance. Say hello!`, `${n} left the Alliance.`, `${n} is the new leader.`,
      `${n} joined the Gang.`, `${n} left the Gang.`, `${n} leads the Gang now.`,
    ]),
    prefixes: names.map((n) => `${n} founded `),
  };
}

export function noticesNaming(name: string): (text: string) => boolean {
  const { exact, prefixes } = nameNoticePatterns(name);
  const matches = new Set(exact);
  return (text) => matches.has(text) || prefixes.some((p) => text.startsWith(p));
}
