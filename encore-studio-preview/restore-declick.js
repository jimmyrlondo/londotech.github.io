// Encore Restore: de-click and de-crackle.
//
// How it hears a click: music is predictable from the last few milliseconds
// (an AR model: each sample is close to a weighted sum of the ones before it).
// A click isn't, so where the prediction error jumps far above its usual level
// for a moment, something was added. The error is checked forwards and
// backwards and the smaller of the two kept, which pins the click down to the
// samples it actually hit.
//
// How it leaves the music alone: a drum hit or an accordion attack is also
// unpredictable, but it stays busy afterwards (the snare rattles on, the reed
// keeps sounding). A click is over in a few milliseconds and the music goes on
// as before. So anything that's followed by more activity than came before it,
// or that runs longer than a click can, is left untouched.
//
// How it repairs: the damaged samples are thrown away and rebuilt from the
// music on both sides (least-squares AR interpolation), not muted or smoothed.
import { levinson, autocorr, lsarFill, medianInPlace } from "./restore-dsp.js";

// Amount (0..100) to how far above the usual level the error must jump.
// Calibrated in test-restore.mjs on polka with hiss: the defaults find nearly
// every click without touching drum hits.
// (On clean polka with hiss, music never got past 8 once drum hits were set
// aside; most real clicks are far above that.)
export const clickThreshold = (amount) => (amount > 0 ? 8 + 16 * Math.pow(1 - Math.min(100, amount) / 100, 1.5) : Infinity);
export const crackleThreshold = (amount) => (amount > 0 ? 6 + 10 * Math.pow(1 - Math.min(100, amount) / 100, 1.5) : Infinity);

