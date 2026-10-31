// Encore Convert: a FLAC encoder (and a decoder, so tests can prove the round
// trip is bit-for-bit). Plain JS, runs in the worker and in Node.
//   encodeFlac(ints, fs, bits, { meta, art, onProgress }) -> Uint8Array
//     ints: Int32Array per channel (1 to 8 channels), bits 8..24 (or 32)
//   decodeFlac(bytes) -> { chans: Int32Array[], fs, bits, md5ok, ... }
// Per block of 4096 samples it tries constant, fixed (orders 0-4) and LPC
// (up to order 12, Tukey-windowed autocorrelation, Levinson-Durbin) predictors
// and keeps the smallest; residuals are Rice coded with the best partition
// order; stereo picks left/right, left/side, side/right or mid/side per block.
// STREAMINFO carries the MD5 of the audio, so any FLAC tool can verify it.
import { MD5, concat } from "./convert-core.js";

const BLOCK = 4096, MAX_LPC = 12, MAX_PO = 8;
const enc = new TextEncoder();

// ---------- bits out ----------
class BitWriter {
  constructor(cap = 1 << 16) { this.buf = new Uint8Array(cap); this.pos = 0; this.acc = 0; this.n = 0; }
  grow(k) { if (this.pos + k <= this.buf.length) return; let c = this.buf.length * 2; while (c < this.pos + k) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.pos)); this.buf = b; }
  // v unsigned, n <= 24 per piece (split wider values)
  put(v, n) {
    if (n > 24) { this.put(Math.floor(v / 2 ** 24), n - 24); v %= 2 ** 24; n = 24; }
    this.acc = (this.acc << n) | (v & ((1 << n) - 1)); this.n += n;
    if (this.n >= 8) {
      this.grow(4);
      while (this.n >= 8) { this.n -= 8; this.buf[this.pos++] = (this.acc >>> this.n) & 255; }
      this.acc &= (1 << this.n) - 1;
    }
  }
  signed(v, n) { this.put(v < 0 ? v + 2 ** n : v, n); }
  zeros(k) { while (k > 24) { this.put(0, 24); k -= 24; } if (k) this.put(0, k); }
  align() { if (this.n) this.put(0, 8 - this.n); }
  bytes() { return this.buf.subarray(0, this.pos); }
}

// ---------- CRCs ----------
const CRC8 = new Uint8Array(256), CRC16 = new Uint16Array(256);
for (let i = 0; i < 256; i++) {
  let c = i; for (let k = 0; k < 8; k++) c = c & 0x80 ? ((c << 1) ^ 0x07) & 255 : (c << 1) & 255; CRC8[i] = c;
  let d = i << 8; for (let k = 0; k < 8; k++) d = d & 0x8000 ? ((d << 1) ^ 0x8005) & 0xffff : (d << 1) & 0xffff; CRC16[i] = d;
}
const crc8 = (b, from, to) => { let c = 0; for (let i = from; i < to; i++) c = CRC8[c ^ b[i]]; return c; };
const crc16 = (b, from, to) => { let c = 0; for (let i = from; i < to; i++) c = ((c << 8) & 0xffff) ^ CRC16[(c >> 8) ^ b[i]]; return c; };

