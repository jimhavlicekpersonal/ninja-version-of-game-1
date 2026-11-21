/** Beast Mode 2026-11-21 OPS-09: server-side kill switches for products and features (no app update). */
import { describe, expect, it } from 'vitest';
import { world } from './harness';

describe('OPS-09: kill switches', () => {
  it('an intent for a product in PRODUCTS_OFF is refused before payment; hello lists it as paused', async () => {
    const w = world({ shared: { policy: { productsOff: ['moonstones_0'] }, payments: { apple: {}, google: null } } as never });
    const p = await w.player('Ann');
    await expect(p.purchaseIntent({ store: 'apple', productId: 'moonstones_0', under18: false })).rejects.toMatchObject({ code: 'feature_paused', status: 403 });
    expect((await p.hello()).pausedProducts).toEqual(['moonstones_0']);
  });

  it('hello omits a feature in FEATURES_OFF and its route answers feature_paused', async () => {
    const w = world({ shared: { policy: { featuresOff: ['gangs', 'shared-replays'] } } as never });
    const p = await w.player('Ann');
    const hello = await p.hello();
    expect(hello.features).not.toContain('gangs');
    expect(hello.features).not.toContain('shared-replays');
    expect(hello.features).toContain('duels');
    await expect(p.createSquad('Kite Riders')).rejects.toMatchObject({ code: 'feature_paused' });
  });
});
