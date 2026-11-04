// Encore Convert: Apple Lossless (ALAC), both ways. Plain JS, runs in the
// worker and in Node, written from Apple's open-source ALAC description
// (Apache 2.0): the same adaptive predictor and adaptive Golomb coder, so any
// ALAC player reads what this writes and this reads what iTunes writes.
//   encodeAlacPackets(ints, bits, { onProgress }) -> { packets, cookie, samples }
//     ints: Int32Array (or Int16Array) per channel, 1 to 8 channels, bits 16/20/24/32
//     packets: one Uint8Array per 4096 samples; cookie: the 24-byte ALACSpecificConfig
//   decodeAlacInts(bytes) -> { ints, fs, bitDepth, channels } | null
//   decodeAlac(bytes) -> { chans: Float32Array[], fs, bitDepth, channels } | null
//     an .m4a/.mp4/.mov with an 'alac' track, or a .caf with ALAC; null for
//     anything else (an AAC .m4a goes on to the browser's decoder)
//   isAlac(bytes) -> boolean
// Per packet and channel the encoder tries predictor orders 4, 8 and 16 (each
// keeps adapting from packet to packet, the way Apple's does) and keeps the
// smallest; stereo picks the best of five mid/side mixes; a packet that won't
// compress (pure noise) is stored plain. Loud 24 and 32-bit audio has its low
// 8 or 16 bits stored as is, like Apple's encoder, so the predictor's sums stay
// inside 32 bits.

export const FRAME = 4096;
const PB0 = 40, MB0 = 10, KB0 = 14, MAX_RUN = 255, DENSHIFT = 9, MIX_BITS = 2;
const QBSHIFT = 9, QB = 1 << QBSHIFT, MMULSHIFT = 2, MDENSHIFT = QBSHIFT - MMULSHIFT - 1, MOFF = 1 << (MDENSHIFT - 2);
const BITOFF = 24, MAX_PREFIX = 9, MEAN_CLAMP = 0xffff, WB = (1 << KB0) - 1;
const ID_SCE = 0, ID_CPE = 1, ID_LFE = 3, ID_DSE = 4, ID_FIL = 6, ID_END = 7;
const ORDERS = [4, 8, 16];
// channel elements for 1-8 channels (S = mono, C = pair), and where each coded
// channel sits in WAV order (ALAC puts the centre first)
const LAYOUT = ["S", "C", "SC", "SCS", "SCC", "SCCS", "SCCSS", "SCCCS"];
const SLOT_TO_WAV = [[0], [0, 1], [2, 0, 1], [2, 0, 1, 3], [2, 0, 1, 3, 4], [2, 0, 1, 4, 5, 3], [2, 0, 1, 4, 5, 6, 3], [2, 6, 7, 0, 1, 4, 5, 3]];

const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
const lg3a = (x) => 31 - Math.clz32(x + 3);

// ---------- bits ----------
class BitWriter {
  constructor(cap = 1 << 15) { this.buf = new Uint8Array(cap); this.pos = 0; this.acc = 0; this.n = 0; }
  grow(k) { if (this.pos + k <= this.buf.length) return; let c = this.buf.length * 2; while (c < this.pos + k) c *= 2; const b = new Uint8Array(c); b.set(this.buf.subarray(0, this.pos)); this.buf = b; }
  // v unsigned (or a signed value masked to n bits), n <= 32
  put(v, n) {
    if (n > 16) { this.put(Math.floor((v >>> 0) / 65536) & ((1 << (n - 16)) - 1), n - 16); v &= 0xffff; n = 16; }
    if (!n) return;
    this.acc = (this.acc << n) | (v & ((1 << n) - 1)); this.n += n;
    if (this.n >= 8) {
      this.grow(4);
      while (this.n >= 8) { this.n -= 8; this.buf[this.pos++] = (this.acc >>> this.n) & 255; }
      this.acc &= (1 << this.n) - 1;
    }
  }
  ones(k) { while (k > 16) { this.put(0xffff, 16); k -= 16; } this.put((1 << k) - 1, k); }
  align() { if (this.n) this.put(0, 8 - this.n); }
  get bits() { return this.pos * 8 + this.n; }
  bytes() { return this.buf.slice(0, this.pos); }
}
class BitReader {
  constructor(u8) { this.u8 = u8; this.pos = 0; }
  // the next 32 bits (zeros past the end), without moving
  peek() {
    const u = this.u8, i = this.pos >> 3, s = this.pos & 7;
    const hi = ((u[i] << 24) | (u[i + 1] << 16) | (u[i + 2] << 8) | u[i + 3]) >>> 0;
    return s ? ((hi << s) | ((u[i + 4] | 0) >>> (8 - s))) >>> 0 : hi;
  }
  read(n) { if (!n) return 0; const v = this.peek() >>> (32 - n); this.pos += n; return n === 32 ? v >>> 0 : v; }
  signed(n) { const v = this.read(n); return n === 32 ? v | 0 : (v << (32 - n)) >> (32 - n); }
  align() { this.pos = (this.pos + 7) & ~7; }
}

