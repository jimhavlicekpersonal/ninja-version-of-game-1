/**
 * Complaints about illegal or harmful content (backend batch 2026-11-13; EU Digital Services Act art. 16
 * "notice and action", UK Online Safety Act illegal-content and complaints duties). Anyone can send one,
 * with or without the game (POST /v1/complaints, the page at GET /complaints): what it is about, why, and
 * optionally where to answer (the form itself is server/complaintPage.ts). Staff see them in the admin queue (/admin/v1/complaints) and close each one
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
