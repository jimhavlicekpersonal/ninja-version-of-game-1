/**
 * The HTTP adapter's deadline covers the whole answer (worldwide audit
 * GLOBAL-012): slow headers, a stalled body and a cut-off JSON answer all end
 * in the same retryable `network` error, and the retry rules stay as they
 * were (reads retried, writes left to tickets and the outbox, one
 * Idempotency-Key per attempt).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpServerAdapter, memoryTokenStore } from '../../../src/backend/net/httpAdapter';
import { ServerError } from '../../../src/backend/net/ports';
import { ClientHeaders } from '../../../src/backend/net/protocol';

const TIMEOUT = 15_000;

type Call = { url: string; init: RequestInit };

function adapter(answer: (call: Call, i: number) => Promise<Response>, opts: { retries?: number } = {}) {
  const calls: Call[] = [];
  const fetch = ((url: string, init: RequestInit) => {
    const call = { url, init };
    calls.push(call);
    return answer(call, calls.length - 1);
  }) as unknown as typeof globalThis.fetch;
  const port = new HttpServerAdapter('https://example.test', { tokens: memoryTokenStore('t'), fetch, timeoutMs: TIMEOUT, retries: opts.retries ?? 0, retryDelayMs: 0 });
  return { port, calls };
}

/** A body that sends part of its JSON and then never finishes (and ignores aborts, like a broken proxy). */
const stalledBody = (start = '{"id": "p1", "name": "Ab') =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(start));
    },
  });

/** Settle a promise under fake timers: its value, its error, or 'pending'. */
async function settle<T>(p: Promise<T>, ms: number): Promise<{ value?: T; error?: unknown } | 'pending'> {
  let out: { value?: T; error?: unknown } | 'pending' = 'pending';
  p.then(
    (value) => (out = { value }),
    (error) => (out = { error }),
  );
  await vi.advanceTimersByTimeAsync(ms);
  return out;
}

function expectTimeout(out: Awaited<ReturnType<typeof settle>>) {
  expect(out).not.toBe('pending');
  const e = (out as { error?: unknown }).error;
  expect(e).toBeInstanceOf(ServerError);
  expect((e as ServerError).code).toBe('network');
  expect((e as ServerError).retryable).toBe(true);
  expect((e as ServerError).message).toBe('The server took too long to answer.');
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('HttpServerAdapter deadlines', () => {
  it('slow headers: aborts at the deadline with a retryable network error', async () => {
    const { port, calls } = adapter(
      ({ init }) =>
        new Promise<Response>((_, reject) => {
          init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        }),
    );
    const p = port.me();
    expect(await settle(p, TIMEOUT - 1)).toBe('pending');
    expectTimeout(await settle(p, 1));
    expect(calls[0].init.signal?.aborted).toBe(true);
  });

  it('a fetch that ignores the abort signal still settles at the deadline', async () => {
    const { port } = adapter(() => new Promise<Response>(() => undefined));
    expectTimeout(await settle(port.me(), TIMEOUT));
  });

  it('stalled body after the headers: rejects at the deadline (the timer is not cleared at the headers)', async () => {
    const { port, calls } = adapter(async () => new Response(stalledBody(), { status: 200, headers: { 'content-type': 'application/json' } }));
    const p = port.me();
    expect(await settle(p, TIMEOUT - 1)).toBe('pending');
    expectTimeout(await settle(p, 1));
    expect(calls[0].init.signal?.aborted).toBe(true);
  });

  it('a stalled body on an error status also settles at the deadline', async () => {
    const { port } = adapter(async () => new Response(stalledBody('{"error": "busy"'), { status: 503 }));
    expectTimeout(await settle(port.me(), TIMEOUT));
  });

  it('a GET whose body stalled is retried like any network failure', async () => {
    const { port, calls } = adapter(async (_c, i) => (i === 0 ? new Response(stalledBody(), { status: 200 }) : Response.json({ id: 'p1', name: 'Ab' })), { retries: 1 });
    const out = await settle(port.me(), TIMEOUT);
    expect(out).toEqual({ value: { id: 'p1', name: 'Ab' } });
    expect(calls).toHaveLength(2);
  });

  it('leaves no timer behind after a good answer', async () => {
    const { port } = adapter(async () => Response.json({ id: 'p1' }));
    expect(await settle(port.me(), 0)).toEqual({ value: { id: 'p1' } });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('HttpServerAdapter unreadable answers', () => {
  it('truncated JSON on a 200 is a retryable network error, never "no data"', async () => {
    const { port } = adapter(async () => new Response('{"id": "p1", "na', { status: 200 }));
    const out = await settle(port.me(), 0);
    const e = (out as { error?: unknown }).error as ServerError;
    expect(e).toBeInstanceOf(ServerError);
    expect(e.code).toBe('network');
    expect(e.retryable).toBe(true);
    expect(e.message).toMatch(/cut off/);
  });

  it('a body that breaks off mid-read is a retryable network error', async () => {
    const broken = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"id"'));
        c.error(new TypeError('terminated'));
      },
    });
    const { port } = adapter(async () => new Response(broken, { status: 200 }));
    const e = ((await settle(port.me(), 0)) as { error?: unknown }).error as ServerError;
    expect(e).toBeInstanceOf(ServerError);
    expect(e.code).toBe('network');
    expect(e.retryable).toBe(true);
  });

  it('reads with a cut-off answer are retried and succeed', async () => {
    const { port, calls } = adapter(async (_c, i) => (i === 0 ? new Response('{"id": "p', { status: 200 }) : Response.json({ id: 'p1' })), { retries: 2 });
    expect(await settle(port.me(), 0)).toEqual({ value: { id: 'p1' } });
    expect(calls).toHaveLength(2);
  });

  it('writes with a cut-off answer are not retried by the adapter, and carry an Idempotency-Key', async () => {
    const { port, calls } = adapter(async () => new Response('{"id": "m1", "te', { status: 200 }), { retries: 2 });
    const e = ((await settle(port.postChat('hi'), 0)) as { error?: unknown }).error as ServerError;
    expect(e).toBeInstanceOf(ServerError);
    expect(e.retryable).toBe(true); // the outbox / caller may try again later
    expect(calls).toHaveLength(1);
    const headers = calls[0].init.headers as Record<string, string>;
    expect(headers[ClientHeaders.idempotencyKey]).toMatch(/.+/);
  });

  it('an error status with a cut-off body keeps its status and code rules', async () => {
    const { port } = adapter(async () => new Response('{"error": "rate_li', { status: 503 }));
    const e = ((await settle(port.me(), 0)) as { error?: unknown }).error as ServerError;
    expect(e.status).toBe(503);
    expect(e.code).toBe('network');
    expect(e.retryable).toBe(true);
    const { port: p2 } = adapter(async () => new Response('{"error":"bad_request","message":"Nope."}', { status: 400 }));
    const e2 = ((await settle(p2.me(), 0)) as { error?: unknown }).error as ServerError;
    expect([e2.status, e2.code, e2.message, e2.retryable]).toEqual([400, 'bad_request', 'Nope.', false]);
  });

  it('204 and an empty 200 are still "no data"', async () => {
    const { port } = adapter(async (_c, i) => (i === 0 ? new Response(null, { status: 204 }) : new Response('', { status: 200 })));
    expect(await settle(port.block('x'), 0)).toEqual({ value: undefined });
    expect(await settle(port.me(), 0)).toEqual({ value: null });
  });
});
