import { describe, expect, it } from 'vitest';
import { formatCompact, formatDuration, formatNumber } from '../../src/ui/format';

describe('formatting', () => {
  it('durations show the two biggest units', () => {
    expect(formatDuration(10_000)).toBe('10s');
    expect(formatDuration(110_000)).toBe('1m 50s');
    expect(formatDuration(13_200_000)).toBe('3h 40m');
    expect(formatDuration(144_000_000)).toBe('1d 16h');
    expect(formatDuration(604_800_000)).toBe('7d');
    expect(formatDuration(-5)).toBe('0s');
    expect(formatDuration(1)).toBe('1s');
  });
  it('numbers', () => {
    expect(formatNumber(1234567.9)).toBe('1,234,567');
    expect(formatCompact(950)).toBe('950');
    expect(formatCompact(1200)).toBe('1.2K');
    expect(formatCompact(34_000)).toBe('34K');
    expect(formatCompact(1_500_000)).toBe('1.5M');
  });
});