// ---------- residual coding ----------
// zigzag: 0, -1, 1, -2 ... -> 0, 1, 2, 3 ...
function zigzag(res, from, u) { for (let i = from; i < res.length; i++) { const v = res[i]; u[i] = v >= 0 ? 2 * v : -2 * v - 1; } }
// Best Rice parameters for a residual (u = zigzagged, the first `order`
// samples are warm-up). Estimated sizes from per-partition sums (libFLAC's way).
function riceChoice(u, n, order) {
  let top = Math.min(MAX_PO, Math.log2(n & -n) | 0);
  while (top > 0 && (n >> top) <= order) top--;
  if ((n >> top) <= order && order > 0) return null;
  // sums at the finest order, then merged pairwise for each coarser order
  let sums = new Float64Array(1 << top), psize = n >> top;
  for (let p = 0; p < sums.length; p++) { let s = 0; for (let i = p === 0 ? order : p * psize, e = (p + 1) * psize; i < e; i++) s += u[i]; sums[p] = s; }
  let best = null;
  for (let po = top; po >= 0; po--) {
    const parts = 1 << po, size = n >> po, ks = new Uint8Array(parts);
    let bits = 0, five = false;
    for (let p = 0; p < parts; p++) {
      const cnt = size - (p === 0 ? order : 0), sum = sums[p];
      const k = cnt && sum > cnt ? Math.floor(Math.log2(sum / cnt)) : 0;
      let bc = Infinity, bk = 0;
      for (let kk = Math.max(0, k - 1); kk <= k + 1 && kk <= 30; kk++) { const c = cnt * (kk + 1) + Math.floor(sum / 2 ** kk); if (c < bc) { bc = c; bk = kk; } }
      ks[p] = bk; bits += bc; if (bk > 14) five = true;
    }
    bits += parts * (five ? 5 : 4) + 6;
    if (!best || bits < best.bits) best = { po, ks, bits, five };
    if (po) { const next = new Float64Array(parts >> 1); for (let p = 0; p < next.length; p++) next[p] = sums[2 * p] + sums[2 * p + 1]; sums = next; }
  }
  return best;
}
function writeResidual(w, u, n, order, rc) {
  const five = rc.five, pb = five ? 5 : 4, parts = 1 << rc.po, psize = n >> rc.po;
  w.put(five ? 1 : 0, 2); w.put(rc.po, 4);
  for (let p = 0; p < parts; p++) {
    const k = rc.ks[p], a = p === 0 ? order : p * psize, b = (p + 1) * psize;
    w.put(k, pb);
    const div = 2 ** k;
    for (let i = a; i < b; i++) {
      const v = u[i], q = k ? Math.floor(v / div) : v;
      if (q + 1 + k <= 24) w.put(k ? ((1 << k) | (v - q * div)) : 1, q + 1 + k);
      else { w.zeros(q); w.put(1, 1); if (k) w.put(v - q * div, k); }
    }
  }
}

// ---------- predictors ----------
function fixedResidual(x, n, order, res) {
  for (let i = order; i < n; i++) {
    res[i] = order === 0 ? x[i] : order === 1 ? x[i] - x[i - 1] : order === 2 ? x[i] - 2 * x[i - 1] + x[i - 2]
      : order === 3 ? x[i] - 3 * x[i - 1] + 3 * x[i - 2] - x[i - 3] : x[i] - 4 * x[i - 1] + 6 * x[i - 2] - 4 * x[i - 3] + x[i - 4];
  }
}
const windows = new Map();
function tukey(n) { // Tukey(0.5), libFLAC's default
  if (windows.has(n)) return windows.get(n);
  const w = new Float64Array(n), a = 0.5, edge = Math.floor(a * (n - 1) / 2);
  for (let i = 0; i < n; i++) w[i] = i < edge ? 0.5 * (1 - Math.cos(Math.PI * i / edge)) : i > n - 1 - edge ? 0.5 * (1 - Math.cos(Math.PI * (n - 1 - i) / edge)) : 1;
  windows.set(n, w);
  return w;
}
// LPC coefficient sets for orders 1..max, plus each order's prediction error
function lpcCandidates(x, n, max) {
  const w = tukey(n), y = new Float64Array(n);
  for (let i = 0; i < n; i++) y[i] = x[i] * w[i];
  const r = new Float64Array(max + 1);
  for (let lag = 0; lag <= max; lag++) { let s = 0; for (let i = lag; i < n; i++) s += y[i] * y[i - lag]; r[lag] = s; }
  if (r[0] <= 0) return [];
  r[0] *= 1 + 1e-9; // a whisper of white-noise correction keeps Levinson stable
  const out = [], a = new Float64Array(max + 1), tmp = new Float64Array(max + 1);
  let err = r[0];
  for (let i = 1; i <= max; i++) {
    let acc = r[i];
    for (let j = 1; j < i; j++) acc -= a[j] * r[i - j];
    const k = acc / err;
    tmp.set(a);
    a[i] = k;
    for (let j = 1; j < i; j++) a[j] = tmp[j] - k * tmp[i - j];
    err *= 1 - k * k;
    if (!(err > 0)) break;
    out.push({ order: i, coefs: a.slice(1, i + 1), err });
  }
  return out;
}
// libFLAC-style coefficient quantization (error feedback), shift >= 0
function quantizeLpc(coefs, precision) {
  let cmax = 0; for (const c of coefs) cmax = Math.max(cmax, Math.abs(c));
  if (!(cmax > 0)) return null;
  const log2cmax = Math.floor(Math.log2(cmax)) + 1 - 1; // frexp exponent - 1
  let shift = precision - log2cmax - 2;
  if (shift > 15) shift = 15;
  if (shift < 0) return null;
  const qmax = (1 << (precision - 1)) - 1, qmin = -(1 << (precision - 1)), q = new Int32Array(coefs.length);
  let e = 0;
  for (let i = 0; i < coefs.length; i++) {
    e += coefs[i] * (1 << shift);
    let v = Math.round(e);
    v = v > qmax ? qmax : v < qmin ? qmin : v;
    e -= v; q[i] = v;
  }
  return { q, shift };
}
function lpcResidual(x, n, q, shift, res) {
  const order = q.length, div = 2 ** shift;
  for (let i = order; i < n; i++) {
    let s = 0;
    for (let j = 0; j < order; j++) s += q[j] * x[i - j - 1];
    res[i] = x[i] - Math.floor(s / div);
  }
}