// ---------- the adaptive predictor (pc_block / unpc_block) ----------
function initCoefs(c) { c.fill(0); c[0] = (38 << DENSHIFT) >> 4; c[1] = (-29 << DENSHIFT) >> 4; c[2] = (2 << DENSHIFT) >> 4; }
// samples -> residuals; coefs adapt in place (Int16Array, wraps like the C)
function predict(x, res, num, coefs, active, chanBits, den) {
  const cs = 32 - chanBits, half = 1 << (den - 1);
  if (!num) return;
  res[0] = x[0];
  if (active === 0) { for (let j = 1; j < num; j++) res[j] = x[j]; return; }
  const lead = active === 31 ? num : Math.min(num, active + 1);
  for (let j = 1; j < lead; j++) res[j] = (((x[j] - x[j - 1]) | 0) << cs) >> cs;
  if (active === 31) return;
  const lim = active + 1;
  for (let j = lim; j < num; j++) {
    const top = x[j - lim];
    let sum = 0;
    for (let k = 0; k < active; k++) sum = (sum + Math.imul(coefs[k], (x[j - 1 - k] - top) | 0)) | 0;
    let del = (x[j] - top - (((sum + half) | 0) >> den)) | 0;
    del = (del << cs) >> cs;
    res[j] = del;
    adapt(x, j, top, coefs, active, del, den);
  }
}
function adapt(x, j, top, coefs, active, del0, den) {
  if (del0 > 0) {
    for (let k = active - 1; k >= 0; k--) {
      const dd = (top - x[j - 1 - k]) | 0, sg = sign(dd);
      coefs[k] -= sg;
      del0 = (del0 - Math.imul(active - k, Math.imul(sg, dd) >> den)) | 0;
      if (del0 <= 0) break;
    }
  } else if (del0 < 0) {
    for (let k = active - 1; k >= 0; k--) {
      const dd = (top - x[j - 1 - k]) | 0, sg = sign(dd);
      coefs[k] += sg;
      del0 = (del0 - Math.imul(active - k, Math.imul(-sg, dd) >> den)) | 0;
      if (del0 >= 0) break;
    }
  }
}
// residuals -> samples (in place is fine)
function unpredict(res, out, num, coefs, active, chanBits, den) {
  const cs = 32 - chanBits, half = 1 << (den - 1);
  if (!num) return;
  out[0] = res[0];
  if (active === 0) { for (let j = 1; j < num; j++) out[j] = res[j]; return; }
  const lead = active === 31 ? num : Math.min(num, active + 1);
  for (let j = 1; j < lead; j++) out[j] = (((res[j] + out[j - 1]) | 0) << cs) >> cs;
  if (active === 31) return;
  const lim = active + 1;
  for (let j = lim; j < num; j++) {
    const top = out[j - lim];
    let sum = 0;
    for (let k = 0; k < active; k++) sum = (sum + Math.imul(coefs[k], (out[j - 1 - k] - top) | 0)) | 0;
    const del0 = res[j];
    out[j] = ((((del0 + top + (((sum + half) | 0) >> den)) | 0)) << cs) >> cs;
    adapt(out, j, top, coefs, active, del0, den);
  }
}

