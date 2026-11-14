/**
 * HTTP routes of the growth batch (2026-11-14; docs/PROTOCOL.md "Growth batch"), registered from
 * server/app.ts with one line each (`registerGrowthRoutes`, `registerGrowthStaffRoutes`) so the
 * adapter's own route table stays as it is. Rules live in server/core (referrals.ts, sharedReplays.ts,
 * statsLocal.ts); this file only maps requests.
 *
 * Staff statistics page: GET /admin/stats (and /admin/stats.js), served only where the admin API exists.
 * Like /admin, the page holds no data: staff paste their token (kept in the tab), and the numbers come
 * from the staff API (`/admin/v1/stats`, `/admin/v1/stats/local`, `/admin/v1/stats/funnel`). English only.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { GrowthRoutes } from '../src/backend/net/growth';
import { ADMIN_PAGE_CSP } from './adminPage';
import type { ServerCore } from './core';
import type { RateLimits } from './rateLimit';
import type { Player } from './repo';

type Handler = (me: Player, req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
type Route = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface GrowthHelpers {
  core: ServerCore;
  authed(h: Handler): Route;
  rate(r: keyof RateLimits): { config: { rate?: keyof RateLimits | (keyof RateLimits)[] } };
}

const q = (req: FastifyRequest) => (req.query ?? {}) as Record<string, string | undefined>;
const p = (req: FastifyRequest, k: string) => String((req.params as Record<string, string>)[k] ?? '');

export function registerGrowthRoutes(app: FastifyInstance, h: GrowthHelpers): void {
  const g = h.core.growth;
  app.get(GrowthRoutes.referrals, h.authed(async (me) => g.referrals(me)));
  app.post(GrowthRoutes.referrals, { config: { rate: ['moderation', 'lookup'] as (keyof RateLimits)[] } }, h.authed(async (me, req) => g.linkReferral(me, req.body as never)));
  app.post(GrowthRoutes.referralClaim, h.rate('moderation'), h.authed(async (me) => g.claimReferrals(me)));
  app.post(GrowthRoutes.sharedReplays, { ...h.rate('battle'), bodyLimit: 256 * 1024 }, h.authed(async (me, req, reply) => reply.code(201).send(await g.shareReplay(me, req.body as never))));
  app.get(GrowthRoutes.sharedReplays, h.authed(async (me) => g.myReplays(me)));
  // Anyone with the code may watch (a link opened in a browser has no account).
  app.get('/v1/replays/shared/:code', h.rate('lookup'), async (req, reply) => reply.header('Cache-Control', 'no-store').send(await g.sharedReplay(p(req, 'code'))));
  app.delete('/v1/replays/shared/:code', h.authed(async (me, req) => g.deleteSharedReplay(me, p(req, 'code'))));
}

export function registerGrowthStaffRoutes(app: FastifyInstance, h: { core: ServerCore; staff<T>(fn: (req: FastifyRequest) => Promise<T>): Route }): void {
  app.get('/admin/v1/stats/local', h.staff(async (req) => h.core.growth.statsLocalReport(q(req).days, q(req).basis)));
  app.get('/admin/v1/stats/funnel', h.staff(async (req) => h.core.growth.statsFunnel(q(req).days, q(req).basis)));
  app.get('/admin/stats', async (_req, reply) => reply.type('text/html; charset=utf-8').header('Content-Security-Policy', ADMIN_PAGE_CSP).header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex').send(statsPage()));
  app.get('/admin/stats.js', async (_req, reply) => reply.type('text/javascript; charset=utf-8').header('Cache-Control', 'no-store').send(statsScript()));
}

export function statsPage(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Kagemura play statistics</title>
<style>
body{font:15px/1.45 system-ui,sans-serif;margin:0;background:#f6f3ee;color:#222}
header{background:#2b2a33;color:#fff;padding:10px 16px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
main{padding:16px;max-width:1100px;margin:auto}
input,select,button{font:inherit;padding:6px 8px;border:1px solid #bbb;border-radius:6px}
section{background:#fff;border:1px solid #ddd;border-radius:8px;padding:12px;margin:12px 0;overflow-x:auto}
table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #eee;padding:4px 6px;text-align:right;font-size:14px}th:first-child,td:first-child{text-align:left}
.bar{display:inline-block;height:10px;background:#c8402f;border-radius:2px;vertical-align:middle;margin-left:6px}
.muted{color:#666;font-size:13px}.err{color:#b00020}
</style></head>
<body>
<header><b>Play statistics</b>
<input id="token" type="password" placeholder="Staff token" autocomplete="off">
<select id="basis"><option value="local">Player's local day</option><option value="utc">UTC day</option></select>
<select id="days"><option>14</option><option>30</option><option selected>60</option><option>120</option></select>
<button id="load">Show</button><span id="status" class="muted"></span></header>
<main>
<p class="muted">Only adult players who chose to share send statistics, under a random statistics id (no player id, name or IP address). Rates appear once a cohort is old enough. Local days use the UTC offset the game reported; ids without one count in UTC.</p>
<section><h2>Funnel</h2><div id="funnel"></div></section>
<section><h2>Returns by install day (D1 / D7 / D30)</h2><div id="cohorts"></div></section>
</main>
<script src="/admin/stats.js"></script>
</body></html>`;
}

export function statsScript(): string {
  return `'use strict';
const $ = (id) => document.getElementById(id);
const el = (tag, attrs, ...kids) => { const e = document.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); for (const c of kids) e.append(c instanceof Node ? c : document.createTextNode(String(c ?? ''))); return e; };
const pct = (v) => (v === null || v === undefined ? '…' : (v * 100).toFixed(1) + '%');
$('token').value = sessionStorage.getItem('tk.staff.token') || '';
async function api(path) {
  const res = await fetch(path, { headers: { authorization: 'Bearer ' + $('token').value.trim() } });
  const data = await res.json();
  if (!res.ok) throw new Error((data && data.message) || res.statusText);
  return data;
}
function bar(n, of) { const w = of ? Math.round((n / of) * 200) : 0; return el('span', { class: 'bar', style: 'width:' + w + 'px' }); }
$('load').onclick = async () => {
  sessionStorage.setItem('tk.staff.token', $('token').value.trim());
  const qs = '?days=' + $('days').value + '&basis=' + $('basis').value;
  try {
    const f = await api('/admin/v1/stats/funnel' + qs);
    const rows = [['Installs', f.installs, f.installs]].concat(f.tutorialReached.filter((s) => s.step > 0).map((s) => ['Tutorial step ' + s.step, s.installs, f.installs]), [['Tutorial finished', f.tutorialDone, f.installs], ['First raid within 7 days', f.raided7, f.installs], ['First purchase within 7 days', f.payers7, f.installs], ['Back on day 1', f.d1.returned, f.d1.of], ['Back on day 7', f.d7.returned, f.d7.of], ['Back on day 30', f.d30.returned, f.d30.of]]);
    $('funnel').replaceChildren(el('table', {}, el('tr', {}, el('th', {}, 'Step'), el('th', {}, 'Installs'), el('th', {}, 'Share')), ...rows.map((r) => el('tr', {}, el('td', {}, r[0]), el('td', {}, r[1] + (r[2] !== f.installs ? ' of ' + r[2] : '')), el('td', {}, pct(r[2] ? r[1] / r[2] : null), bar(r[1], r[2]))))));
    const c = await api('/admin/v1/stats/local' + qs);
    $('cohorts').replaceChildren(el('table', {}, el('tr', {}, ...['Install day', 'Arm', 'Installs', 'D1', 'D7', 'D30', 'Tutorial', 'Raid in 7 d', 'Paid in 7 d'].map((h) => el('th', {}, h))), ...c.rows.map((r) => el('tr', {}, el('td', {}, r.date), el('td', {}, r.arm || '-'), el('td', {}, r.installs), el('td', {}, pct(r.d1Rate)), el('td', {}, pct(r.d7Rate)), el('td', {}, pct(r.d30Rate)), el('td', {}, pct(r.installs ? r.tutorialDone / r.installs : null)), el('td', {}, r.raided7), el('td', {}, r.payers7)))));
    $('status').textContent = 'Basis: ' + c.basis + '.';
    $('status').className = 'muted';
  } catch (e) { $('status').textContent = e.message; $('status').className = 'err'; }
};
`;
}
