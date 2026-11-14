/**
 * Request schemas on the HTTP routes (quality Q19, 2026-11-14 code-debt batch): wrong JSON types are
 * refused with 400 `bad_request` and a message code before the core runs; extra fields, missing optional
 * bodies and missing optional fields still reach the core as before (older games keep working).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Routes } from '../../../src/backend/net/protocol';
import { setup } from './httpHarness';

const ADMIN = 'staff-token-0123456789-abcdef';

describe('route schemas', () => {
  it('refuses a field of the wrong JSON type with bad_request and a message code naming it', async () => {
    const s = setup();
    const r = await s.call('POST', Routes.players, undefined, { name: 42 });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ error: 'bad_request', key: 'detail' });
    expect(r.body.params.detail).toContain('body/name');
    expect(r.body.message).toContain('body/name');
  });

  it('does not coerce types: a number sent as text is refused where the protocol says number', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const r = await s.call('POST', Routes.groveRaidClaim, a.token, { week: '3' });
    expect(r.status).toBe(400);
    expect(r.body.params.detail).toContain('body/week');
    // Items of a list are checked too.
    const ids = await s.call('POST', Routes.noticesRead, a.token, { ids: [1, 2] });
    expect(ids.status).toBe(400);
  });

  it('keeps extra fields, optional bodies and optional fields working', async () => {
    const s = setup();
    const r = await s.call('POST', Routes.players, undefined, { name: 'Ann', futureField: { x: 1 } });
    expect(r.status).toBe(201);
    const token = r.body.token as string;
    // No body at all: the core answers with its own code, as before.
    const noBody = await s.call('POST', Routes.groves, token);
    expect(noBody.status).toBeGreaterThanOrEqual(400);
    expect(noBody.body.key).not.toBe('detail');
    // A missing optional field (findable) with a known one.
    expect((await s.call('PUT', Routes.privacy, token, { showOnline: false })).status).toBe(200);
  });

  it('checks a battle report shape and needs its ticket', async () => {
    const s = setup();
    const a = await s.register('Ann');
    const noTicket = await s.call('POST', Routes.attacks, a.token, { seed: 1, army: {}, deployments: [] });
    expect(noTicket.status).toBe(400);
    expect(noTicket.body.params.detail).toContain('ticket');
    const badArmy = await s.call('POST', Routes.attacks, a.token, { ticket: 't', army: { ninja: 'many' }, deployments: [] });
    expect(badArmy.status).toBe(400);
    expect(badArmy.body.params.detail).toContain('body/army/ninja');
  });

  it('checks the staff token before the body, so a caller without one learns nothing about the API', async () => {
    const s = setup({ adminToken: ADMIN });
    expect((await s.call('POST', '/admin/v1/players/p1/ban', 'wrong-token', { hours: 'x' })).status).toBe(401);
    expect((await s.call('POST', '/admin/v1/players/p1/ban', ADMIN, { hours: 'x' })).status).toBe(400);
  });

  it('leaves no untyped body casts in the HTTP adapter (only the kit casts, after validation)', () => {
    const files = ['server/app.ts', ...readdirSync('server/routes').map((f) => `server/routes/${f}`)];
    for (const f of files) {
      const code = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code).not.toMatch(/as never/);
      if (!f.endsWith('kit.ts')) expect(code).not.toMatch(/req\.body as/);
    }
  });
});