// ---------- the adaptive Golomb coder (dyn_comp / dyn_decomp) ----------
// one value: q ones and a zero, then the remainder in k or k-1 bits; 9 ones
// and the raw value (in `raw` bits) when q would be 9 or more
function putValue(bw, n, m, k, raw) {
  const q = Math.floor(n / m);
  if (q < MAX_PREFIX) {
    let bits = q + 1;
    if (k !== 1) { const r = n - q * m; bits += r ? k : k - 1; if (bw) { bw.ones(q); bw.put(0, 1); if (r) bw.put(r + 1, k); else bw.put(0, k - 1); } }
    else if (bw) { bw.ones(q); bw.put(0, 1); }
    return bits;
  }
  if (bw) { bw.ones(MAX_PREFIX); bw.put(n, raw); }
  return MAX_PREFIX + raw;
}
function getValue(br, m, k, raw) {
  const pre = Math.clz32(~br.peek());
  if (pre >= MAX_PREFIX) { br.pos += MAX_PREFIX; return br.read(raw); }
  br.pos += pre + 1;
  if (k === 1) return pre;
  const v = br.peek() >>> (32 - k);
  if (v >= 2) { br.pos += k; return pre * m + v - 1; }
  br.pos += k - 1;
  return pre * m;
}
// codes res[0..num) (or just counts the bits when bw is null)
function agCode(bw, res, num, chanBits, pb) {
  let mb = MB0, zmode = 0, c = 0, bits = 0;
  while (c < num) {
    const k = Math.min(lg3a(Math.floor(mb / QB)), KB0), m = (1 << k) - 1;
    const v = res[c], zz = v >= 0 ? 2 * v : -2 * v - 1, n = zz - zmode;
    bits += putValue(bw, n, m, k, chanBits);
    c++;
    mb = pb * zz + mb - Math.floor((pb * mb) / QB);
    if (n > MEAN_CLAMP) mb = MEAN_CLAMP;
    zmode = 0;
    if (mb * (1 << MMULSHIFT) < QB && c < num) {
      zmode = 1;
      let z = 0;
      while (c + z < num && res[c + z] === 0 && z < 65535) z++;
      const kz = Math.clz32(mb) - BITOFF + ((mb + MOFF) >> MDENSHIFT), mz = ((1 << kz) - 1) & WB;
      bits += putValue(bw, z, mz, kz, 16);
      c += z;
      if (z >= 65535) zmode = 0;
      mb = 0;
    }
  }
  return bits;
}
function agDecode(br, out, num, chanBits, pb, mb0, kb) {
  const wb = (1 << kb) - 1;
  let mb = mb0, zmode = 0, c = 0;
  while (c < num) {
    const k = Math.min(lg3a(Math.floor(mb / QB)), kb), m = (1 << k) - 1;
    const n = getValue(br, m, k, chanBits), nd = n + zmode;
    out[c++] = nd & 1 ? -((nd + 1) >>> 1) : nd >>> 1;
    mb = pb * nd + mb - Math.floor((pb * mb) / QB);
    if (n > MEAN_CLAMP) mb = MEAN_CLAMP;
    zmode = 0;
    if (mb * (1 << MMULSHIFT) < QB && c < num) {
      zmode = 1;
      const kz = Math.clz32(mb) - BITOFF + ((mb + MOFF) >> MDENSHIFT), mz = ((1 << kz) - 1) & wb;
      const z = getValue(br, mz, kz, 16);
      if (c + z > num) throw new Error("ALAC: a run of silence runs past the packet");
      for (let j = 0; j < z; j++) out[c++] = 0;
      if (z >= 65535) zmode = 0;
      mb = 0;
    }
  }
}