// ---------- one subframe ----------
// Pick the smallest encoding for one channel of one block; returns a writer function and its size in bits.
function planSubframe(x, n, bps, scratch) {
  let first = x[0], same = true;
  for (let i = 1; i < n; i++) if (x[i] !== first) { same = false; break; }
  if (same) return { bits: 8 + bps, write: (w) => { w.put(0, 8); w.signed(first, bps); } };
  // wasted bits: trailing zeros every sample shares (a 16-bit song stored as 24-bit)
  let or = 0; for (let i = 0; i < n; i++) or |= x[i];
  let wasted = 0; while (!(or & 1) && wasted < bps - 1) { or >>= 1; wasted++; }
  let src = x;
  if (wasted) { src = scratch.shifted; for (let i = 0; i < n; i++) src[i] = x[i] >> wasted; }
  const b = bps - wasted, head = 8 + (wasted ? wasted : 0);
  const { res, u } = scratch;
  let best = { bits: head + n * b, kind: "verbatim" };
  // fixed predictors
  for (let order = 0; order <= Math.min(4, n - 1); order++) {
    fixedResidual(src, n, order, res); zigzag(res, order, u);
    const rc = riceChoice(u, n, order);
    if (!rc) continue;
    const bits = head + order * b + rc.bits;
    if (bits < best.bits) best = { bits, kind: "fixed", order, rc, u: u.slice(0, n) };
  }
  // LPC: estimate the best order from the prediction errors, then try it and the max
  if (n > 32) {
    const precision = b <= 16 ? 14 : 15;
    const cands = lpcCandidates(src, n, Math.min(MAX_LPC, n >> 2));
    if (cands.length) {
      const est = (c) => (n - c.order) * Math.max(0, 0.5 * Math.log2(Math.max(1e-12, c.err / n) * 2 * Math.PI * Math.E / 12)) + c.order * (precision + b);
      const sorted = cands.slice().sort((p, q) => est(p) - est(q));
      const tryOrders = [...new Set([sorted[0].order, sorted[1]?.order, cands[cands.length - 1].order].filter(Boolean))];
      for (const order of tryOrders) {
        const c = cands[order - 1], qz = quantizeLpc(c.coefs, precision);
        if (!qz) continue;
        lpcResidual(src, n, qz.q, qz.shift, res);
        let fits = true;
        for (let i = order; i < n; i++) if (res[i] > 2147483647 || res[i] < -2147483648) { fits = false; break; }
        if (!fits) continue;
        zigzag(res, order, u);
        const rc = riceChoice(u, n, order);
        if (!rc) continue;
        const bits = head + order * b + 4 + 5 + order * precision + rc.bits;
        if (bits < best.bits) best = { bits, kind: "lpc", order, rc, u: u.slice(0, n), q: qz.q, shift: qz.shift, precision };
      }
    }
  }
  const warm = src.slice(0, best.order || 0);
  const vals = best.kind === "verbatim" ? src.slice(0, n) : null;
  const header = (w, type) => { w.put(type << 1 | (wasted ? 1 : 0), 8); if (wasted) { w.zeros(wasted - 1); w.put(1, 1); } };
  return {
    bits: best.bits,
    write: (w) => {
      if (best.kind === "verbatim") { header(w, 1); for (let i = 0; i < n; i++) w.signed(vals[i], b); return; }
      if (best.kind === "fixed") { header(w, 8 + best.order); for (const v of warm) w.signed(v, b); writeResidual(w, best.u, n, best.order, best.rc); return; }
      header(w, 32 + best.order - 1);
      for (const v of warm) w.signed(v, b);
      w.put(best.precision - 1, 4); w.signed(best.shift, 5);
      for (const c of best.q) w.signed(c, best.precision);
      writeResidual(w, best.u, n, best.order, best.rc);
    },
  };
}

