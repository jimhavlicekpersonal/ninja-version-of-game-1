/** An HTTP server on memory with a test clock, for adapter-level tests (backend batch 2026-11-13). */
import { buildServer, type ServerOptions } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { Routes } from '../../../src/backend/net/protocol';
import { defaultData as data } from '../../../src/gameplay/sim/data';

export function setup(opts: Partial<ServerOptions> = {}) {
  let t = Date.UTC(2026, 10, 13);
  const repo = (opts.repo as MemoryRepo | undefined) ?? new MemoryRepo();
  const app = buildServer({ repo, data, now: () => t, ...opts });
  const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, token?: string, payload?: unknown, extra: { ip?: string; headers?: Record<string, string> } = {}) => {
    const r = await app.inject({ method, url, payload: payload as object, remoteAddress: extra.ip, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...extra.headers } });
    return { status: r.statusCode, body: r.body ? JSON.parse(r.body) : null, headers: r.headers };
  };
  const register = async (name: string, ip?: string) => (await call('POST', Routes.players, undefined, { name }, { ip })).body as { playerId: string; token: string };
  return { app, repo, call, register, advance: (ms: number) => (t += ms), now: () => t };
}

