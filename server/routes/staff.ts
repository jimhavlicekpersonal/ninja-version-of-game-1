/** Routes: the staff API (/admin/v1/…). Only registered with staff tokens; `staff` checks the token first (server/app.ts). */
import type { RouteInput, RouteSpec } from './kit';
import type { ServerCore } from '../core';
import { body, fields, number, object, params, query, string } from './schema';

type Method = 'GET' | 'POST';
type Empty = Record<never, never>;
export type StaffRoute = <B = undefined, Q = Empty, P = Empty>(method: Method, url: string, spec: RouteSpec<B, Q, P>, handler: (actor: string, input: RouteInput<B, Q, P>) => Promise<unknown>) => void;

const status = query('status');
const id = params('id');
const note = body(fields<{ note: string }>()({ note: string() }));
const queue = (q: { status?: string }) => (q.status === 'all' ? 'all' : 'open');

/** `ip`: the caller's address as the rate limits see it (backend A31). */
export function staffRoutes(staff: StaffRoute, core: ServerCore, ip: (input: RouteInput<undefined, Empty, Empty>) => unknown): void {
  staff('GET', '/admin/v1/deletion-requests', { query: status }, async (_a, { query }) => core.admin.deletionQueue(queue(query)));
  staff('POST', '/admin/v1/deletion-requests/:id', { params: id, body: body(fields<{ action: string; note: string }>()({ action: string(), note: string() })) }, async (_a, { params, body }) => core.admin.resolveDeletion(params.id, body?.action, body?.note));
  staff('GET', '/admin/v1/reports', { query: status }, async (_a, { query }) => core.admin.reportQueue(queue(query)));
  staff('POST', '/admin/v1/reports/:id', { params: id, body: body(fields<{ action: string; hours: number; note: string }>()({ action: string(), hours: number(), note: string() })) }, async (_a, { params, body }) => core.admin.resolveReport(params.id, body));
  // The admin tool (roadmap step 48): player lookup, give/take, suspend, rating reset, staff log.
  staff('GET', '/admin/v1/players', { query: query('q') }, async (_a, { query }) => core.admin.search(query.q));
  staff('GET', '/admin/v1/players/:id', { params: id }, async (_a, { params }) => core.admin.player(params.id));
  // Japan C17: the unused paid Jade balance on a 資金決済法 base date (?date=YYYY-03-31|YYYY-09-30; default the latest).
  staff('GET', '/admin/v1/reports/jp-unused-balance', { query: query('date') }, async (actor, { query }) => core.admin.japanBalance(actor, query.date));
  staff('POST', '/admin/v1/players/:id/adjust', { params: id, body: body(fields<{ resources: object; note: string }>()({ resources: object(), note: string() })) }, async (actor, { params, body }) => core.admin.adjust(actor, params.id, body));
  staff('POST', '/admin/v1/players/:id/ban', { params: id, body: body(fields<{ hours: number; reason: string }>()({ hours: number(), reason: string() })) }, async (actor, { params, body }) => core.admin.ban(actor, params.id, body));
  staff('POST', '/admin/v1/players/:id/reset-rating', { params: id, body: body(fields<{ which: string; note: string }>()({ which: string(), note: string() })) }, async (actor, { params, body }) => core.admin.resetRating(actor, params.id, body));
  staff('POST', '/admin/v1/players/:id/reset-age', { params: id, body: note }, async (actor, { params, body }) => core.admin.resetAge(actor, params.id, body));
  staff('GET', '/admin/v1/actions', {}, async () => core.admin.actions());
  // Backend batch 2026-11-13: replace an offending name, release a held import (GLOBAL-002), complaints.
  staff('POST', '/admin/v1/players/:id/rename', { params: id, body: body(fields<{ name: string; reason: string }>()({ name: string(), reason: string() })) }, async (actor, { params, body }) => core.admin.rename(actor, params.id, body));
  staff('POST', '/admin/v1/players/:id/import-holds/:hold/release', { params: params('id', 'hold'), body: note }, async (actor, { params, body }) => core.admin.releaseImportHold(actor, params.id, params.hold, body));
  staff('GET', '/admin/v1/complaints', { query: status }, async (_a, { query }) => core.admin.complaintQueue(queue(query)));
  staff('POST', '/admin/v1/complaints/:id', { params: id, body: body(fields<{ resolution: string }>()({ resolution: string() })) }, async (actor, { params, body }) => core.admin.resolveComplaint(actor, params.id, body));
  staff('GET', '/admin/v1/stats', { query: query('days') }, async (_a, { query }) => core.statsReport(query.days));
  // Backend A31: what this server sees as the caller's address, to check TRUST_PROXY after a deploy.
  staff('GET', '/admin/v1/ip', {}, async (_a, input) => ip(input));
}
