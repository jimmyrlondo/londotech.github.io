// ENCORE. Links: a small QR code maker in plain JS (no libraries).
// Byte mode (UTF-8), error correction M (about 15% of the code can be damaged and still read),
// any version 1 to 40, best of the 8 masks. Pure functions, runs in the browser and in Node.

// error correction codewords per block, and number of blocks, for level M (index = version)
const ECC_PER_BLOCK = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
const NUM_BLOCKS = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
const ECC_FORMAT_M = 0; // the two format bits for level M

export function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) { const n = Math.floor(ver / 7) + 2; r -= (25 * n - 10) * n - 55; if (ver >= 7) r -= 36; }
  return r;
}
export const dataCodewords = (ver) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ver] * NUM_BLOCKS[ver];
export const eccInfo = (ver) => ({ perBlock: ECC_PER_BLOCK[ver], blocks: NUM_BLOCKS[ver] });

export function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2, size = ver * 4 + 17;
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

// GF(256) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1
function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
function rsDivisor(degree) {
  const r = new Array(degree).fill(0); r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 2);
  }
  return r;
}
export function rsRemainder(data, degree) {
  const div = rsDivisor(degree), out = new Array(degree).fill(0);
  for (const b of data) {
    const f = b ^ out.shift(); out.push(0);
    div.forEach((c, i) => { out[i] ^= gfMul(c, f); });
  }
  return out;
}

export function formatBits(mask, ecc = ECC_FORMAT_M) {
  const data = (ecc << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
export function versionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}

const utf8 = (s) => Array.from(new TextEncoder().encode(String(s)));

// the data codewords for some bytes at a version: mode, count, bytes, terminator, padding
export function dataCodewordsFor(bytes, ver) {
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  const cap = dataCodewords(ver) * 8;
  put(0, Math.min(4, cap - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

export function pickVersion(byteLength, minVersion = 1) {
  for (let v = Math.max(1, minVersion); v <= 40; v++) if (4 + (v < 10 ? 8 : 16) + byteLength * 8 <= dataCodewords(v) * 8) return v;
  return 0;
}

// split into blocks, add error correction, interleave
export function interleave(data, ver) {
  const nb = NUM_BLOCKS[ver], ecc = ECC_PER_BLOCK[ver], raw = Math.floor(rawDataModules(ver) / 8);
  const numShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - ecc + (i < numShort ? 0 : 1)); k += dat.length;
    const e = rsRemainder(dat, ecc);
    if (i < numShort) dat.push(0);
    blocks.push(dat.concat(e));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - ecc || j >= numShort) out.push(b[i]); });
  return out;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
  (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
];

function base(ver) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => { m[y][x] = !!dark; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const x = cx + dx, y = cy + dy, d = Math.max(Math.abs(dx), Math.abs(dy));
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignmentPositions(ver), n = al.length;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  // reserve the format areas (drawn per mask) and draw the version blocks
  drawFormat(set, size, 0);
  if (ver >= 7) {
    const b = versionBits(ver);
    for (let i = 0; i < 18; i++) { const bit = (b >>> i) & 1, a = size - 11 + (i % 3), c = Math.floor(i / 3); set(a, c, bit); set(c, a, bit); }
  }
  return { size, m, fn, set };
}
function drawFormat(set, size, bits) {
  const g = (i) => (bits >>> i) & 1;
  for (let i = 0; i <= 5; i++) set(8, i, g(i));
  set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
  set(8, size - 8, 1);
}
function drawCodewords(b, cw) {
  const { size, m, fn } = b;
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && i < cw.length * 8) { m[y][x] = ((cw[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
    }
  }
}

export function penalty(m) {
  const size = m.length;
  let p = 0, dark = 0;
  const lines = [];
  for (let y = 0; y < size; y++) { lines.push(m[y]); lines.push(m.map((r) => r[y])); }
  const A = [1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0].join(''), B = [0, 0, 0, 0, 1, 0, 1, 1, 1, 0, 1].join('');
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) run++;
      else { if (run >= 5) p += 3 + (run - 5); run = 1; }
    }
    const s = line.map((v) => (v ? 1 : 0)).join('');
    for (let i = s.indexOf(A); i >= 0; i = s.indexOf(A, i + 1)) p += 40;
    for (let i = s.indexOf(B); i >= 0; i = s.indexOf(B, i + 1)) p += 40;
  }
  for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
  }
  for (const r of m) for (const v of r) if (v) dark++;
  const total = size * size;
  p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
  return p;
}

// encodeQR(text, { minVersion, mask }) -> { version, size, mask, modules: boolean[y][x] }
export function encodeQR(text, opts = {}) {
  const bytes = typeof text === 'string' ? utf8(text) : Array.from(text);
  const ver = pickVersion(bytes.length, opts.minVersion || 1);
  if (!ver) throw new Error('That is too long for a QR code. Try a shorter link.');
  const cw = interleave(dataCodewordsFor(bytes, ver), ver);
  let best = null;
  const masks = opts.mask != null ? [opts.mask] : [0, 1, 2, 3, 4, 5, 6, 7];
  for (const mask of masks) {
    const b = base(ver);
    drawCodewords(b, cw);
    for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) if (!b.fn[y][x] && MASKS[mask](x, y)) b.m[y][x] = !b.m[y][x];
    drawFormat(b.set, b.size, formatBits(mask));
    const score = masks.length > 1 ? penalty(b.m) : 0;
    if (!best || score < best.score) best = { score, version: ver, size: b.size, mask, modules: b.m };
  }
  delete best.score;
  return best;
}

// a crisp SVG: one path, square modules, a quiet zone of `border` modules
export function qrToSvg(qr, { border = 4, dark = '#000000', light = '#ffffff' } = {}) {
  const n = qr.size + border * 2;
  let d = '';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) d += `M${x + border},${y + border}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" width="${n * 8}" height="${n * 8}" shape-rendering="crispEdges">`
    + `<rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`;
}
