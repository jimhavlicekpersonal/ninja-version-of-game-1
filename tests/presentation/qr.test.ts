/**
 * The friend-link QR encoder (roadmap steps 59-60). Codes from this encoder
 * were decoded with OpenCV's QR reader for versions 1-6 when it was written;
 * these checks keep its structure from drifting.
 */
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from '../../src/presentation/ui/qr';

const finderAt = (m: boolean[][], r0: number, c0: number) => {
  for (let r = 0; r < 7; r++)
    for (let c = 0; c < 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
      if (m[r0 + r][c0 + c] !== (ring !== 2)) return false;
    }
  return true;
};

describe('QR codes for friend links', () => {
  it('picks the smallest version that fits, up to version 6 (106 bytes)', () => {
    expect(qrMatrix('KAGE-7Q4M2K')!.length).toBe(21);
    expect(qrMatrix('https://example.com/?friend=KAGE-7Q4M2K')!.length).toBe(29);
    expect(qrMatrix('x'.repeat(106))!.length).toBe(41);
    expect(qrMatrix('x'.repeat(107))).toBeNull();
  });

  it('has the three finder patterns, timing lines and the dark module', () => {
    const m = qrMatrix('https://jimhavlicekpersonal.github.io/ninja-version-of-game-1/?friend=KAGE-7Q4M2K')!;
    const n = m.length;
    expect(finderAt(m, 0, 0) && finderAt(m, 0, n - 7) && finderAt(m, n - 7, 0)).toBe(true);
    for (let i = 8; i < n - 8; i++) {
      expect(m[6][i]).toBe(i % 2 === 0);
      expect(m[i][6]).toBe(i % 2 === 0);
    }
    expect(m[n - 8][8]).toBe(true);
  });

  it('is the same every time, and draws as an SVG with a quiet zone', () => {
    expect(qrMatrix('KAGE-ABCDEF')).toEqual(qrMatrix('KAGE-ABCDEF'));
    const svg = qrSvg('KAGE-ABCDEF', 180)!;
    expect(svg).toContain('viewBox="0 0 29 29"');
    expect(svg).toContain('width="180"');
  });
});
