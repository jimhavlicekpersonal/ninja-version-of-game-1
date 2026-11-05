/**
 * A small QR code encoder for friend links (roadmap step 59): byte mode,
 * error correction level M, versions 1-6 (up to 106 bytes, enough for a game
 * address plus "?friend=KAGE-XXXXXX"). No dependencies (the HUD has none).
 * Follows ISO/IEC 18004: Reed-Solomon over GF(256) with 0x11d, interleaved
 * blocks, the eight masks scored by the standard penalty rules.
 */

/** Data codewords and error-correction blocks for level M, versions 1-6. */
const VERSIONS: { total: number; ec: number; blocks: number }[] = [
  { total: 26, ec: 10, blocks: 1 },
  { total: 44, ec: 16, blocks: 1 },
  { total: 70, ec: 26, blocks: 1 },
  { total: 100, ec: 18, blocks: 2 },
  { total: 134, ec: 24, blocks: 2 },
  { total: 172, ec: 16, blocks: 4 },
];

// GF(256) tables.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const mul = (a: number, b: number) => (a && b ? EXP[LOG[a] + LOG[b]] : 0);

function generator(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      next[j] ^= g[j];
      next[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = next;
  }
  return g;
}

function ecc(data: number[], degree: number): number[] {
  const g = generator(degree);
  const r = [...data, ...new Array(degree).fill(0)];
  for (let i = 0; i < data.length; i++) {
    const f = r[i];
    if (!f) continue;
    for (let j = 0; j < g.length; j++) r[i + j] ^= mul(g[j], f);
  }
  return r.slice(data.length);
}

