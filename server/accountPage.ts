/**
 * The web account-deletion page (roadmap step 14), served by the API server at
 * GET /account/delete. Google Play asks for a web link where players can ask
 * for their account to be deleted without the app; link this page from the
 * store listings. It posts to POST /v1/account/deletion-requests (same origin).
 * Self-contained: no external fonts, scripts or images.
 */

export const DELETION_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function deletionPage(): string {
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
    <p>Open <b>Settings → Online play → Delete online account</b>. Your online account is deleted at once.</p>
  </div>

  <h2>What is deleted</h2>
  <ul>
    <li>Your player name and online account, and the base you shared for raids.</li>
    <li>Raids on your village, your Alliance membership, your chat messages, troop requests and troops sent to you.</li>
  </ul>
  <h2>What other players keep</h2>
  <ul>
    <li>Replays of raids you made stay with the players you raided, shown as "Deleted player". Troops you sent and Alliance War results stay the same way, without your name.</li>
    <li>Copies of your base in other players' recent battles are removed within 30 days.</li>
  </ul>
  <p class="muted">Your village itself is saved only on your device. To remove it, uninstall the app, or clear this site's data in your browser.</p>

  <div class="card">
    <h2 style="margin-top:0">Can't open the game any more?</h2>
    <p>Send a request. We check that the account is yours and delete it within 30 days, usually much sooner. Your Player ID is in Settings → Online play.</p>
    <form id="f" novalidate>
      <label for="playerId">Player ID</label>
      <input id="playerId" name="playerId" autocomplete="off" maxlength="64">
      <label for="name">Player name <span>(if you don't have the ID)</span></label>
      <input id="name" name="name" autocomplete="nickname" maxlength="40">
      <label for="contact">How we can reach you <span>(optional, e.g. an email address)</span></label>
      <input id="contact" name="contact" autocomplete="email" maxlength="200">
      <label for="note">Anything else <span>(optional)</span></label>
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
    const body = Object.fromEntries(new FormData(form).entries());
    if (!String(body.playerId || '').trim() && !String(body.name || '').trim()) {
      out.className = 'error';
      out.textContent = 'Enter your Player ID or your player name.';
      return;
    }
    send.disabled = true;
    out.className = '';
    out.textContent = 'Sending…';
    try {
      const res = await fetch(new URL('../v1/account/deletion-requests', location.href), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || 'The request did not go through. Try again later.');
      out.className = 'ok';
      out.textContent = 'Request received. Your reference: ' + json.id;
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
