/**
 * Beast Mode 2026-11-21 SEC-02 (earlier S-2): metric labels took raw client strings (X-Client-Build, X-Sim-Rules,
 * a report's rules), on any path and before the rate limits, so random headers grew memory and the scrape forever.
 */
import { describe, expect, it } from 'vitest';
import { buildLabel, MAX_SERIES_PER_METRIC, PromMetrics, rulesLabel } from '../../../server/observability';
import { ClientHeaders, Routes } from '../../../src/backend/net/protocol';
import { setup } from './httpHarness';

describe('SEC-02: bounded metric labels', () => {
  it('2,000 requests with random X-Client-Build make a bounded number of series; a real build still shows', async () => {
    const s = setup({ rateLimits: { ip: { limit: 1_000_000, windowMs: 60_000 } } });
    for (let i = 0; i < 2000; i++) {
      await s.call('GET', Routes.hello, undefined, undefined, { headers: { [ClientHeaders.clientBuild]: `x${i}-${Math.random()}`, [ClientHeaders.simRules]: String(1000 + i) } });
    }
    await s.call('GET', Routes.hello, undefined, undefined, { headers: { [ClientHeaders.clientBuild]: '1.4.0+ios' } });
    const body = s.app.metrics.render();
    const series = body.split('\n').filter((l) => l.startsWith('tk_client_requests_total{'));
    expect(series.length).toBeLessThanOrEqual(3);
    expect(body).toMatch(/tk_client_requests_total\{build="1\.4\.0\+ios",rules="\?"\} 1/);
    expect(body).toMatch(/tk_client_requests_total\{build="other",rules="other"\} 2000/);
    expect(body.length).toBeLessThan(200_000);
  });

  it('unmatched paths count no game version', async () => {
    const s = setup();
    await s.call('GET', '/nope', undefined, undefined, { headers: { [ClientHeaders.clientBuild]: '1.4.0' } });
    expect(s.app.metrics.render()).not.toMatch(/tk_client_requests_total/);
  });

  it('every metric holds at most MAX_SERIES_PER_METRIC label sets, then counts into overflow', () => {
    const m = new PromMetrics();
    for (let i = 0; i < MAX_SERIES_PER_METRIC + 50; i++) m.count('tk_errors_total', { code: `c${i}` });
    expect(m.value('tk_errors_total', { overflow: '1' })).toBe(50);
    expect(m.value('tk_metrics_series_dropped_total', { metric: 'tk_errors_total' })).toBe(50);
  });

  it('label normalisers keep real values only', () => {
    expect(buildLabel('1.4.0')).toBe('1.4.0');
    expect(buildLabel('1.4.0+android')).toBe('1.4.0+android');
    expect(buildLabel('1.4.0+evil')).toBe('other');
    expect(buildLabel('x'.repeat(40))).toBe('other');
    expect(rulesLabel('8', [8, 7])).toBe('8');
    expect(rulesLabel(99, [8, 7])).toBe('other');
    expect(rulesLabel(undefined, [8])).toBe('?');
  });
});
