/** Beast Mode OPS-06: the staff statistics page script parses and shows the battles panel. */
import { describe, expect, it } from 'vitest';
import { buildServer } from '../../../server/app';
import { MemoryRepo } from '../../../server/repo';
import { defaultData as data } from '../../../src/gameplay/sim/data';

describe('/admin/stats', () => {
  it('serves a script that parses and a page with the battles panel', async () => {
    const app = buildServer({ repo: new MemoryRepo(), data, now: () => Date.UTC(2026, 3, 6, 12), adminToken: 'staff-secret-0123456789abcdef' });
    const page = await app.inject({ method: 'GET', url: '/admin/stats' });
    expect(page.body).toContain('id="battles"');
    const js = (await app.inject({ method: 'GET', url: '/admin/stats.js' })).body;
    expect(() => new Function(js)).not.toThrow();
    expect(js).toContain('/admin/v1/stats/battles');
  });
});
