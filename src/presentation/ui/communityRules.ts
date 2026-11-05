/**
 * The community rules, acknowledged once before a player first talks to or
 * befriends real players (worldwide audit R06). The full rules are the
 * shipped page (public/community.html, Settings → Privacy and help); this is
 * the short version, asked once per device and again if the rules change
 * (bump COMMUNITY_RULES_VERSION). Nothing here moderates: reports, blocks,
 * the word filter and staff tools do that.
 */
export const COMMUNITY_RULES_VERSION = 1;
const KEY = 'tk.community.accepted';

export function communityRulesAccepted(): boolean {
  try {
    return Number(localStorage.getItem(KEY)) >= COMMUNITY_RULES_VERSION;
  } catch {
    return false;
  }
}

function remember(): void {
  try {
    localStorage.setItem(KEY, String(COMMUNITY_RULES_VERSION));
  } catch {
    /* storage blocked: asked again next time, which is harmless */
  }
}

/** Ask once; true when accepted (now or before). */
export async function ensureCommunityRules(kit: { confirm(title: string, message: string, confirmLabel: string, danger?: boolean, cancelLabel?: string): Promise<boolean> }): Promise<boolean> {
  if (communityRulesAccepted()) return true;
  const ok = await kit.confirm(
    'Community rules',
    'Kagemura is for everyone. Be respectful: no harassment, hate, threats, sexual content, or sharing anyone\'s personal details (including your own). No cheating or selling accounts. Use ⋯ to report or block anyone breaking the rules; staff can remove messages, mute chat and suspend accounts. The full rules are in Settings → Privacy and help.',
    'I agree',
    false,
    'Not now',
  );
  if (ok) remember();
  return ok;
}
