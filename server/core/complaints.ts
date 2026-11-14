/**
 * Complaints about illegal or harmful content (backend batch 2026-11-13; EU Digital Services Act art. 16
 * "notice and action", UK Online Safety Act illegal-content and complaints duties). Anyone can send one,
 * with or without the game (POST /v1/complaints, the page at GET /complaints): what it is about, why, and
 * optionally where to answer. Staff see them in the admin queue (/admin/v1/complaints) and close each one
 * with what was done; the record is kept a year after it was handled, then retention removes it (and the
 * optional contact address with it). In-game reports (moderation.ts) stay the main route for players.
 */
import type { ComplaintRequest, ComplaintResponse } from '../../src/backend/net/protocol';
import type { Complaint } from '../repo';
import { type ServerContext } from './context';
import { fail, staffError } from './errors';

const clean = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);

export async function submitComplaint(ctx: ServerContext, body: Partial<ComplaintRequest> | undefined): Promise<ComplaintResponse> {
  const subject = clean(body?.subject, 300);
  const reason = clean(body?.reason, 2000);
  if (!subject) throw fail(400, 'bad_request', 'complaint.subject');
  if (reason.length < 10) throw fail(400, 'bad_request', 'complaint.reason');
  const contact = clean(body?.contact, 200);
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) throw fail(400, 'bad_request', 'complaint.contact');
  const c: Complaint = { id: ctx.uuid(), at: ctx.now(), subject, reason, contact: contact || null, playerId: clean(body?.playerId, 64) || null, status: 'open', resolvedAt: null, resolution: null };
  await ctx.repo.addComplaint(c);
  ctx.metrics.count('tk_complaints_total', {});
  return { id: c.id };
}

export async function complaintQueue(ctx: ServerContext, status: 'open' | 'all'): Promise<{ complaints: Complaint[] }> {
  return { complaints: await ctx.repo.complaints(status, 200) };
}

/** Staff close a complaint with what was done (the statement of reasons when content was acted on). */
export async function resolveComplaint(ctx: ServerContext, actor: string, id: string, body: { resolution?: unknown } | undefined): Promise<Complaint> {
  const resolution = clean(body?.resolution, 1000);
  if (resolution.length < 5) throw staffError(400, 'bad_request', 'Say what was done (resolution).');
  if (!(await ctx.repo.resolveComplaint(String(id), resolution, ctx.now()))) throw staffError(404, 'not_found', 'No open complaint with that id.');
  await ctx.repo.addStaffAction({ id: ctx.uuid(), at: ctx.now(), actor: actor || 'staff', action: 'complaint', playerId: null, detail: { complaint: id, resolution } });
  const all = await ctx.repo.complaints('all', 500);
  return all.find((c) => c.id === id)!;
}

/** The complaint form (GET /complaints), served by the API so it posts to its own origin. English only for now. */
export const COMPLAINT_PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'";

export function complaintPage(supportContact?: string): string {
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Report illegal content · Kagemura</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;background:#f6f3ee;color:#222}main{max-width:640px;margin:auto;padding:16px}label{display:block;margin:12px 0 4px;font-weight:600}input,textarea{width:100%;box-sizing:border-box;font:inherit;padding:8px;border:1px solid #bbb;border-radius:6px}textarea{min-height:120px}button{margin-top:16px;font:inherit;padding:10px 16px;background:#c8402f;color:#fff;border:0;border-radius:6px}.muted{color:#555;font-size:14px}#out{margin-top:12px}</style>
</head><body><main>
<h1>Report illegal content</h1>
<p>Use this form to tell us about content in Kagemura: Ninja Clans that you believe is illegal or harmful: a player, Alliance or Gang name, or a chat message (EU Digital Services Act, UK Online Safety Act). In the game you can also report and block a player from the ⋯ menu next to their message or name.</p>
<p class="muted">If someone is in danger, contact your local emergency services first.${supportContact ? ` Other questions: ${esc(supportContact)}.` : ''}</p>
<label for="subject">What is it about?</label><input id="subject" maxlength="300" placeholder="A player name, Alliance or Gang name, or the message">
<label for="reason">Why is it illegal or harmful?</label><textarea id="reason" maxlength="2000"></textarea>
<label for="contact">Your email, if you want an answer (optional)</label><input id="contact" type="email" maxlength="200">
<label for="player">Your Player ID, if you play (optional)</label><input id="player" maxlength="64">
<button id="send">Send</button>
<p id="out" role="status"></p>
<p class="muted">We keep the complaint and the optional email address only to handle it, and delete them a year after it was handled.</p>
<script>
document.getElementById('send').onclick = async function () {
  var out = document.getElementById('out');
  var v = function (id) { return document.getElementById(id).value; };
  try {
    var res = await fetch('/v1/complaints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ subject: v('subject'), reason: v('reason'), contact: v('contact'), playerId: v('player') }) });
    var data = await res.json();
    out.textContent = res.ok ? 'Thank you. Your complaint was received (reference ' + data.id + ').' : data.message;
  } catch (e) { out.textContent = 'The complaint could not be sent. Check your connection and try again.'; }
};
</script>
</main></body></html>`;
}
