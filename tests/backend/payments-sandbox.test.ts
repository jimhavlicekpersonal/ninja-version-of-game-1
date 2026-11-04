/**
 * Testing tools and the free test store stay out of real play (audit F01/F02).
 */
import { describe, expect, it } from 'vitest';
import { Connection } from '../../src/backend/net/connection';
import { isSandbox, paymentPath } from '../../src/backend/payments/select';
import { SANDBOX_SAVE_KEY } from '../../src/backend/persist/saveStore';

describe('testing sandbox and store selection', () => {
  it('the sandbox is opt-in by address only', () => {
    expect(isSandbox('')).toBe(false);
    expect(isSandbox('?foo=1')).toBe(false);
    expect(isSandbox('?sandbox')).toBe(true);
    expect(isSandbox('?debug')).toBe(true);
    expect(SANDBOX_SAVE_KEY).not.toBe('village');
  });

  it('the instant mock store exists only in the sandbox; the public web build has none', () => {
    expect(paymentPath('web', false)).toBe('unavailable');
    expect(paymentPath('android', false)).toBe('unavailable');
    expect(paymentPath('ios', false)).toBe('storekit');
    expect(paymentPath('web', true)).toBe('mock');
    expect(paymentPath('ios', true)).toBe('mock');
  });

  it('the sandbox never goes online, even with a server built in', () => {
    const kv = { get: () => null, set: () => undefined };
    const game = { data: {} as never, state: {} as never, now: () => 0, dispatch: () => ({ ok: false, code: 'NOT_FOUND', message: '' }) as never };
    expect(new Connection({ game, kv, builtInUrl: 'https://server.example', offline: true }).enabled).toBe(false);
    expect(new Connection({ game, kv, builtInUrl: 'https://server.example', offline: true }).status).toBe('off');
  });
});
