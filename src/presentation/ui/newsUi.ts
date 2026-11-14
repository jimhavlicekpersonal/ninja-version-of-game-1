/**
 * News and messages (retention audit G17): one place for what the game and its operators said, with no new server
 * protocol. It lists the operators' notice (`/v1/hello` `notice`), the moderators' notices (`Connection.notices`), the
 * running or next event, actions the server refused (GLOBAL-009) and the messages this session showed as toasts.
 * The rail badge counts only what is new and was not seen as it happened: an unread moderator notice or a new
 * operators' notice.
 */
import { t, dateText, messageText } from './i18n';
import { h } from './dom';

export interface NewsItem {
  at: number;
  text: string;
  kind: 'info' | 'error' | 'success';
}

interface NewsSource {
  /** The operators' notice for everyone (server hello), if any. */
  serverNotice: string | null;
  /** The server is a test server (its environment name). */
  testServer: string | null;
  notices: readonly { id: string; at: number; kind: string; text: string; read: boolean }[];
  /** Actions the server refused since this start (the village had changed elsewhere). */
  refused: number;
  /** The running or next event, in words. */
  event: string;
  /** Toasts this session, newest first. */
  recent: readonly NewsItem[];
  online: boolean;
}

const SEEN_KEY = 'tk.newsSeen';

/** A short fingerprint of the operators' notice, to tell a new one from one already read. */
export function noticeKey(text: string | null): string {
  if (!text) return '';
  let x = 0;
  for (let i = 0; i < text.length; i++) x = (Math.imul(x, 31) + text.charCodeAt(i)) | 0;
  return `${text.length}:${(x >>> 0).toString(36)}`;
}

/** How many things wait in the panel (the rail badge). */
export function unseenNews(src: Pick<NewsSource, 'serverNotice' | 'notices'>, seenNotice: string): number {
  const unread = src.notices.filter((n) => !n.read).length;
  const fresh = src.serverNotice && noticeKey(src.serverNotice) !== seenNotice ? 1 : 0;
  return unread + fresh;
}

export function seenNoticeKey(): string {
  try {
    return localStorage.getItem(SEEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function markNoticeSeen(text: string | null): void {
  try {
    localStorage.setItem(SEEN_KEY, noticeKey(text));
  } catch {
    /* this session only */
  }
}

/** The panel body. */
export function newsBody(src: NewsSource): HTMLElement {
  const body = h('div', { class: 'news' });
  const section = (title: string, ...rows: (HTMLElement | null)[]) => {
    const list = rows.filter((r): r is HTMLElement => Boolean(r));
    if (list.length) body.append(h('h3', {}, title), ...list);
  };
  section(
    t('news.operators'),
    src.serverNotice ? h('p', { class: 'store-note', dir: 'auto' }, src.serverNotice) : null,
    src.testServer ? h('p', { class: 'muted small' }, t('ui.this_is_a_server_for_testing_villages__7c82ee8a8b', { arg1: src.testServer })) : null,
  );
  section(
    t('ui.from_our_moderators_6bf6a30047'),
    ...src.notices.slice(0, 10).map((n) => h('div', { class: `log-row notice${n.read ? '' : ' unread'}` }, h('div', {}, h('div', { class: 'muted small' }, dateText(n.at)), h('div', { dir: 'auto' }, messageText(n.text))))),
  );
  section(t('rail.Events'), h('p', {}, src.event));
  section(t('news.village'), src.refused > 0 ? h('p', { class: 'note' }, t('sync.refused', { n: src.refused })) : null);
  section(
    t('news.recent'),
    ...src.recent.slice(0, 20).map((m) => h('div', { class: `log-row news-${m.kind}` }, h('div', { dir: 'auto' }, m.text), h('span', { class: 'muted small' }, dateText(m.at, { timeStyle: 'short' })))),
  );
  if (!src.online) body.append(h('p', { class: 'muted small' }, t('news.offline')));
  return body;
}