// ---------- frame header pieces ----------
function blockSizeCode(n) {
  const fixed = { 192: 1, 576: 2, 1152: 3, 2304: 4, 4608: 5, 256: 8, 512: 9, 1024: 10, 2048: 11, 4096: 12, 8192: 13, 16384: 14, 32768: 15 };
  if (fixed[n]) return { code: fixed[n] };
  return n <= 256 ? { code: 6, extra: [n - 1, 8] } : { code: 7, extra: [n - 1, 16] };
}
function rateCode(fs) {
  const fixed = { 88200: 1, 176400: 2, 192000: 3, 8000: 4, 16000: 5, 22050: 6, 24000: 7, 32000: 8, 44100: 9, 48000: 10, 96000: 11 };
  if (fixed[fs]) return { code: fixed[fs] };
  if (fs % 1000 === 0 && fs <= 255000) return { code: 12, extra: [fs / 1000, 8] };
  if (fs <= 65535) return { code: 13, extra: [fs, 16] };
  if (fs % 10 === 0 && fs <= 655350) return { code: 14, extra: [fs / 10, 16] };
  return { code: 0 };
}
const SIZE_CODE = { 8: 1, 12: 2, 16: 4, 20: 5, 24: 6, 32: 7 };
function utf8Num(w, v) { // FLAC's UTF-8-style frame number
  if (v < 0x80) { w.put(v, 8); return; }
  let bytes = 2; while (v >= 2 ** (5 * bytes + 1)) bytes++;
  const lead = (0xff00 >> bytes) & 0xff;
  w.put(lead | Math.floor(v / 2 ** (6 * (bytes - 1))), 8);
  for (let i = bytes - 2; i >= 0; i--) w.put(0x80 | (Math.floor(v / 2 ** (6 * i)) & 63), 8);
}

// ---------- metadata ----------
function metaBlock(type, body, last) {
  const h = new Uint8Array(4);
  h[0] = (last ? 0x80 : 0) | type; h[1] = (body.length >> 16) & 255; h[2] = (body.length >> 8) & 255; h[3] = body.length & 255;
  return concat([h, body]);
}
// Vorbis comments, the tag format FLAC (and Opus) use
export function vorbisComment(meta, vendor = "Encore Music Studio") {
  const pairs = [["TITLE", meta.title], ["ARTIST", meta.artist], ["ALBUMARTIST", meta.albumArtist], ["ALBUM", meta.album], ["DATE", meta.year], ["GENRE", meta.genre],
    ["TRACKNUMBER", meta.track], ["DISCNUMBER", meta.disc], ["COMPOSER", meta.composer], ["COPYRIGHT", meta.copyright], ["ISRC", meta.isrc], ["COMMENT", meta.comment]];
  if (meta.explicit) pairs.push(["ITUNESADVISORY", "1"]);
  const items = pairs.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "").map(([k, v]) => enc.encode(`${k}=${String(v).trim()}`));
  if (meta.extraComments) for (const s of meta.extraComments) items.push(enc.encode(s));
  const v = enc.encode(vendor), parts = [], le = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
  parts.push(le(v.length), v, le(items.length));
  for (const it of items) parts.push(le(it.length), it);
  return concat(parts);
}
// A FLAC PICTURE block body (also what Opus puts, base64, in METADATA_BLOCK_PICTURE)
export function pictureBlock(art, width = 0, height = 0) {
  const mime = enc.encode(art.mime || "image/jpeg"), b = new Uint8Array(32 + mime.length + art.bytes.length), dv = new DataView(b.buffer);
  dv.setUint32(0, 3); dv.setUint32(4, mime.length); b.set(mime, 8);
  let p = 8 + mime.length;
  dv.setUint32(p, 0); p += 4;                      // no description
  dv.setUint32(p, width); dv.setUint32(p + 4, height); dv.setUint32(p + 8, 24); dv.setUint32(p + 12, 0); p += 16;
  dv.setUint32(p, art.bytes.length); b.set(art.bytes, p + 4);
  return b;
}

