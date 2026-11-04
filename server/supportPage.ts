/**
 * The support page (roadmap step 56): GET /support, the "Support URL" for the
 * store listings. How to get help, what to include (the Player ID from
 * Settings → Account), and links to account deletion and the privacy policy.
 * Self-contained: no scripts, fonts or images.
 */
export const SUPPORT_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function supportPage(o: { email?: string; privacyUrl?: string }): string {
  const contact = o.email
    ? `<p>Write to <a href="mailto:${esc(o.email)}">${esc(o.email)}</a>. We answer within two working days.</p>`
    : '<p>Contact details will be here soon.</p>';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Kagemura support</title>
<style>
:root{--bg:#f6f1e7;--card:#fffdf8;--ink:#2a2420;--muted:#6b6159;--line:#e2d8c8;--accent:#b8402f;color-scheme:light dark}
@media (prefers-color-scheme: dark){:root{--bg:#16130f;--card:#211c17;--ink:#f1e9dc;--muted:#b3a797;--line:#3a322a;--accent:#e0624e}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:640px;margin:0 auto;padding:32px 16px 48px}section{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px 20px;margin:16px 0}
a{color:var(--accent)}h1{margin:0 0 8px}.muted{color:var(--muted)}
</style></head>
<body><main>
<h1>Kagemura support</h1>
<p class="muted">Help with the game, purchases, your account and your privacy.</p>
<section><h2>Contact us</h2>${contact}
<p>Please include your <b>Player ID</b> (in the game: Settings → Online play → Account) and, for a purchase, the date and the store's order number from your receipt.</p></section>
<section><h2>Purchases</h2>
<p>A purchase that did not arrive is delivered when the game next connects; open the Store and tap <b>Restore purchases</b>. Refunds are handled by the App Store or Google Play: what a refunded purchase gave is taken back from your village.</p></section>
<section><h2>Report a player or a message</h2>
<p>In the game, tap <b>⋯</b> next to the message or the player. We look at every report within a day.</p></section>
<section><h2>Delete your account</h2>
<p>In the game: Settings → Online play → Account → Delete account. Without the game: <a href="/account/delete">request deletion on the web</a> (done within 30 days).</p></section>
${o.privacyUrl ? `<section><h2>Privacy</h2><p>Read our <a href="${esc(o.privacyUrl)}">privacy policy</a>.</p></section>` : ''}
</main></body></html>`;
}
