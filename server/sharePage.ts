/** A friend's share link (roadmap step 59): /f/<code> shows the code and opens the game with it ready to add. */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function sharePage(code: string, gameLink: string | null): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Add me in Kagemura</title>
<style>
:root{--bg:#f6f1e7;--card:#fffdf8;--ink:#2a2420;--muted:#6b6159;--accent:#b8402f;color-scheme:light dark}
@media (prefers-color-scheme: dark){:root{--bg:#16130f;--card:#211c17;--ink:#f1e9dc;--muted:#b3a797;--accent:#e0624e}}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:520px;margin:0 auto;padding:40px 16px;text-align:center}
.code{font:700 32px/1.2 ui-monospace,monospace;letter-spacing:2px;background:var(--card);border-radius:12px;padding:16px;margin:16px 0}
a.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:700}
.muted{color:var(--muted);font-size:15px}
</style></head>
<body><main>
<h1>A friend invited you to Kagemura</h1>
<p>Add them with this friend code:</p>
<div class="code">${esc(code)}</div>
${gameLink ? `<p><a class="btn" href="${esc(gameLink)}">Open Kagemura</a></p>` : ''}
<p class="muted">In the game: Settings → Online play → Friends → Add a friend, and type the code.</p>
</main></body></html>`;
}