export class Declicker {
  // clicks / crackle: 0..100 (0 = off). maxMs: longest click it will rebuild.
  // linked: both channels carry the same audio (a mono record), so repair once.
  constructor(fs, { clicks = 50, crackle = 40, maxMs = 4, linked = false, detectOnly = false } = {}) {
    this.fs = fs;
    this.p = Math.max(20, Math.min(64, Math.round(32 * fs / 48000))); // model order (about 0.7 ms)
    this.A = Math.round(0.01 * fs);       // fresh models every 10 ms
    this.B = 8 * this.A;                  // block processed at a time
    this.S = Math.max(16, Math.round(fs / 1500)); // ~0.7 ms steps for the "usual level"
    this.Kc = clickThreshold(clicks);
    this.Kk = crackleThreshold(crackle);
    this.maxLen = Math.max(4, Math.round(maxMs / 1000 * fs));
    this.crackleMax = Math.max(3, Math.round(0.0004 * fs));
    this.E = this.maxLen + 10 * this.S;   // error computed this far past the block
    this.M = Math.max(4 * this.A, this.E + this.p) + 64; // context kept on each side of a block
    this.linked = linked; this.detectOnly = detectOnly;
    this.win = Float64Array.from({ length: 2 * this.A }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / (2 * this.A)));
    this.buf = [new Float32Array(this.M), new Float32Array(this.M)];
    this.base = -this.M; this.next = 0; this.total = 0;
    this.events = [];      // { at (sample), len, ch, kind: "click" | "crackle" | "long" }
    this.repaired = 0;     // samples rebuilt
    this.off = !isFinite(this.Kc) && !isFinite(this.Kk);
  }

  push(chans) {
    const n = chans[0].length;
    this.total += n;
    this.buf = this.buf.map((b, c) => { const nb = new Float32Array(b.length + n); nb.set(b); nb.set(chans[c] || chans[0], b.length); return nb; });
    return this.drain(false);
  }

  flush() {
    const pad = this.M + this.B;
    this.buf = this.buf.map((b) => { const nb = new Float32Array(b.length + pad); nb.set(b); return nb; });
    return this.drain(true);
  }

  drain(final) {
    const out = [[], []];
    while (final ? this.next < this.total : this.base + this.buf[0].length >= this.next + this.B + this.M) {
      const s = this.next, o = s - this.base;
      if (!this.off) {
        this.block(0, s);
        if (this.linked) this.buf[1].set(this.buf[0].subarray(o - this.M, o + this.B + this.M), o - this.M);
        else this.block(1, s);
      }
      const len = final ? Math.min(this.B, this.total - s) : this.B;
      for (let c = 0; c < 2; c++) out[c].push(this.buf[c].slice(o, o + len));
      this.next += this.B;
    }
    // keep the context the next block needs (including repairs that ran past this block)
    const keep = this.next - this.M - this.base;
    if (keep > 0) { this.buf = this.buf.map((b) => b.slice(keep)); this.base += keep; }
    return out.map((parts) => { const n = parts.reduce((a, p) => a + p.length, 0), r = new Float32Array(n); let q = 0; for (const p of parts) { r.set(p, q); q += p.length; } return r; });
  }

  // Two AR models for each of the block's 10 ms frames (plus two frames either
  // side): one learned from the 20 ms just before the frame, one from the 20 ms
  // just after. Neither has heard the frame itself, so a click can't teach the
  // model to expect it, and one of the two follows the music even where a new
  // note or drum hit starts.
  models(seg) {
    const { A, M, p, win } = this, out = [];
    for (let j = -2; j <= 9; j++) {
      const s = M + j * A;
      out.push([levinson(autocorr(seg, s - 2 * A, 2 * A, win, p), p).a, levinson(autocorr(seg, s + A, 2 * A, win, p), p).a]);
    }
    return out;
  }
  frameOf(n) { return Math.max(-2, Math.min(9, Math.floor((n - this.M) / this.A))) + 2; }
  modelAt(models, n) { return models[this.frameOf(n)][0]; }

  // Prediction errors for [from, to): forwards (from the past) and backwards
  // (from the future), each the smaller of the two models' errors.
  errors(seg, models, from, to) {
    const p = this.p, n0 = to - from, ef = new Float64Array(n0), eb = new Float64Array(n0);
    for (let n = from; n < to; n++) {
      const pair = models[this.frameOf(n)];
      let bf = Infinity, bb = Infinity;
      for (let m = 0; m < 2; m++) {
        const a = pair[m];
        let f = seg[n], b = seg[n];
        for (let k = 1; k <= p; k++) { f -= a[k] * seg[n - k]; b -= a[k] * seg[n + k]; }
        f = Math.abs(f); b = Math.abs(b);
        if (f < bf) bf = f;
        if (b < bb) bb = b;
      }
      ef[n - from] = bf; eb[n - from] = bb;
    }
    return { ef, eb };
  }

  // Find the clicks starting in [M, M+B) of seg. Returns regions { a, e, kind } in seg indices.
  // A click throws the forward error off from its first sample (and for a
  // while after), the backward error up to its last sample (and for a while
  // before). So an event is a run where either is high; it starts where the
  // forward error first jumps and ends where the backward error last does.
  detect(seg, models) {
    const { M, B, S, E } = this, from = M - E, to = M + B + E;
    const { ef, eb } = this.errors(seg, models, from, to);
    const u = new Float64Array(ef.length);
    for (let i = 0; i < u.length; i++) u[i] = ef[i] > eb[i] ? ef[i] : eb[i];
    // the usual level: the median error in each 0.7 ms step, then the median
    // of the six steps just before (so the click itself never raises it)
    const nSub = Math.ceil(u.length / S), med = new Float64Array(nSub), tmp = new Float64Array(S);
    for (let j = 0; j < nSub; j++) {
      const a = j * S, b = Math.min(u.length, a + S);
      for (let i = a; i < b; i++) tmp[i - a] = u[i];
      med[j] = medianInPlace(tmp, b - a);
    }
    const six = new Float64Array(6), level = new Float64Array(nSub);
    for (let j = 0; j < nSub; j++) {
      const lo = Math.max(0, j - 6), n = j - lo;
      if (n < 2) { level[j] = Math.max(med[j], 1e-7); continue; }
      for (let q = 0; q < n; q++) six[q] = med[lo + q];
      level[j] = Math.max(medianInPlace(six, n), 1e-7);
    }
    const Kmin = Math.min(this.Kc, this.Kk), regions = [];
    const merge = Math.max(2, Math.round(this.p / 4)), afterLen = Math.round(0.008 * this.fs), span = this.maxLen + 2 * this.p + merge;
    for (let n = M; n < M + B; n++) {
      const i = n - from, sig = level[Math.floor(i / S)];
      if (u[i] <= Kmin * sig) continue;
      // the run where either error stays well above the usual level
      const hi = 4 * sig;
      let end = i;
      for (let q = i + 1; q < u.length && q - i <= span; q++) {
        if (u[q] > hi) end = q;
        else if (q - end > merge) break;
      }
      // its edges: first forward jump, last backward jump. A click that jumps and
      // then dies away smoothly into the music leaves no backward jump at its
      // end; then the forward error's last jump (less its own short echo) marks it.
      let a = -1, eb1 = -1, ef1 = -1, peak = 0;
      for (let q = i; q <= end; q++) { if (ef[q] > hi) { if (a < 0) a = q; ef1 = q; } if (eb[q] > hi) eb1 = q; }
      n = end + from; // carry on after it
      if (a < 0) continue;
      for (let q = a; q <= Math.max(a, eb1, ef1); q++) if (u[q] > peak) peak = u[q];
      const ratio = peak / sig, big = ratio >= this.Kc;
      let e = big ? Math.max(eb1, ef1 - (this.p >> 2)) : eb1;
      if (e < a) { if (!big) continue; e = a; }
      const len = e - a + 1;
      // busier afterwards than before (in most of the next 8 ms): a drum hit or a
      // new note starting, not a click. A click that close before a loud hit is
      // masked by it anyway. (Most of, so another click just after doesn't count.)
      const j0 = Math.floor((end + merge) / S) + 1, j1 = Math.min(nSub - 1, Math.floor((end + afterLen) / S));
      let after = 0;
      if (j1 >= j0) { const t = med.slice(j0, j1 + 1).sort(); after = t[Math.floor(0.7 * (t.length - 1))] / sig; }
      let kind = null;
      if (after > 3) kind = null;
      else if (len > this.maxLen) kind = ratio >= this.Kc ? "long" : null;
      else if (big) kind = "click";
      else if (ratio >= this.Kk && len <= this.crackleMax) kind = "crackle";
      if (this.debug) this.debug.push({ a: a + from, len, ratio, after, kind });
      if (kind) regions.push({ a: a + from, e: e + from, kind, sig });
    }
    return regions;
  }

  // the samples to rebuild for each region, grouped where they're close enough to solve together
  clusters(regions, segLen) {
    const p = this.p, pad = (r) => (r.kind === "click" ? Math.max(2, Math.round(0.00025 * this.fs)) : Math.max(1, Math.round(0.00006 * this.fs)));
    const spans = regions.filter((r) => r.kind !== "long").map((r) => [Math.max(p, r.a - pad(r)), Math.min(segLen - p - 1, r.e + pad(r)), r.sig || 0]);
    const out = [];
    for (const [a, e, sig] of spans) {
      const last = out[out.length - 1];
      if (last && a - last.e <= p && last.n + (e - a + 1) <= 3 * this.maxLen) { last.e = Math.max(last.e, e); last.spans.push([a, e]); last.n += e - a + 1; last.sig = Math.max(last.sig, sig); }
      else out.push({ a, e, spans: [[a, e]], n: e - a + 1, sig });
    }
    return out.map((c) => {
      const mark = new Uint8Array(c.e - c.a + 1), idx = [];
      for (const [a, e] of c.spans) mark.fill(1, a - c.a, e - c.a + 1);
      for (let i = 0; i < mark.length; i++) if (mark[i]) idx.push(c.a + i);
      return { ...c, idx };
    });
  }

  fill(seg, clusters, models) {
    for (const c of clusters) lsarFill(seg, c.idx, this.modelAt(models, (c.a + c.e) >> 1), this.p);
  }

  block(ch, s) {
    const { M, B, A, p } = this, buf = this.buf[ch], o = s - this.base;
    const seg = Float64Array.from(buf.subarray(o - M, o + B + M));
    let models = this.models(seg);
    let regions = this.detect(seg, models);
    if (!regions.length) return;
    // a loud click nearby can still pull a neighbouring frame's model towards
    // itself. Rebuild a copy with what was found, model that, and look again.
    const trial = seg.slice();
    this.fill(trial, this.clusters(regions, seg.length), models);
    models = this.models(trial);
    const first = regions;
    regions = this.detect(seg, models);
    for (const r of first) if (!regions.some((q) => q.a <= r.e && q.e >= r.a)) regions.push(r);
    regions.sort((x, y) => x.a - y.a);
    if (this.detectOnly) { for (const r of regions) this.events.push({ at: s - M + r.a, len: r.e - r.a + 1, ch, kind: r.kind }); return; }
    const cl = this.clusters(regions, seg.length);
    this.fill(seg, cl, models);
    // bigger repairs: model the repaired surroundings once more and rebuild,
    // with a longer memory for longer gaps (an order of about three times the
    // gap rebuilds rich harmonic music noticeably better; measured in testing)
    for (const c of cl) {
      if (c.n <= this.crackleMax * 2) continue;
      const q = Math.max(p, Math.min(200, 3 * c.n)), W = Math.round(0.06 * this.fs);
      const centre = (c.a + c.e) >> 1, from = Math.max(q, Math.min(seg.length - W - q, centre - (W >> 1)));
      const w = this.longWin && this.longWin.length === W ? this.longWin : (this.longWin = Float64Array.from({ length: W }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (i + 0.5) / W)));
      if (c.a - q < 0 || c.e + q >= seg.length) continue;
      lsarFill(seg, c.idx, levinson(autocorr(seg, from, W, w, q), q).a, q);
    }
    // what was rebuilt, for the timeline (after any extensions)
    for (const r of regions) {
      const c = cl.find((q) => q.a <= r.e && q.e >= r.a);
      this.events.push({ at: s - M + r.a, len: (c && r.kind === "click" ? Math.max(r.e, c.e) : r.e) - r.a + 1, ch, kind: r.kind });
    }
    for (const c of cl) { this.repaired += c.idx.length; for (const t of c.idx) buf[o - M + t] = seg[t]; }
  }
}