// ---------- encoder ----------
// One coded channel: the predictor order that codes smallest. state.coefs[o]
// carries each order's adapted coefficients into the next packet.
function bestChannel(x, num, chanBits, state, scratch) {
  let best = null;
  for (const order of ORDERS) {
    const start = state.coefs[order], trial = start.slice(), res = scratch[order];
    predict(x, res, num, trial, order, chanBits, DENSHIFT);
    const bits = 16 + 16 * order + agCode(null, res, num, chanBits, PB0);
    if (!best || bits < best.bits) best = { order, coefs: start.slice(), res, bits };
    state.next[order] = trial;
  }
  for (const o of ORDERS) if (state.next[o]) state.coefs[o] = state.next[o];
  state.next = {};
  return best;
}
function channelHead(bw, b) {
  bw.put(0, 4); bw.put(DENSHIFT, 4); bw.put(4, 3); bw.put(b.order, 5); // mode 0, pb factor 4 (pb 40)
  for (let i = 0; i < b.order; i++) bw.put(b.coefs[i] & 0xffff, 16);
}
// the stereo mix (u, v) with the smallest rough cost, of mixRes 0..4
function pickMix(l, r, num) {
  let best = 0, bestCost = Infinity;
  for (let res = 0; res <= 1 << MIX_BITS; res++) {
    let cost = 0, u1 = 0, u2 = 0, v1 = 0, v2 = 0;
    for (let i = 0; i < num; i += 2) {
      const v = res ? l[i] - r[i] : r[i], u = res ? r[i] + ((res * v) >> MIX_BITS) : l[i];
      cost += Math.abs(u - 2 * u1 + u2) + Math.abs(v - 2 * v1 + v2);
      u2 = u1; u1 = u; v2 = v1; v1 = v;
    }
    if (cost < bestCost) { bestCost = cost; best = res; }
  }
  return best;
}
// 24 and 32-bit: the low byte(s) stored as is, except in a quiet 24-bit packet
// (under 16 bits' worth), where the whole sample is small enough to predict
// directly. 32-bit always shifts: unshifted, a pair would need 33-bit channels.
function shiftOf(bits, chans, from, num) {
  if (bits === 32) return 2;
  if (bits < 24) return 0;
  for (const c of chans) for (let i = from; i < from + num; i++) if (c[i] >= 32768 || c[i] < -32768) return bits === 32 ? 2 : 1;
  return 0;
}
// one element (mono or pair) of one packet into bw
function encodeElement(bw, type, tag, chans, from, num, bitDepth, partial, states, scratch) {
  const shiftBytes = shiftOf(bitDepth, chans, from, num), shift = shiftBytes * 8, mask = (1 << shift) - 1;
  const pair = type === "C", nch = pair ? 2 : 1, chanBits = bitDepth - shift + (pair ? 1 : 0);
  const head = (escape, sb) => {
    bw.put(pair ? ID_CPE : ID_SCE, 3); bw.put(tag, 4); bw.put(0, 12);
    bw.put((partial ? 8 : 0) | (sb << 1) | (escape ? 1 : 0), 4);
    if (partial) bw.put(num, 32);
  };
  // the shifted-off low bits, and what's left of each channel
  const hi = [], lo = [];
  for (let c = 0; c < nch; c++) {
    const src = chans[c], h = new Int32Array(num), l = shift ? new Int32Array(num) : null;
    for (let i = 0; i < num; i++) { const s = src[from + i]; h[i] = s >> shift; if (l) l[i] = s & mask; }
    hi.push(h); lo.push(l);
  }
  let mixRes = 0, U = hi[0], V = null;
  if (pair) {
    mixRes = pickMix(hi[0], hi[1], num);
    if (mixRes) {
      U = new Int32Array(num); V = new Int32Array(num);
      for (let i = 0; i < num; i++) { const v = hi[0][i] - hi[1][i]; V[i] = v; U[i] = hi[1][i] + ((mixRes * v) >> MIX_BITS); }
    } else V = hi[1];
  }
  const save = states.map((s) => ({ coefs: { ...s.coefs } }));
  const bu = bestChannel(U, num, chanBits, states[0], scratch[0]);
  const bv = pair ? bestChannel(V, num, chanBits, states[1], scratch[1]) : null;
  const coded = 23 + (partial ? 32 : 0) + 16 + bu.bits + (bv ? bv.bits : 0) + shift * nch * num;
  const plain = 23 + (partial ? 32 : 0) + bitDepth * nch * num;
  if (coded >= plain) {
    // stored plain; the predictors pick up from where they were
    states.forEach((s, i) => { s.coefs = save[i].coefs; });
    head(true, 0);
    for (let i = 0; i < num; i++) for (let c = 0; c < nch; c++) bw.put(chans[c][from + i], bitDepth);
    return;
  }
  head(false, shiftBytes);
  bw.put(MIX_BITS * (mixRes ? 1 : 0), 8); bw.put(mixRes, 8);
  channelHead(bw, bu); if (bv) channelHead(bw, bv);
  if (shift) for (let i = 0; i < num; i++) for (let c = 0; c < nch; c++) bw.put(lo[c][i], shift);
  agCode(bw, bu.res, num, chanBits, PB0);
  if (bv) agCode(bw, bv.res, num, chanBits, PB0);
}
export function alacCookie({ bits, channels, rate, maxFrameBytes = 0, avgBitRate = 0 }) {
  const b = new Uint8Array(24), dv = new DataView(b.buffer);
  dv.setUint32(0, FRAME); b[4] = 0; b[5] = bits; b[6] = PB0; b[7] = MB0; b[8] = KB0; b[9] = channels;
  dv.setUint16(10, MAX_RUN); dv.setUint32(12, maxFrameBytes); dv.setUint32(16, avgBitRate); dv.setUint32(20, rate);
  return b;
}
export function encodeAlacPackets(ints, bits, { rate = 44100, onProgress } = {}) {
  const ch = ints.length, n = ints[0]?.length || 0;
  if (ch < 1 || ch > 8) throw new Error("Apple Lossless here takes 1 to 8 channels.");
  if (![16, 20, 24, 32].includes(bits)) throw new Error("Apple Lossless takes 16, 20, 24 or 32-bit audio.");
  const layout = LAYOUT[ch - 1], map = SLOT_TO_WAV[ch - 1];
  const slots = map.map((w) => ints[w]);
  const newState = () => { const s = { coefs: {}, next: {} }; for (const o of ORDERS) { s.coefs[o] = new Int16Array(32); initCoefs(s.coefs[o]); } return s; };
  const states = slots.map(newState);
  const scratch = slots.map(() => Object.fromEntries(ORDERS.map((o) => [o, new Int32Array(FRAME)])));
  const packets = [];
  let maxBytes = 0, total = 0;
  for (let from = 0; from < n; from += FRAME) {
    const num = Math.min(FRAME, n - from), bw = new BitWriter(num * ch * 4 + 64);
    let slot = 0, sce = 0, cpe = 0;
    for (const t of layout) {
      const k = t === "C" ? 2 : 1;
      encodeElement(bw, t, t === "C" ? cpe++ : sce++, slots.slice(slot, slot + k), from, num, bits, num !== FRAME, states.slice(slot, slot + k), scratch.slice(slot, slot + k));
      slot += k;
    }
    bw.put(ID_END, 3); bw.align();
    const p = bw.bytes();
    packets.push(p); maxBytes = Math.max(maxBytes, p.length); total += p.length;
    if (onProgress && packets.length % 16 === 0) onProgress((from + num) / n);
  }
  onProgress?.(1);
  const avgBitRate = n ? Math.round((total * 8 * rate) / n) : 0;
  return { packets, samples: n, cookie: alacCookie({ bits, channels: ch, rate, maxFrameBytes: maxBytes, avgBitRate }) };
}