// ---------- the encoder ----------
export function encodeFlac(ints, fs, bits, { meta = {}, art = null, artSize = null, onProgress } = {}) {
  const ch = ints.length, total = ints[0].length;
  if (ch < 1 || ch > 8) throw new Error("FLAC holds 1 to 8 channels.");
  if (!SIZE_CODE[bits]) throw new Error(`FLAC can't store ${bits}-bit audio here.`);
  const md5 = new MD5(), bpsBytes = Math.ceil(bits / 8);
  const frames = [];
  let minFrame = Infinity, maxFrame = 0;
  const scratch = { res: new Float64Array(BLOCK), u: new Float64Array(BLOCK), shifted: new Int32Array(BLOCK) };
  const md5buf = new Uint8Array(BLOCK * ch * bpsBytes);
  const L = new Int32Array(BLOCK), S = new Int32Array(BLOCK), M = new Int32Array(BLOCK), R = new Int32Array(BLOCK);
  const rc = rateCode(fs), w = new BitWriter(1 << 20);
  let lastReport = 0;
  for (let start = 0, num = 0; start < total; start += BLOCK, num++) {
    const n = Math.min(BLOCK, total - start);
    // MD5 of the raw samples: little-endian, interleaved
    let o = 0;
    for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const v = ints[c][start + i]; for (let k = 0; k < bpsBytes; k++) md5buf[o++] = (v >> (8 * k)) & 255; }
    md5.update(md5buf.subarray(0, o));
    // channel layout: for stereo, the cheapest of the four (judged by a 2nd-order guess)
    let assign = ch - 1, subs;
    const view = (c) => ints[c].subarray(start, start + n);
    if (ch === 2) {
      const l = view(0), r = view(1);
      for (let i = 0; i < n; i++) { L[i] = l[i]; R[i] = r[i]; S[i] = l[i] - r[i]; M[i] = (l[i] + r[i]) >> 1; }
      const cost = (x) => { let s = 0; for (let i = 2; i < n; i++) s += Math.abs(x[i] - 2 * x[i - 1] + x[i - 2]); return s; };
      const cl = cost(L), cr = cost(R), cs = cost(S), cm = cost(M);
      const opts = [[cl + cr, 1, [L, bits], [R, bits]], [cl + cs, 8, [L, bits], [S, bits + 1]], [cs + cr, 9, [S, bits + 1], [R, bits]], [cm + cs, 10, [M, bits], [S, bits + 1]]];
      opts.sort((a, b) => a[0] - b[0]);
      assign = opts[0][1];
      subs = [opts[0][2], opts[0][3]].map(([x, b]) => planSubframe(x.subarray(0, n), n, b, scratch));
    } else subs = Array.from({ length: ch }, (_, c) => planSubframe(view(c), n, bits, scratch));
    // header
    const frameStart = w.pos;
    const bsc = blockSizeCode(n);
    w.put(0xfff8, 16);                       // sync, fixed block size
    w.put(bsc.code, 4); w.put(rc.code, 4);
    w.put(assign, 4); w.put(SIZE_CODE[bits], 3); w.put(0, 1);
    utf8Num(w, num);
    if (bsc.extra) w.put(...bsc.extra);
    if (rc.extra) w.put(...rc.extra);
    w.put(crc8(w.buf, frameStart, w.pos), 8);
    for (const s of subs) s.write(w);
    w.align();
    w.put(crc16(w.buf, frameStart, w.pos), 16);
    const size = w.pos - frameStart;
    minFrame = Math.min(minFrame, size); maxFrame = Math.max(maxFrame, size);
    if (w.pos > 32 << 20) { frames.push(w.bytes().slice()); w.pos = 0; }
    const pct = (start + n) / total;
    if (onProgress && pct - lastReport >= 0.01) { lastReport = pct; onProgress(pct); }
  }
  if (w.pos) frames.push(w.bytes().slice());
  // STREAMINFO
  const si = new Uint8Array(34), sv = new DataView(si.buffer);
  sv.setUint16(0, total < BLOCK ? Math.max(16, total) : BLOCK); sv.setUint16(2, total < BLOCK ? Math.max(16, total) : BLOCK);
  if (!total) { minFrame = 0; maxFrame = 0; }
  si[4] = (minFrame >> 16) & 255; si[5] = (minFrame >> 8) & 255; si[6] = minFrame & 255;
  si[7] = (maxFrame >> 16) & 255; si[8] = (maxFrame >> 8) & 255; si[9] = maxFrame & 255;
  si[10] = (fs >> 12) & 255; si[11] = (fs >> 4) & 255;
  si[12] = ((fs & 15) << 4) | ((ch - 1) << 1) | (((bits - 1) >> 4) & 1);
  si[13] = (((bits - 1) & 15) << 4) | (Math.floor(total / 2 ** 32) & 15);
  sv.setUint32(14, total >>> 0);
  si.set(md5.digest(), 18);
  const blocks = [metaBlock(0, si, false), metaBlock(4, vorbisComment(meta), false)];
  if (art?.bytes?.length && art.bytes.length < (1 << 24) - 64) blocks.push(metaBlock(6, pictureBlock(art, artSize?.width, artSize?.height), false));
  blocks.push(metaBlock(1, new Uint8Array(1024), true)); // room for tag edits later
  return concat([enc.encode("fLaC"), ...blocks, ...frames]);
}

