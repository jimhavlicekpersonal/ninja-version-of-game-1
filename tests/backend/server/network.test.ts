/** HTTPS and IPv6 (roadmap step 45): the server listens on IPv6, and tells browsers to keep to HTTPS when it is reached over it. */
import type { AddressInfo } from 'node:net';
import { networkInterfaces } from 'node:os';
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { defaultData as data } from '../../../src/gameplay/sim/data';

const hasIpv6 = Object.values(networkInterfaces()).some((list) => list?.some((i) => i.family === 'IPv6' && i.internal));

describe('network', () => {
  it.skipIf(!hasIpv6)('answers on IPv6 and IPv4 when listening on ::', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data });
    await app.listen({ port: 0, host: '::' });
    const port = (app.server.address() as AddressInfo).port;
    try {
      expect((await (await fetch(`http://[::1]:${port}/v1/hello`)).json()).name).toBe('toadstool-kingdoms');
      expect((await fetch(`http://127.0.0.1:${port}/v1/hello`)).status).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('sends Strict-Transport-Security only over HTTPS (behind a trusted proxy)', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, trustProxy: true });
    const secure = await app.inject({ method: 'GET', url: '/v1/hello', headers: { 'x-forwarded-proto': 'https' } });
    expect(secure.headers['strict-transport-security']).toBe('max-age=31536000');
    const plain = await app.inject({ method: 'GET', url: '/v1/hello' });
    expect(plain.headers['strict-transport-security']).toBeUndefined();
    // Without trusting a proxy, a client cannot claim HTTPS.
    const untrusted = buildServer({ repo: new MemoryRepo(), data });
    expect((await untrusted.inject({ method: 'GET', url: '/v1/hello', headers: { 'x-forwarded-proto': 'https' } })).headers['strict-transport-security']).toBeUndefined();
  });
});
