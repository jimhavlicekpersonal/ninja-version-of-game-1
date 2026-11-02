import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { buildServer } from '../../server/app';
import { MemoryRepo } from '../../server/repo';
import { OnlineClient } from '../../src/online/client';
import { generateOpponent } from '../../src/sim/battle/basegen';
import { defaultData as data } from '../../src/sim/data';

describe('game client against a running server', () => {
  let t = Date.UTC(2026, 3, 1);
  const app = buildServer({ repo: new MemoryRepo(), data, now: () => t });
  let url = '';
  beforeAll(async () => {
    await app.listen({ port: 0, host: '127.0.0.1' });
    url = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    await app.close();
  });

  it('registers, uploads a base, finds a real opponent, attacks and sees the defense', async () => {
    const alice = new OnlineClient(url);
    const bob = new OnlineClient(url);
    await alice.ensureRegistered('Alice');
    await bob.ensureRegistered('Bob');
    await bob.uploadBase(generateOpponent(9, 2, data), 'Bob');
    t += 25 * 3_600_000; // past the new-player shield
    const m = await alice.match();
    expect(m).not.toBeNull();
    expect(m!.base.name).toBe('Bob');
    const army = { hedgehog_roller: 20 };
    const r = await alice.submitAttack({ ticket: m!.ticket, seed: 3, army, deployments: Array.from({ length: 20 }, (_, i) => ({ tick: i, troop: 'hedgehog_roller', x: 1, y: 2 + i })) });
    expect(r.result.ticks).toBeGreaterThan(0);
    const defs = await bob.defenses(0);
    expect(defs).toHaveLength(1);
    expect(defs[0].attackerName).toBe('Alice');
    expect((await alice.me()).trophies).toBe(Math.max(0, r.trophies));
  });
});