// ======================================================================
// Decoder (for verification): everything the encoder above writes, plus the
// usual features (variable block size, escapes), and checks the MD5
// ======================================================================
class BitReader {
  constructor(u8, pos = 0) { this.u8 = u8; this.pos = pos; this.bit = 0; }
  get(n) {
    let v = 0;
    while (n > 0) {
      const byte = this.u8[this.pos];
      if (byte === undefined) throw new Error("FLAC: ran out of data");
      const left = 8 - this.bit, take = Math.min(left, n);
      v = v * 2 ** take + ((byte >> (left - take)) & ((1 << take) - 1));
      this.bit += take; n -= take;
      if (this.bit === 8) { this.bit = 0; this.pos++; }
    }
    return v;
  }
  signed(n) { const v = this.get(n); return v >= 2 ** (n - 1) ? v - 2 ** n : v; }
  unary() { let q = 0; while (this.get(1) === 0) q++; return q; }
  align() { if (this.bit) { this.bit = 0; this.pos++; } }
}
export function decodeFlac(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (String.fromCharCode(...u8.subarray(0, 4)) !== "fLaC") throw new Error("not a FLAC file");
  let p = 4, fs = 0, ch = 0, bits = 0, total = 0, md5 = null, tags = [], picture = null;
  for (;;) {
    const last = u8[p] & 0x80, type = u8[p] & 0x7f, len = (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3], b = u8.subarray(p + 4, p + 4 + len);
    if (type === 0) {
      fs = (b[10] << 12) | (b[11] << 4) | (b[12] >> 4); ch = ((b[12] >> 1) & 7) + 1; bits = (((b[12] & 1) << 4) | (b[13] >> 4)) + 1;
      total = (b[13] & 15) * 2 ** 32 + ((b[14] << 24 | b[15] << 16 | b[16] << 8 | b[17]) >>> 0); md5 = b.slice(18, 34);
    } else if (type === 4) {
      const dv = new DataView(b.buffer, b.byteOffset, b.length); let q = 4 + dv.getUint32(0, true); const count = dv.getUint32(q, true); q += 4;
      for (let i = 0; i < count; i++) { const l = dv.getUint32(q, true); tags.push(new TextDecoder().decode(b.subarray(q + 4, q + 4 + l))); q += 4 + l; }
    } else if (type === 6) picture = b.slice();
    p += 4 + len;
    if (last) break;
  }
  const out = Array.from({ length: ch }, () => new Int32Array(total));
  let at = 0, frames = 0, crcErrors = 0;
  const r = new BitReader(u8, p);
  while (r.pos + 2 < u8.length && at < total) {
    const fstart = r.pos;
    if (r.get(14) !== 0x3ffe) throw new Error(`FLAC: lost sync at byte ${fstart}`);
    r.get(1); r.get(1);
    const bsc = r.get(4), rcode = r.get(4), assign = r.get(4), scode = r.get(3); r.get(1);
    // frame number (UTF-8 style)
    let first = r.get(8), extra = 0; while (first & (0x80 >> extra)) extra++;
    for (let i = 1; i < extra; i++) r.get(8);
    let n = bsc === 1 ? 192 : bsc >= 2 && bsc <= 5 ? 576 << (bsc - 2) : bsc >= 8 ? 256 << (bsc - 8) : 0;
    if (bsc === 6) n = r.get(8) + 1; else if (bsc === 7) n = r.get(16) + 1;
    if (rcode === 12) r.get(8); else if (rcode === 13 || rcode === 14) r.get(16);
    const fbits = { 0: bits, 1: 8, 2: 12, 4: 16, 5: 20, 6: 24, 7: 32 }[scode];
    const hcrc = r.get(8);
    if (crc8(u8, fstart, r.pos - 1) !== hcrc) crcErrors++;
    const nch = assign < 8 ? assign + 1 : 2, sub = [];
    for (let c = 0; c < nch; c++) {
      const side = (assign === 8 && c === 1) || (assign === 9 && c === 0) || (assign === 10 && c === 1);
      let bps = fbits + (side ? 1 : 0);
      r.get(1);
      const type = r.get(6);
      let wasted = 0;
      if (r.get(1)) wasted = r.unary() + 1;
      bps -= wasted;
      const x = new Float64Array(n);
      if (type === 0) { const v = r.signed(bps); x.fill(v); }
      else if (type === 1) { for (let i = 0; i < n; i++) x[i] = r.signed(bps); }
      else {
        let order, coefs = null, shift = 0;
        if (type >= 8 && type <= 12) order = type - 8; else if (type >= 32) order = type - 31; else throw new Error("FLAC: reserved subframe type");
        for (let i = 0; i < order; i++) x[i] = r.signed(bps);
        if (type >= 32) { const prec = r.get(4) + 1; shift = r.signed(5); coefs = []; for (let i = 0; i < order; i++) coefs.push(r.signed(prec)); }
        // residual
        const method = r.get(2), po = r.get(4), pb = method ? 5 : 4, esc = method ? 31 : 15, parts = 1 << po;
        let i = order;
        for (let part = 0; part < parts; part++) {
          const cnt = (n >> po) - (part === 0 ? order : 0), k = r.get(pb);
          if (k === esc) { const eb = r.get(5); for (let j = 0; j < cnt; j++) x[i++] = eb ? r.signed(eb) : 0; }
          else for (let j = 0; j < cnt; j++) { const q = r.unary(), v = q * 2 ** k + (k ? r.get(k) : 0); x[i++] = v % 2 ? -(v + 1) / 2 : v / 2; }
        }
        if (coefs) {
          const div = 2 ** shift;
          for (let i2 = order; i2 < n; i2++) { let s = 0; for (let j = 0; j < order; j++) s += coefs[j] * x[i2 - j - 1]; x[i2] += Math.floor(s / div); }
        } else {
          for (let i2 = order; i2 < n; i2++) {
            x[i2] += order === 1 ? x[i2 - 1] : order === 2 ? 2 * x[i2 - 1] - x[i2 - 2] : order === 3 ? 3 * x[i2 - 1] - 3 * x[i2 - 2] + x[i2 - 3] : order === 4 ? 4 * x[i2 - 1] - 6 * x[i2 - 2] + 4 * x[i2 - 3] - x[i2 - 4] : 0;
          }
        }
      }
      if (wasted) for (let i = 0; i < n; i++) x[i] *= 2 ** wasted;
      sub.push(x);
    }
    r.align();
    const fcrc = r.get(16);
    if (crc16(u8, fstart, r.pos - 2) !== fcrc) crcErrors++;
    for (let i = 0; i < n && at + i < total; i++) {
      let a = sub[0][i], b = sub[1]?.[i];
      if (assign === 8) b = a - b; else if (assign === 9) a = a + b; else if (assign === 10) { const s = b, m = a * 2 + (s & 1); a = (m + s) / 2; b = (m - s) / 2; }
      out[0][at + i] = a; if (nch > 1) out[1][at + i] = b;
      for (let c = 2; c < nch; c++) out[c][at + i] = sub[c][i];
    }
    at += n; frames++;
  }
  // MD5 check
  const m = new MD5(), bb = Math.ceil(bits / 8), buf = new Uint8Array(4096 * ch * bb);
  for (let s = 0; s < total; s += 4096) {
    let o = 0; const e = Math.min(total, s + 4096);
    for (let i = s; i < e; i++) for (let c = 0; c < ch; c++) { const v = out[c][i]; for (let k = 0; k < bb; k++) buf[o++] = (v >> (8 * k)) & 255; }
    m.update(buf.subarray(0, o));
  }
  const got = m.digest();
  return { chans: out, fs, bits, channels: ch, total, frames, crcErrors, md5ok: got.every((v, i) => v === md5[i]), tags, picture };
}