// ---------- decoder ----------
function parseCookie(u8) {
  let p = 0;
  const tag = (o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
  // older files wrap it: a 'frma' atom, then an 'alac' atom with its version
  if (u8.length >= p + 12 && tag(p + 4) === "frma") p += 12;
  if (u8.length >= p + 12 && tag(p + 4) === "alac") p += 12;
  if (u8.length < p + 24) return null;
  const dv = new DataView(u8.buffer, u8.byteOffset + p, 24);
  const c = { frameLength: dv.getUint32(0), bitDepth: u8[p + 5], pb: u8[p + 6], mb: u8[p + 7], kb: u8[p + 8], channels: u8[p + 9],
    maxRun: dv.getUint16(10), maxFrameBytes: dv.getUint32(12), avgBitRate: dv.getUint32(16), rate: dv.getUint32(20) };
  if (!c.frameLength || c.frameLength > 1 << 20 || ![16, 20, 24, 32].includes(c.bitDepth) || c.channels < 1 || c.channels > 8) return null;
  return c;
}
// one packet into out[slot][at..]; returns how many samples it held
function decodePacket(u8, cfg, out, at, work) {
  const br = new BitReader(u8);
  let slot = 0, got = cfg.frameLength;
  for (;;) {
    if (br.pos >= u8.length * 8) break;
    const tag = br.read(3);
    if (tag === ID_END) break;
    if (tag === ID_DSE) { br.read(4); const align = br.read(1); let count = br.read(8); if (count === 255) count += br.read(8); if (align) br.align(); br.pos += count * 8; continue; }
    if (tag === ID_FIL) { let count = br.read(4); if (count === 15) count += br.read(8) - 1; br.pos += count * 8; continue; }
    if (tag !== ID_SCE && tag !== ID_LFE && tag !== ID_CPE) throw new Error("ALAC: an element this decoder doesn't know (" + tag + ")");
    const pair = tag === ID_CPE, nch = pair ? 2 : 1;
    if (slot + nch > cfg.channels) throw new Error("ALAC: more channels in the packet than in the header");
    br.read(4);
    if (br.read(12) !== 0) throw new Error("ALAC: a bad element header");
    const hb = br.read(4), partial = hb >> 3, shiftBytes = (hb >> 1) & 3, escape = hb & 1;
    const num = partial ? br.read(32) : cfg.frameLength;
    if (num > cfg.frameLength) throw new Error("ALAC: a packet longer than the header allows");
    got = num;
    const bd = cfg.bitDepth, dst = [out[slot], out[slot + 1]];
    if (escape) {
      for (let i = 0; i < num; i++) for (let c = 0; c < nch; c++) dst[c][at + i] = br.signed(bd);
    } else {
      const shift = shiftBytes * 8, chanBits = bd - shift + (pair ? 1 : 0);
      const mixBits = br.read(8), mixRes = (br.read(8) << 24) >> 24;
      const heads = [];
      for (let c = 0; c < nch; c++) {
        const mode = br.read(4), den = br.read(4), pbf = br.read(3), order = br.read(5), coefs = new Int16Array(32);
        for (let i = 0; i < order; i++) coefs[i] = br.read(16);
        heads.push({ mode, den, pb: (cfg.pb * pbf) >> 2, order, coefs });
      }
      let lowAt = 0;
      if (shift) { lowAt = br.pos; br.pos += shift * nch * num; }
      const mixed = [work[0], work[1]];
      for (let c = 0; c < nch; c++) {
        const h = heads[c], res = mixed[c];
        agDecode(br, res, num, chanBits, h.pb, cfg.mb, cfg.kb);
        if (h.mode !== 0) unpredict(res, res, num, null, 31, chanBits, 0);
        unpredict(res, res, num, h.coefs, h.order, chanBits, h.den);
      }
      const u = mixed[0], v = mixed[1];
      for (let i = 0; i < num; i++) {
        let l = u[i], r = 0;
        if (pair) { if (mixRes) { l = u[i] + v[i] - ((mixRes * v[i]) >> mixBits); r = l - v[i]; } else r = v[i]; }
        dst[0][at + i] = l; if (pair) dst[1][at + i] = r;
      }
      if (shift) {
        const keep = br.pos;
        br.pos = lowAt;
        for (let i = 0; i < num; i++) for (let c = 0; c < nch; c++) dst[c][at + i] = (dst[c][at + i] << shift) | br.read(shift);
        br.pos = keep;
      }
    }
    slot += nch;
  }
  return got;
}
function decodePackets(cfg, packetList, total, fs) {
  const slots = Array.from({ length: cfg.channels }, () => new Int32Array(total + cfg.frameLength));
  const work = [new Int32Array(cfg.frameLength), new Int32Array(cfg.frameLength)];
  let at = 0;
  for (const p of packetList) { if (at >= total) break; at += decodePacket(p, cfg, slots, at, work); }
  const len = Math.min(at, total), map = SLOT_TO_WAV[cfg.channels - 1], ints = new Array(cfg.channels);
  map.forEach((w, s) => { ints[w] = slots[s].slice(0, len); });
  return { ints, fs, bitDepth: cfg.bitDepth, channels: cfg.channels };
}

// ---------- containers ----------
const str4 = (u8, o) => String.fromCharCode(u8[o], u8[o + 1], u8[o + 2], u8[o + 3]);
const be32 = (u8, o) => ((u8[o] << 24) | (u8[o + 1] << 16) | (u8[o + 2] << 8) | u8[o + 3]) >>> 0;
const be64 = (u8, o) => be32(u8, o) * 2 ** 32 + be32(u8, o + 4);
function boxes(u8, from, to) {
  const out = [];
  for (let p = from; p + 8 <= to;) {
    let size = be32(u8, p), head = 8;
    if (size === 1) { size = be64(u8, p + 8); head = 16; } else if (size === 0) size = to - p;
    if (size < head || p + size > to) break;
    out.push({ type: str4(u8, p + 4), start: p, body: p + head, end: p + size });
    p += size;
  }
  return out;
}
const child = (u8, b, type, skip = 0) => b && boxes(u8, b.body + skip, b.end).find((x) => x.type === type);
const path = (u8, b, ...types) => { for (const t of types) b = child(u8, b, t); return b; };
// the 'alac' track of an MP4: { cookie, stbl } or null
function mp4AlacTrack(u8) {
  const moov = boxes(u8, 0, u8.length).find((b) => b.type === "moov");
  if (!moov) return null;
  for (const trak of boxes(u8, moov.body, moov.end).filter((b) => b.type === "trak")) {
    const mdia = child(u8, trak, "mdia"), stbl = path(u8, mdia, "minf", "stbl"), stsd = child(u8, stbl, "stsd");
    if (!stsd) continue;
    const entry = boxes(u8, stsd.body + 8, stsd.end)[0];
    if (!entry || entry.type !== "alac") continue;
    // the cookie: an 'alac' atom inside the sample entry (or inside its 'wave' box)
    for (let p = entry.body + 28; p + 36 <= entry.end; p++) {
      if (str4(u8, p + 4) === "alac" && be32(u8, p) >= 36 && p + be32(u8, p) <= entry.end) {
        const cfg = parseCookie(u8.subarray(p + 12, p + be32(u8, p)));
        if (cfg) return { cfg, stbl, mdhd: child(u8, mdia, "mdhd") };
      }
    }
  }
  return null;
}
function decodeMp4(u8) {
  const t = mp4AlacTrack(u8);
  if (!t) return null;
  const { cfg, stbl } = t, get = (type) => child(u8, stbl, type);
  const stsz = get("stsz"), stsc = get("stsc"), stco = get("stco"), co64 = get("co64"), stts = get("stts");
  if (!stsz || !stsc || !(stco || co64)) throw new Error("ALAC: the MP4 sample tables are missing");
  const fixed = be32(u8, stsz.body + 4), count = be32(u8, stsz.body + 8);
  const sizes = Array.from({ length: count }, (_, i) => (fixed || be32(u8, stsz.body + 12 + 4 * i)));
  const chunks = co64 ? Array.from({ length: be32(u8, co64.body + 4) }, (_, i) => be64(u8, co64.body + 8 + 8 * i))
    : Array.from({ length: be32(u8, stco.body + 4) }, (_, i) => be32(u8, stco.body + 8 + 4 * i));
  const runs = Array.from({ length: be32(u8, stsc.body + 4) }, (_, i) => ({ first: be32(u8, stsc.body + 8 + 12 * i) - 1, per: be32(u8, stsc.body + 12 + 12 * i) }));
  const packets = [];
  let s = 0;
  for (let r = 0; r < runs.length && s < count; r++) {
    const end = r + 1 < runs.length ? runs[r + 1].first : chunks.length;
    for (let c = runs[r].first; c < end && s < count; c++) {
      let off = chunks[c];
      for (let k = 0; k < runs[r].per && s < count; k++, s++) { packets.push(u8.subarray(off, off + sizes[s])); off += sizes[s]; }
    }
  }
  let total = 0;
  if (stts) for (let i = 0, e = be32(u8, stts.body + 4); i < e; i++) total += be32(u8, stts.body + 8 + 8 * i) * be32(u8, stts.body + 12 + 8 * i);
  // the media timescale is the sample rate for audio; if not, scale the length
  const scale = t.mdhd ? (u8[t.mdhd.body] === 1 ? be32(u8, t.mdhd.body + 20) : be32(u8, t.mdhd.body + 12)) : cfg.rate;
  if (scale && scale !== cfg.rate) total = Math.round((total * cfg.rate) / scale);
  if (!total) total = count * cfg.frameLength;
  return decodePackets(cfg, packets, total, cfg.rate);
}
function cafChunks(u8) {
  const out = {};
  for (let p = 8; p + 12 <= u8.length;) {
    const type = str4(u8, p);
    let size = be64(u8, p + 4);
    if (be32(u8, p + 4) === 0xffffffff && be32(u8, p + 8) === 0xffffffff) size = u8.length - p - 12; // data to the end
    out[type] = out[type] || { body: p + 12, end: Math.min(u8.length, p + 12 + size) };
    p += 12 + size;
  }
  return out;
}
function cafDesc(u8) {
  if (str4(u8, 0) !== "caff") return null;
  const ch = cafChunks(u8), desc = ch.desc;
  if (!desc) return null;
  return { ch, fs: new DataView(u8.buffer, u8.byteOffset + desc.body, 8).getFloat64(0), format: str4(u8, desc.body + 8) };
}
function decodeCaf(u8) {
  const d = cafDesc(u8);
  if (!d || d.format !== "alac") return null;
  const { ch } = d, kuki = ch.kuki, pakt = ch.pakt, data = ch.data;
  if (!kuki || !pakt || !data) throw new Error("ALAC: the CAF file is missing its cookie, packet table or audio");
  const cfg = parseCookie(u8.subarray(kuki.body, kuki.end));
  if (!cfg) throw new Error("ALAC: a CAF cookie this decoder can't read");
  const nPackets = be64(u8, pakt.body), valid = be64(u8, pakt.body + 8), priming = be32(u8, pakt.body + 16);
  // packet sizes are variable-length numbers, 7 bits a byte
  const packets = [];
  let q = pakt.body + 24, off = data.body + 4; // the data chunk starts with an edit count
  for (let i = 0; i < nPackets && q < pakt.end; i++) {
    let v = 0, b;
    do { b = u8[q++]; v = v * 128 + (b & 127); } while (b & 128);
    packets.push(u8.subarray(off, off + v)); off += v;
  }
  const r = decodePackets(cfg, packets, valid + priming || nPackets * cfg.frameLength, Math.round(d.fs) || cfg.rate);
  if (priming) r.ints = r.ints.map((c) => c.slice(priming));
  return r;
}

export function isAlac(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    if (str4(u8, 0) === "caff") return cafDesc(u8)?.format === "alac";
    return !!mp4AlacTrack(u8);
  } catch { return false; }
}
export function decodeAlacInts(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u8.length < 12) return null;
  return str4(u8, 0) === "caff" ? decodeCaf(u8) : decodeMp4(u8);
}
export function decodeAlac(bytes) {
  const d = decodeAlacInts(bytes);
  if (!d) return null;
  const scale = 1 / 2 ** (d.bitDepth - 1);
  const chans = d.ints.map((c) => { const f = new Float32Array(c.length); for (let i = 0; i < c.length; i++) f[i] = c[i] * scale; return f; });
  return { chans, fs: d.fs, bitDepth: d.bitDepth, channels: d.channels };
}
