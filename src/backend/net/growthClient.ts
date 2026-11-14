/**
 * The game's side of the growth batch routes (2026-11-14; `growth.ts`): friend invites and shared
 * replays. It rides on the connection's HTTP adapter (`HttpServerAdapter.call`, so the same token,
 * headers and error codes), and is available only while the server lists the feature. A shared replay
 * is fetched without a token (`fetchSharedReplay`): a link opened in a browser has no account.
 */
import { GrowthRoutes, type ReferralView, type ShareReplayRequest, type ShareReplayResponse, type SharedReplayView } from './growth';
import { messageParts } from '../../../locales/runtime';
import { normalizeServerUrl } from './httpAdapter';
import type { ErrorBody } from './protocol';
import { ServerError } from './ports';

interface Caller {
  call<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T>;
}

/** What the growth client needs from `Connection` (kept narrow so tests can fake it). */
export interface GrowthLink {
  readonly online: boolean;
  readonly server: { features: string[] } | null;
  readonly port: unknown;
  readonly village?: { device?: string } | null;
}

export class GrowthClient {
  constructor(private readonly link: GrowthLink) {}

  private caller(): Caller | null {
    const p = this.link.port as Partial<Caller> | null;
    return p && typeof p.call === 'function' ? (p as Caller) : null;
  }

  private has(feature: string): boolean {
    return this.link.online && Boolean(this.link.server?.features.includes(feature)) && this.caller() !== null;
  }

  get canRefer(): boolean {
    return this.has('referrals');
  }

  get canShareReplays(): boolean {
    return this.has('shared-replays');
  }

  referrals(): Promise<ReferralView> {
    return this.caller()!.call('GET', GrowthRoutes.referrals);
  }

  enterCode(code: string): Promise<ReferralView> {
    const device = this.link.village?.device;
    return this.caller()!.call('POST', GrowthRoutes.referrals, { code, ...(device ? { device } : {}) });
  }

  claim(): Promise<ReferralView> {
    return this.caller()!.call('POST', GrowthRoutes.referralClaim);
  }

  share(req: ShareReplayRequest): Promise<ShareReplayResponse> {
    return this.caller()!.call('POST', GrowthRoutes.sharedReplays, req);
  }

  deleteShare(code: string): Promise<{ deleted: boolean }> {
    return this.caller()!.call('DELETE', GrowthRoutes.sharedReplay(code));
  }
}

/** Open a shared replay by code from any server address (no token). */
export async function fetchSharedReplay(serverUrl: string, code: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<SharedReplayView> {
  const base = normalizeServerUrl(serverUrl);
  if (!base) throw new ServerError(0, 'network', 'No server is set for this game.');
  let res: Response;
  try {
    res = await fetchFn(`${base}${GrowthRoutes.sharedReplay(code)}`, { credentials: 'omit' });
  } catch {
    throw new ServerError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }
  const body = (await res.json().catch(() => null)) as (SharedReplayView & Partial<ErrorBody>) | null;
  if (!res.ok || !body) {
    const err = (body ?? {}) as Partial<ErrorBody>;
    throw new ServerError(res.status, err.error ?? (res.status >= 500 ? 'network' : 'bad_request'), err.message ?? `Server answered ${res.status}.`, err.key ? messageParts([{ key: err.key, params: err.params }, ...(Array.isArray(err.more) ? err.more : [])]) : undefined);
  }
  return body;
}
