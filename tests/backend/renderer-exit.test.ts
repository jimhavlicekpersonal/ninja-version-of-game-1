/** Beast Mode 2026-11-21 OPS-03 / STB-04: a recorded WebView renderer exit is reported once (crash reports permitting). */
import { describe, expect, it } from 'vitest';
import { rendererExitReport } from '../../src/backend/platform/native';

describe('OPS-03: renderer exit report', () => {
  it('becomes a kind:renderer report with the native details and no player data', () => {
    const r = rendererExitReport({ at: 1, didCrash: false, priority: 2, count: 3 });
    expect(r.error.message).toBe('WebView renderer process gone');
    expect(r.tags).toEqual({ kind: 'renderer', didCrash: 'false', priority: '2', count: '3' });
  });
});
