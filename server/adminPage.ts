/**
 * The admin tool's page (roadmap step 48): GET /admin, only when the server
 * has an ADMIN_TOKEN. Staff paste the token (kept in this tab only), find a
 * player, and use the staff API (/admin/v1/…). No player data is in the page
 * itself; everything comes from the API with the token.
 */
export const ADMIN_PAGE_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'none'; frame-ancestors 'none'; base-uri 'none'";

export function adminPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kagemura staff</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;margin:0;background:#f6f3ee;color:#222}
header{background:#2b2a33;color:#fff;padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
header input{min-width:220px}
main{padding:16px;max-width:1100px;margin:auto}
input,select,button{font:inherit;padding:6px 8px;border:1px solid #bbb;border-radius:6px}
button{background:#fff;cursor:pointer}button.primary{background:#c8402f;color:#fff;border-color:#c8402f}
section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:left;font-size:14px;vertical-align:top}
.muted{color:#666;font-size:13px}.row{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0}
.err{color:#b00020}.ok{color:#1b7f3a}pre{white-space:pre-wrap;font-size:12px;margin:0}
</style></head>
<body>
<header><b>Kagemura staff</b>
<input id="token" type="password" placeholder="Staff token" autocomplete="off">
<input id="actor" placeholder="Your name (for the log)">
<button id="save">Use</button>
<span id="status" class="muted"></span></header>
<main>
<section><div class="row"><input id="q" placeholder="Player name or id"><button id="find" class="primary">Find</button>
<button id="queues">Reports and deletion requests</button><button id="review">Weekly review</button><button id="log">Staff log</button></div>
<div id="results"></div></section>
<div id="detail"></div>
</main>
<script src="/admin/app.js"></script>
</body></html>`;
}

/** The page's script (served from /admin/app.js so the CSP needs no inline script). */
export function adminScript(): string {
  return `'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); } for (const c of kids) e.append(c instanceof Node ? c : document.createTextNode(String(c ?? ''))); return e; };
const when = (t) => (t ? new Date(t).toISOString().replace('T', ' ').slice(0, 16) + ' UTC' : '');
$('token').value = sessionStorage.getItem('tk.staff.token') || '';
$('actor').value = sessionStorage.getItem('tk.staff.actor') || '';
$('save').onclick = () => { sessionStorage.setItem('tk.staff.token', $('token').value.trim()); sessionStorage.setItem('tk.staff.actor', $('actor').value.trim()); status('Saved for this tab.', true); };
function status(text, ok) { $('status').textContent = text; $('status').className = ok ? 'ok' : 'err'; }
async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { authorization: 'Bearer ' + (sessionStorage.getItem('tk.staff.token') || ''), 'x-staff-name': sessionStorage.getItem('tk.staff.actor') || 'staff', ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((data && data.message) || res.statusText);
  return data;
}
function table(rows, cols) {
  return el('table', {}, el('tr', {}, ...cols.map((c) => el('th', {}, c[0]))), ...rows.map((r) => el('tr', {}, ...cols.map((c) => el('td', {}, c[1](r))))));
}
$('find').onclick = async () => {
  try {
    const r = await api('GET', '/admin/v1/players?q=' + encodeURIComponent($('q').value.trim()));
    $('results').replaceChildren(table(r.players, [['Name', (p) => el('a', { href: '#', onclick: (e) => { e.preventDefault(); show(p.id); } }, p.name)], ['Id', (p) => p.id], ['Keep', (p) => p.keep], ['Honor', (p) => p.honor], ['Last seen', (p) => when(p.lastSeenAt)], ['Banned', (p) => (p.banned ? 'until ' + when(p.banned.until) : '')]]));
  } catch (e) { status(e.message); }
};
$('q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('find').click(); });
async function show(id) {
  try { render(await api('GET', '/admin/v1/players/' + encodeURIComponent(id))); } catch (e) { status(e.message); }
}
function render(d) {
  const p = d.player;
  const box = el('div', {});
  box.append(el('section', {}, el('h2', {}, p.name), el('p', { class: 'muted' }, 'Id ' + p.id + ' · Keep ' + p.keep + ' · Honor ' + p.honor + ' · joined ' + when(p.createdAt) + ' · last seen ' + when(p.lastSeenAt)),
    el('p', {}, p.banned ? 'Suspended until ' + when(p.banned.until) + ': ' + (p.banned.reason || '') : 'Not suspended.'),
    el('p', { class: 'muted' }, 'Sign-ins: ' + (d.links.map((l) => l.provider).join(', ') || 'none') + ' · Alliance: ' + (d.alliance ? d.alliance.id + ' (' + d.alliance.role + ')' : 'none') + ' · Ratings: ' + (p.ratings ? 'attack ' + Math.round(p.ratings.attack.rating) + ' (' + p.ratings.attack.battles + '), base ' + Math.round(p.ratings.base.rating) + ' (' + p.ratings.base.battles + ')' : 'not rated'))));
  // Actions
  const hours = el('input', { type: 'number', min: '0', value: '24', style: 'width:6em' });
  const reason = el('input', { placeholder: 'Reason (the player sees it)' });
  const resKind = el('select', {}, ...['moonstones', 'acorns', 'dew', 'nightsap'].map((k) => el('option', { value: k }, k)));
  const amount = el('input', { type: 'number', value: '0', style: 'width:8em' });
  const note = el('input', { placeholder: 'Why (ledger and staff log)' });
  const which = el('select', {}, el('option', { value: 'both' }, 'both'), el('option', { value: 'attack' }, 'attack'), el('option', { value: 'base' }, 'base'));
  const act = (path, body) => async () => { try { render(await api('POST', '/admin/v1/players/' + encodeURIComponent(p.id) + path, body())); status('Done.', true); } catch (e) { status(e.message); } };
  box.append(el('section', {}, el('h3', {}, 'Actions'),
    el('div', { class: 'row' }, 'Suspend for', hours, 'hours', reason, el('button', { onclick: act('/ban', () => ({ hours: Number(hours.value), reason: reason.value })) }, 'Suspend'), el('button', { onclick: act('/ban', () => ({ hours: 0 })) }, 'Lift suspension')),
    el('div', { class: 'row' }, 'Give (or take, with a minus)', amount, resKind, note, el('button', { onclick: act('/adjust', () => ({ resources: { [resKind.value]: Number(amount.value) }, note: note.value })) }, 'Apply'), el('span', { class: 'muted' }, d.village ? '' : 'Village on the device: cannot be changed here.')),
    el('div', { class: 'row' }, 'Reset ratings', which, el('button', { onclick: act('/reset-rating', () => ({ which: which.value })) }, 'Reset'))));
  if (d.village) box.append(el('section', {}, el('h3', {}, 'Village on the server'), el('pre', {}, JSON.stringify({ revision: d.village.revision, at: when(d.village.at), resources: d.village.resources, army: d.village.army, buildings: d.village.buildings }, null, 1))));
  box.append(el('section', {}, el('h3', {}, 'Ledger'), table(d.ledger, [['When', (l) => when(l.at)], ['Resource', (l) => l.resource], ['Change', (l) => l.delta], ['Balance', (l) => l.balance], ['Why', (l) => l.reason]])));
  box.append(el('section', {}, el('h3', {}, 'Purchases'), table(d.purchases, [['When', (x) => when(x.at)], ['Store', (x) => x.store], ['Product', (x) => x.productId], ['USD', (x) => (x.cents / 100).toFixed(2)], ['Env', (x) => x.environment], ['Status', (x) => x.status]])));
  box.append(el('section', {}, el('h3', {}, 'Defenses (7 days)'), table(d.defenses, [['When', (x) => when(x.at)], ['Attacker', (x) => x.attacker], ['Stars', (x) => x.stars], ['%', (x) => x.destruction], ['Honor', (x) => x.honor]])));
  box.append(el('section', {}, el('h3', {}, 'Staff log'), table(d.staffActions, [['When', (x) => when(x.at)], ['Who', (x) => x.actor], ['What', (x) => x.action], ['Detail', (x) => JSON.stringify(x.detail)]])));
  $('detail').replaceChildren(box);
}
$('queues').onclick = async () => {
  try {
    const [reports, deletions] = await Promise.all([api('GET', '/admin/v1/reports'), api('GET', '/admin/v1/deletion-requests')]);
    $('detail').replaceChildren(
      el('section', {}, el('h3', {}, 'Open reports'), table(reports.reports, [['Due', (r) => (r.overdue ? 'OVERDUE ' : '') + when(r.dueAt)], ['When', (r) => when(r.at)], ['About', (r) => el('a', { href: '#', onclick: (e) => { e.preventDefault(); show(r.targetId); } }, r.targetName || r.targetId)], ['Reason', (r) => r.reason], ['Text', (r) => r.text || ''], ['Id', (r) => r.id]]), el('p', { class: 'muted' }, 'Resolve with POST /admin/v1/reports/:id (dismiss, remove_message, mute).')),
      el('section', {}, el('h3', {}, 'Deletion requests'), table(deletions.requests, [['Due', (r) => (r.overdue ? 'OVERDUE ' : '') + when(r.dueAt)], ['When', (r) => when(r.at)], ['Player', (r) => r.playerId || r.name], ['Contact', (r) => r.contact], ['Note', (r) => r.note], ['Id', (r) => r.id]]), el('p', { class: 'muted' }, 'Carry out with POST /admin/v1/deletion-requests/:id (delete or reject).')));
  } catch (e) { status(e.message); }
};
$('review').onclick = async () => {
  try {
    const r = await api('GET', '/admin/v1/review?days=7');
    $('detail').replaceChildren(
      el('section', {}, el('h3', {}, 'Needs attention'), r.attention.length ? el('ul', {}, ...r.attention.map((a) => el('li', {}, a))) : el('p', { class: 'ok' }, 'Nothing stands out this week.')),
      el('section', {}, el('h3', {}, 'Players and battles'), el('p', {}, 'Active ' + r.players.active + ' of ' + r.players.total + ' · new ' + r.players.new + ' · suspended ' + r.players.banned + ' · PvP battles ' + r.battles.total + ' · desyncs ' + r.battles.desyncs + ' (' + r.rates.desync + '%)')),
      el('section', {}, el('h3', {}, 'Money'), el('p', {}, r.purchases.count + ' purchases, $' + (r.purchases.cents / 100).toFixed(2) + ' · refunds ' + r.purchases.refunds + ' ($' + (r.purchases.refundedCents / 100).toFixed(2) + ', ' + r.rates.refund + '%)')),
      el('section', {}, el('h3', {}, 'Economy (server-held villages)'), table(r.economy, [['Resource', (e) => e.resource], ['In', (e) => e.in], ['Out', (e) => e.out], ['Net', (e) => e.net], ['Biggest source', (e) => e.biggestSource || ''], ['Biggest sink', (e) => e.biggestSink || '']])),
      el('section', {}, el('h3', {}, 'Ratings and Honor'), el('p', {}, 'Rated ' + r.ratings.rated + ' · Attack Rating mean ' + r.ratings.attackMean + ', spread ' + r.ratings.attackSd + ' · median deviation ' + r.ratings.medianRd + ' · Honor p50 ' + r.honor.p50 + ', p90 ' + r.honor.p90 + ', p99 ' + r.honor.p99 + ', top ' + r.honor.max)),
      el('section', {}, el('h3', {}, 'Ledger by reason'), table(r.ledger, [['Reason', (l) => l.reason], ['Resource', (l) => l.resource], ['Change', (l) => l.delta], ['Lines', (l) => l.lines]])));
  } catch (e) { status(e.message); }
};
$('log').onclick = async () => {
  try { const r = await api('GET', '/admin/v1/actions'); $('detail').replaceChildren(el('section', {}, el('h3', {}, 'Staff log'), table(r.actions, [['When', (x) => when(x.at)], ['Who', (x) => x.actor], ['What', (x) => x.action], ['Player', (x) => x.playerId || ''], ['Detail', (x) => JSON.stringify(x.detail)]]))); } catch (e) { status(e.message); }
};
`;
}
