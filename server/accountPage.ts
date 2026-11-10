import spanishPages from '../locales/compiled/pages-es.json';
import hindiPages from '../locales/compiled/pages-hi.json';
import portuguesePages from '../locales/compiled/pages-pt.json';
import germanPages from '../locales/compiled/pages-de.json';
import frenchPages from '../locales/compiled/pages-fr.json';
import italianPages from '../locales/compiled/pages-it.json';
import chinesePages from '../locales/compiled/pages-zh-Hans.json';
import romanianPages from '../locales/compiled/pages-ro.json';
import catalanPages from '../locales/compiled/pages-ca.json';
import japanesePages from '../locales/compiled/pages-ja.json';
import dutchPages from '../locales/compiled/pages-nl.json';
import swedishPages from '../locales/compiled/pages-sv.json';
import danishPages from '../locales/compiled/pages-da.json';
import norwegianPages from '../locales/compiled/pages-nb.json';

/** Completed page translations (tools/i18n/pages.mjs); every other locale gets English. */
const translatedPages: Record<string, { account: string }> = { es: spanishPages, hi: hindiPages, pt: portuguesePages, de: germanPages, fr: frenchPages, it: italianPages, 'zh-Hans': chinesePages, ro: romanianPages, ca: catalanPages, ja: japanesePages, nl: dutchPages, sv: swedishPages, da: danishPages, nb: norwegianPages };
/**
 * The web account-deletion page (roadmap step 14), served by the API server at
 * GET /account/delete. Google Play asks for a web link where players can ask
 * for their account to be deleted without the app; link this page from the
 * store listings. It posts to POST /v1/account/deletion-requests (same origin).
 * Self-contained: no external fonts, scripts or images.
 *
 * It asks for the Player ID and the one-time deletion code from Settings →
 * Online play → Account (re-audit: player ids are visible to other players,
 * so an id alone does not show the request is the player's), and an optional
 * note, never an email address (worldwide audit GLOBAL-019). A request with a
 * valid code is marked verified and staff carry it out; one without is
 * refused unless support checks ownership another way (core/account.ts
 * resolveDeletion, 'override' with a note). The privacy policy and store
 * declarations say so.
 */

export const DELETION_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function deletionPage(locale = 'en'): string {
  if (Object.hasOwn(translatedPages, locale)) return translatedPages[locale].account;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Delete Kagemura account</title>
<style>
  :root {
    --bg: #f6f1e7; --card: #fffdf8; --ink: #2a2420; --muted: #6b6159; --line: #e2d8c8;
    --accent: #b8402f; --accent-ink: #fff; --ok: #2f6b3a; --field: #fff;
    color-scheme: light dark;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #16130f; --card: #211c17; --ink: #f1e9dc; --muted: #b3a797; --line: #3a322a; --accent: #e0624e; --ok: #7cc48a; --field: #1a1612; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 16px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 32px 16px 48px; }
  h1 { font-size: 1.6rem; line-height: 1.25; margin: 0 0 8px; }
  h2 { font-size: 1.05rem; margin: 28px 0 8px; }
  p, li { color: var(--ink); }
  .muted { color: var(--muted); }
  .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 20px; margin-top: 16px; }
  ul { padding-left: 20px; margin: 8px 0; }
  label { display: block; font-weight: 600; margin: 14px 0 4px; }
  label span { font-weight: 400; color: var(--muted); }
  input, textarea { width: 100%; font: inherit; color: var(--ink); background: var(--field); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; }
  textarea { min-height: 88px; resize: vertical; }
  input:focus, textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
  button { margin-top: 18px; font: inherit; font-weight: 600; background: var(--accent); color: var(--accent-ink); border: 0; border-radius: 8px; padding: 11px 18px; cursor: pointer; }
  button[disabled] { opacity: .6; cursor: default; }
  #result { margin-top: 14px; font-weight: 600; }
  #result.ok { color: var(--ok); }
  #result.error { color: var(--accent); }
</style>
</head>
<body>
<main>
  <h1>Delete your Kagemura online account</h1>
  <p class="muted">Kagemura: Ninja Clans</p>

  <div class="card">
    <h2 style="margin-top:0">In the game (fastest)</h2>
    <p>Open <b>Settings → Online play → Account → Delete online account</b>. Your online account is deleted at once. This works even if you switched to <b>Play offline</b>: the game connects just to delete it.</p>
  </div>

  <h2>What is deleted</h2>
  <ul>
    <li>Your player name and online account, the base you shared for raids, and your village if it is kept on our server.</li>
    <li>Your friends and friend requests, your Gang membership and your linked sign-ins.</li>
    <li>Raids on your village, your Alliance membership, your chat messages, warrior requests and warriors sent to you.</li>
  </ul>
  <h2>What other players keep</h2>
  <ul>
    <li>Replays of raids you made stay with the players you raided, shown as "Deleted player". Warriors you sent and Alliance War results stay the same way, without your name.</li>
    <li>Copies of your base in other players' recent battles are removed within 30 days.</li>
  </ul>
  <p class="muted">A village saved on your device stays there: to remove it, uninstall the app, or clear the game site's data in your browser. Purchase records are kept without your Player ID, as tax and refund rules require.</p>

  <div class="card">
    <h2 style="margin-top:0">Deleting from the web</h2>
    <p>Other players can see Player IDs, so we need proof that the account is yours: a <b>deletion code</b>. Get one in the game under <b>Settings → Online play → Account → Get a deletion code</b> (it works once, for 30 days), then send it here with your Player ID from the same screen. Staff delete a request with a valid code within 30 days, usually much sooner.</p>
    <p class="muted">No code, and you can't open the game any more? Send your Player ID anyway and contact support from the game's support page with the reference you get: we can only delete the account once we can confirm it is yours (for example through the Apple, Google or Game Center sign-in linked to it, or a store receipt). We don't ask for an email address here.</p>
    <form id="f" novalidate>
      <label for="playerId">Player ID</label>
      <input id="playerId" name="playerId" autocomplete="off" maxlength="64">
      <label for="code">Deletion code <span>(from Settings → Online play → Account)</span></label>
      <input id="code" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="16" placeholder="XXXXX-XXXXX">
      <label for="note">Anything else <span>(optional; please don't include contact details)</span></label>
      <textarea id="note" name="note" maxlength="1000"></textarea>
      <button id="send" type="submit">Request deletion</button>
      <div id="result" role="status" aria-live="polite"></div>
    </form>
  </div>
</main>
<script>
  const form = document.getElementById('f');
  const out = document.getElementById('result');
  const send = document.getElementById('send');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    const body = { playerId: data.playerId, code: data.code, note: data.note };
    if (!String(body.playerId || '').trim()) {
      out.className = 'error';
      out.textContent = 'Enter your Player ID (Settings → Online play → Account).';
      return;
    }
    send.disabled = true;
    out.className = '';
    out.textContent = 'Sending…';
    try {
      const res = await fetch(new URL('../v1/account/deletion-requests', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'The request did not go through. Try again later.');
      out.className = json.verified ? 'ok' : 'error';
      out.textContent = json.verified
        ? 'Request received and confirmed with your code. Your reference: ' + json.id
        : 'Request received, but without a valid deletion code we cannot confirm the account is yours. Your reference: ' + json.id + '. Get a code in the game, or contact support with this reference.';
      form.reset();
    } catch (err) {
      out.className = 'error';
      out.textContent = err.message;
    } finally {
      send.disabled = false;
    }
  });
</script>
</body>
</html>
`;
}
