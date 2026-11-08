import { t as i18nText } from './i18n';
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
    i18nText("ui.community_rules_1b43c15f41"),
    i18nText("ui.kagemura_is_played_by_people_of_many_a_e6cf8f9f30"),
    i18nText("ui.i_agree_99955b75e0"),
    false,
    i18nText("ui.not_now_a0e63d7c71"),
  );
  if (ok) {
    remember();
    accepted?.();
  }
  return ok;
}
