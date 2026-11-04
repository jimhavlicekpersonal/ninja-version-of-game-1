/**
 * A small QR Code encoder (ISO/IEC 18004) for friend links (roadmap step 59):
 * byte mode, error correction level M, versions 1–10 (up to ~200 bytes).
 * Follows the structure of Project Nayuki's reference encoder; checked module
 * for module against the Python `qrcode` library (tests/presentation/qr.test.ts).
 * No dependency (the game has none besides Phaser).
 */

const TOTAL_CODEWORDS = [0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346];
const BLOCKS_M = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const ECC_PER_BLOCK_M = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const ALIGNMENT = [[], [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

function gfMul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function rsDivisor(degree: number): number[] {
  const out = new Array<number>(degree).fill(0);
  out[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      out[j] = gfMul(out[j], root);
      if (j + 1 < degree) out[j] ^= out[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return out;
}

function rsRemainder(data: number[], divisor: number[]): number[] {
  const out = new Array<number>(divisor.length).fill(0);
  for (const b of data) {
    const factor = b ^ out.shift()!;
    out.push(0);
    for (let i = 0; i < out.length; i++) out[i] ^= gfMul(divisor[i], factor);
  }
  return out;
}

const dataCodewords = (v: number) => TOTAL_CODEWORDS[v] - BLOCKS_M[v] * ECC_PER_BLOCK_M[v];

/** The QR code for `text` as rows of dark (true) / light modules, without the quiet zone. `mask` forces a mask (0-7); by default the best one is chosen. */
export function qrMatrix(text: string, mask?: number): boolean[][] {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  for (; version <= 10; version++) if (4 + (version < 10 ? 8 : 16) + bytes.length * 8 <= dataCodewords(version) * 8) break;
  if (version > 10) throw new Error('Too long for a QR code here.');
  // Data bits: mode, length, bytes, terminator, padding.
  const bits: number[] = [];
  const put = (value: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  // Error correction per block, then interleave.
  const numBlocks = BLOCKS_M[version];
  const ecc = ECC_PER_BLOCK_M[version];
  const raw = TOTAL_CODEWORDS[version];
  const shortBlocks = numBlocks - (raw % numBlocks);
  const shortLen = Math.floor(raw / numBlocks);
  const divisor = rsDivisor(ecc);
  const blocks: number[][] = [];
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = data.slice(k, k + shortLen - ecc + (i < shortBlocks ? 0 : 1));
    k += dat.length;
    const rem = rsRemainder(dat, divisor);
    if (i < shortBlocks) dat.push(0); // a placeholder so every block has the same length
    blocks.push([...dat, ...rem]);
  }
  const codewords: number[] = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (i !== shortLen - ecc || j >= shortBlocks) codewords.push(blocks[j][i]);

  const size = version * 4 + 17;
  const grid = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    grid[y][x] = dark;
    fn[y][x] = true;
  };
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [
    [3, 3],
    [size - 4, 3],
    [3, size - 4],
  ]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  const al = ALIGNMENT[version];
  for (let i = 0; i < al.length; i++) {
    for (let j = 0; j < al.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }
  const formatBits = (m: number) => {
    const d = (0 << 3) | m; // level M = 00
    let rem = d;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((d << 10) | rem) ^ 0x5412;
  };
  const drawFormat = (m: number) => {
    const b = formatBits(m);
    const bit = (i: number) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6));
    set(8, 8, bit(7));
    set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0); // reserve the format areas
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const dark = ((b >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const c = Math.floor(i / 3);
      set(a, c, dark);
      set(c, a, dark);
    }
  }
  // Codewords in the zigzag, skipping the timing column.
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) {
          grid[y][x] = ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
          i++;
        }
      }
    }
  }
  const masked = (m: number) => {
    const g = grid.map((row) => row.slice());
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (fn[y][x]) continue;
        const inv =
          m === 0 ? (x + y) % 2 === 0
          : m === 1 ? y % 2 === 0
          : m === 2 ? x % 3 === 0
          : m === 3 ? (x + y) % 3 === 0
          : m === 4 ? (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0
          : m === 5 ? ((x * y) % 2) + ((x * y) % 3) === 0
          : m === 6 ? (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
          : (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
        if (inv) g[y][x] = !g[y][x];
      }
    }
    const b = formatBits(m);
    const bit = (k: number) => ((b >>> k) & 1) === 1;
    const put2 = (x: number, y: number, v: boolean) => (g[y][x] = v);
    for (let k = 0; k <= 5; k++) put2(8, k, bit(k));
    put2(8, 7, bit(6));
    put2(8, 8, bit(7));
    put2(7, 8, bit(8));
    for (let k = 9; k < 15; k++) put2(14 - k, 8, bit(k));
    for (let k = 0; k < 8; k++) put2(size - 1 - k, 8, bit(k));
    for (let k = 8; k < 15; k++) put2(8, size - 15 + k, bit(k));
    return g;
  };
  if (mask !== undefined) return masked(mask);
  let best: boolean[][] = masked(0);
  let bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    const g = masked(m);
    const s = penalty(g);
    if (s < bestScore) {
      best = g;
      bestScore = s;
    }
  }
  return best;
}

/** The standard mask penalty (rules 1-4). */
function penalty(g: boolean[][]): number {
  const n = g.length;
  let score = 0;
  const line = (get: (i: number) => boolean) => {
    let run = 1;
    for (let i = 1; i < n; i++) {
      if (get(i) === get(i - 1)) run++;
      else {
        if (run >= 5) score += run - 2;
        run = 1;
      }
    }
    if (run >= 5) score += run - 2;
    // Finder-like 1:1:3:1:1 with 4 light modules on either side.
    for (let i = 0; i + 10 < n; i++) {
      const p = [true, false, true, true, true, false, true].map((v, k) => get(i + k) === v).every(Boolean);
      const p2 = [false, false, false, false, true, false, true, true, true, false, true];
      if (p && [7, 8, 9, 10].every((k) => !get(i + k))) score += 40;
      if (p2.map((v, k) => get(i + k) === v).every(Boolean)) score += 40;
    }
  };
  for (let y = 0; y < n; y++) line((x) => g[y][x]);
  for (let x = 0; x < n; x++) line((y) => g[y][x]);
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) if (g[y][x] === g[y][x + 1] && g[y][x] === g[y + 1][x] && g[y][x] === g[y + 1][x + 1]) score += 3;
  const dark = g.flat().filter(Boolean).length;
  score += Math.floor(Math.abs((dark * 20) / (n * n) - 10)) * 10;
  return score;
}

/** An SVG drawing of the code with a 4-module quiet zone. */
export function qrSvg(text: string, px = 4): string {
  const m = qrMatrix(text);
  const size = m.length + 8;
  let path = '';
  m.forEach((row, y) => row.forEach((dark, x) => dark && (path += `M${x + 4},${y + 4}h1v1h-1z`)));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size * px}" height="${size * px}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
