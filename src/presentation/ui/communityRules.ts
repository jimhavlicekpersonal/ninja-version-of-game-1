/**
 * The community rules, acknowledged once before a player first talks to or
 * befriends real players (worldwide audit R06). The full rules are the
 * shipped page (public/community.html, Settings → Privacy and help); this is
 * the short version, asked once per device and again if the rules change
 * (bump COMMUNITY_RULES_VERSION). Nothing here moderates: reports, blocks,
 * the word filter and staff tools do that.
 */
import { COMMUNITY_RULES_VERSION } from '../../backend/net/protocol';

export { COMMUNITY_RULES_VERSION };
const KEY = 'tk.community.accepted';
let accepted: (() => void) | null = null;

/** Report section 5 step 7 (compliance C14): called when the player agrees, so the server records it (main.ts). */
export function onCommunityRulesAccepted(fn: () => void): void {
  accepted = fn;
}

/** The rules version accepted on this device (0: none), for the server's record. */
export function acceptedRulesVersion(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v >= COMMUNITY_RULES_VERSION ? COMMUNITY_RULES_VERSION : 0;
  } catch {
    return 0;
  }
}

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
    'Kagemura is played by people of many ages, so we ask everyone\'s age before online play and protect younger players (players under 13 chat with ready-made messages only and cannot be found by name). Be respectful: no harassment, hate, threats, sexual content, or sharing anyone\'s personal details (including your own). No cheating or selling accounts. Use ⋯ to report or block anyone breaking the rules; staff can remove messages, mute chat and suspend accounts. The full rules are in Settings → Privacy and help.',
    'I agree',
    false,
    'Not now',
  );
  if (ok) {
    remember();
    accepted?.();
  }
  return ok;
}
