/**
 * The QR encoder for friend links (roadmap step 59) matches a reference
 * implementation module for module: tests/presentation/fixtures/qr-reference.json
 * was made with the Python `qrcode` library (byte mode, level M, each mask).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { qrMatrix, qrSvg } from '../../src/presentation/ui/qr';

const reference = JSON.parse(readFileSync(new URL('./fixtures/qr-reference.json', import.meta.url), 'utf8')) as { text: string; mask: number; version: number; rows: string[] }[];

describe('QR codes', () => {
  it('match the reference for every mask, from version 1 to 10 (with version information)', () => {
    for (const r of reference) {
      const m = qrMatrix(r.text, r.mask);
      expect(m.length, `${r.text.slice(0, 20)} v${r.version}`).toBe(r.version * 4 + 17);
      expect(m.map((row) => row.map((d) => (d ? '1' : '0')).join('')), `${r.text.slice(0, 20)} mask ${r.mask}`).toEqual(r.rows);
    }
  });

  it('chooses one of the valid masks by itself and draws an SVG', () => {
    const text = 'https://api.example.com/f/KAGE-7Q4M2X';
    const auto = qrMatrix(text).map((row) => row.map((d) => (d ? '1' : '0')).join(''));
    expect(reference.filter((r) => r.text === text).some((r) => r.rows.join() === auto.join())).toBe(true);
    expect(qrSvg(text)).toMatch(/^<svg[^>]+viewBox="0 0 37 37"/);
    expect(() => qrMatrix('z'.repeat(400))).toThrow();
  });
});
