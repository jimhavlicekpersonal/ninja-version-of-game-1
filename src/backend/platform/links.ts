/**
 * In-game links (audit R09): what a shared link asks the game to do. The web reads `location.search` at start;
 * the apps get the same links through Android App Links / iOS Universal Links (`@capacitor/app` `appUrlOpen`,
 * and `getLaunchUrl` for a cold start), once the owner's domain serves `assetlinks.json` and
 * `apple-app-site-association` (templates in `tools/applinks/`, steps in `docs/SHIPPING.md` 1c).
 *
 * Only the parameters the web understands are read, and each is checked: a friend code (as the Friends panel
 * takes it) and a home-screen shortcut name. Anything else in the link is ignored, so a crafted link can do
 * no more than open a panel.
 */

/** Panels a link may open (the web's `?open=` home-screen shortcuts). */
export const LINK_PANELS = ['daily', 'army', 'store', 'news'] as const;
export type LinkPanel = (typeof LINK_PANELS)[number];

export interface GameLink {
  /** `?friend=`: a friend code to look up once online. */
  friend?: string;
  /** `?open=`: a panel to open. */
  open?: LinkPanel;
}

/** Friend codes and names are short; anything longer or with control characters is not a friend link. */
const FRIEND_RE = /^[\p{L}\p{N} _-]{2,32}$/u;

/** Read a link (a full URL or just its query); `{}` when it asks for nothing the game knows. */
export function parseGameLink(raw: string): GameLink {
  let params: URLSearchParams;
  try {
    params = raw.includes('://') ? new URL(raw).searchParams : new URLSearchParams(raw.startsWith('?') ? raw : raw.slice(raw.indexOf('?') + 1));
  } catch {
    return {};
  }
  const out: GameLink = {};
  const friend = params.get('friend')?.trim();
  if (friend && FRIEND_RE.test(friend)) out.friend = friend;
  const open = params.get('open');
  if (open && (LINK_PANELS as readonly string[]).includes(open)) out.open = open as LinkPanel;
  return out;
}

/**
 * Listen for links that open the app (native only; the web has none after start). `onLink` gets each parsed
 * link, the cold-start one first. Returns a stop function. Unverified on devices: needs a domain with the
 * association files and a signed build (owner steps).
 */
export async function listenForAppLinks(onLink: (link: GameLink) => void): Promise<() => void> {
  const { App } = await import('@capacitor/app');
  const handle = await App.addListener('appUrlOpen', ({ url }) => {
    const link = parseGameLink(url);
    if (link.friend || link.open) onLink(link);
  });
  try {
    const launch = await App.getLaunchUrl();
    if (launch?.url) {
      const link = parseGameLink(launch.url);
      if (link.friend || link.open) onLink(link);
    }
  } catch {
    /* no launch URL on this platform */
  }
  return () => void handle.remove();
}