/** The modules of a QR code for `text` (true = dark), or null if it is too long. */
export function qrMatrix(text: string): boolean[][] | null {
  const bytes = [...new TextEncoder().encode(text)];
  const vi = VERSIONS.findIndex((v) => v.total - v.ec * v.blocks - 2 >= bytes.length);
  if (vi < 0) return null;
  const version = vi + 1;
  const spec = VERSIONS[vi];
  const dataLen = spec.total - spec.ec * spec.blocks;

  // Bit stream: mode 0100 (byte), 8-bit count, data, terminator, padding.
  const bits: number[] = [];
  const put = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, 8);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, dataLen * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0; data.length < dataLen; pad++) data.push(pad % 2 ? 0x11 : 0xec);

  // Blocks (all the same size for level M at versions 1-6), then interleave.
  const per = dataLen / spec.blocks;
  const blocks = Array.from({ length: spec.blocks }, (_, i) => data.slice(i * per, (i + 1) * per));
  const ecs = blocks.map((b) => ecc(b, spec.ec));
  const codewords: number[] = [];
  for (let i = 0; i < per; i++) for (const b of blocks) codewords.push(b[i]);
  for (let i = 0; i < spec.ec; i++) for (const e of ecs) codewords.push(e[i]);

  const n = version * 4 + 17;
  const grid: (boolean | null)[][] = Array.from({ length: n }, () => new Array(n).fill(null));
  const reserved: boolean[][] = Array.from({ length: n }, () => new Array(n).fill(false));
  const set = (r: number, c: number, dark: boolean) => {
    grid[r][c] = dark;
    reserved[r][c] = true;
  };
  const finder = (r0: number, c0: number) => {
    for (let r = -1; r <= 7; r++)
      for (let c = -1; c <= 7; c++) {
        const rr = r0 + r;
        const cc = c0 + c;
        if (rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3));
        set(rr, cc, r >= 0 && r <= 6 && c >= 0 && c <= 6 && ring !== 2);
      }
  };
  finder(0, 0);
  finder(0, n - 7);
  finder(n - 7, 0);
  for (let i = 8; i < n - 8; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  if (version >= 2) {
    const p = 4 * version + 10;
    for (let r = -2; r <= 2; r++) for (let c = -2; c <= 2; c++) set(p + r, p + c, Math.max(Math.abs(r), Math.abs(c)) !== 1);
  }
  set(n - 8, 8, true); // dark module
  // Format areas (filled after masking).
  for (let i = 0; i < 9; i++) {
    reserved[8][i] = true;
    reserved[i][8] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][n - 1 - i] = true;
    reserved[n - 1 - i][8] = true;
  }

  // Data, in the zigzag order.
  const stream: number[] = [];
  for (const cw of codewords) for (let i = 7; i >= 0; i--) stream.push((cw >>> i) & 1);
  let k = 0;
  let upward = true;
  for (let right = n - 1; right > 0; right -= 2) {
    if (right === 6) right = 5;
    for (let step = 0; step < n; step++) {
      const r = upward ? n - 1 - step : step;
      for (const c of [right, right - 1]) {
        if (reserved[r][c]) continue;
        grid[r][c] = k < stream.length ? stream[k] === 1 : false;
        k++;
      }
    }
    upward = !upward;
  }

  const masks: ((r: number, c: number) => boolean)[] = [
    (r, c) => (r + c) % 2 === 0,
    (r) => r % 2 === 0,
    (_r, c) => c % 3 === 0,
    (r, c) => (r + c) % 3 === 0,
    (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
    (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
    (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
    (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
  ];

  const withMask = (m: number): boolean[][] => {
    const out = grid.map((row, r) => row.map((v, c) => (reserved[r][c] ? Boolean(v) : Boolean(v) !== masks[m](r, c))));
    // Format information: level M (00) and the mask, BCH(15,5), XOR 0x5412.
    const fmtData = (0b00 << 3) | m;
    let rem = fmtData << 10;
    for (let i = 14; i >= 10; i--) if ((rem >>> i) & 1) rem ^= 0x537 << (i - 10);
    const fmt = ((fmtData << 10) | rem) ^ 0x5412;
    const bit = (i: number) => ((fmt >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) out[8][i] = bit(14 - i);
    out[8][7] = bit(8);
    out[8][8] = bit(7);
    out[7][8] = bit(6);
    for (let i = 9; i <= 14; i++) out[14 - i][8] = bit(14 - i);
    for (let i = 0; i <= 7; i++) out[n - 1 - i][8] = bit(14 - i);
    for (let i = 7; i <= 14; i++) out[8][n - 15 + i] = bit(14 - i);
    out[n - 8][8] = true;
    return out;
  };

  const penalty = (m: boolean[][]): number => {
    let p = 0;
    const lines = [...m, ...m[0].map((_, c) => m.map((row) => row[c]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) p += run - 2;
          run = 1;
        }
      }
      const s = line.map((v) => (v ? '1' : '0')).join('');
      for (const pat of ['10111010000', '00001011101']) for (let i = s.indexOf(pat); i >= 0; i = s.indexOf(pat, i + 1)) p += 40;
    }
    for (let r = 0; r < n - 1; r++) for (let c = 0; c < n - 1; c++) if (m[r][c] === m[r + 1][c] && m[r][c] === m[r][c + 1] && m[r][c] === m[r + 1][c + 1]) p += 3;
    const dark = m.flat().filter(Boolean).length;
    p += Math.floor(Math.abs((dark * 100) / (n * n) - 50) / 5) * 10;
    return p;
  };

  let best: boolean[][] | null = null;
  let bestScore = Infinity;
  for (let mi = 0; mi < 8; mi++) {
    const m = withMask(mi);
    const s = penalty(m);
    if (s < bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

/** An SVG for `text` (dark modules on white, with the 4-module quiet zone), or null if too long. */
export function qrSvg(text: string, size = 200): string | null {
  const m = qrMatrix(text);
  if (!m) return null;
  const n = m.length + 8;
  let path = '';
  m.forEach((row, r) =>
    row.forEach((dark, c) => {
      if (dark) path += `M${c + 4} ${r + 4}h1v1h-1z`;
    }),
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${size}" height="${size}" shape-rendering="crispEdges" role="img" aria-label="QR code"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
