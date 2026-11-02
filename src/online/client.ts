/**
 * Talks to the optional PvP server (server/). Enabled when the build sets
 * VITE_SERVER_URL; otherwise the game plays against generated opponents and
 * bot raiders, fully offline.
 */
import type { BaseLayout, BattleResult, Deployment } from '../sim/battle/types';

export interface RemoteDefense {
  id: string;
  at: number;
  attackerName: string;
  seed: number;
  army: Record<string, number>;
  levels?: Record<string, number>;
  base: BaseLayout;
  deployments: Deployment[];
  endTick?: number;
  result: BattleResult;
  trophies: number;
}

const TOKEN_KEY = 'tk.online.token';

export class OnlineClient {
  private token: string | null = null;
  constructor(readonly baseUrl: string) {
    try {
      this.token = localStorage.getItem(TOKEN_KEY);
    } catch {
      this.token = null;
    }
  }

  private async req<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, '')}${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(this.token ? { authorization: `Bearer ${this.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return undefined as T;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error((json as { error?: string }).error ?? `HTTP ${res.status}`), { status: res.status });
    return json as T;
  }

  async ensureRegistered(name: string): Promise<void> {
    if (this.token) {
      try {
        await this.req('GET', '/v1/me');
        return;
      } catch (e) {
        if ((e as { status?: number }).status !== 401) throw e;
      }
    }
    const r = await this.req<{ token: string }>('POST', '/v1/players', { name });
    this.token = r.token;
    try {
      localStorage.setItem(TOKEN_KEY, r.token);
    } catch {
      /* ignore */
    }
  }

  me(): Promise<{ trophies: number; shieldUntil: number; name: string }> {
    return this.req('GET', '/v1/me');
  }

  uploadBase(base: BaseLayout, name: string): Promise<void> {
    return this.req('PUT', '/v1/base', { base, name });
  }

  async match(): Promise<{ ticket: string; base: BaseLayout } | null> {
    try {
      return await this.req('GET', '/v1/match');
    } catch (e) {
      if ((e as { status?: number }).status === 404) return null;
      throw e;
    }
  }

  submitAttack(body: { ticket: string; seed: number; army: Record<string, number>; levels?: Record<string, number>; deployments: Deployment[]; endTick?: number }): Promise<{ result: BattleResult; trophies: number }> {
    return this.req('POST', '/v1/attacks', body);
  }

  async defenses(since: number): Promise<RemoteDefense[]> {
    return (await this.req<{ defenses: RemoteDefense[] }>('GET', `/v1/defenses?since=${since}`)).defenses;
  }
}
