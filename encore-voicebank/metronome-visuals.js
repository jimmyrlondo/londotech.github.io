// ENCORE. Metronome: the looks. A wooden pendulum metronome, a conductor's baton, a bouncing ball and a
// circle, drawn on a canvas from the same counts the clicks are played from (the page hands over the count
// being heard right now and how far through it we are, already lined up with the speakers). The pure parts
// (pendulum angle, where the weight sits for a tempo, the baton's path) are exported so node can test them.

export const VIEWS = [
  { id: 'count', name: 'Count', title: 'Numbered beats (and the big count on stage)' },
  { id: 'pendulum', name: 'Pendulum', title: 'A wooden pendulum metronome: drag the weight to change the tempo' },
  { id: 'conductor', name: 'Conductor', title: 'A conductor\'s baton tracing the beat pattern' },
  { id: 'bounce', name: 'Bounce', title: 'A ball that lands on every beat, so you can see the next one coming' },
  { id: 'circle', name: 'Circle', title: 'The bar as a circle: groups, subdivisions and polyrhythms' },
];

// ---- the pendulum

/** How far the arm swings each way, in radians */
export const SWING = 0.4;
/** The arm's angle: at an extreme exactly on each click (alternating sides), through the middle halfway between */
export const pendulumAngle = (n, phase, amp = SWING) => -amp * Math.cos(Math.PI * (n + phase));

/** The tempo marks on a real (Maelzel) metronome's scale */
export const MAELZEL = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108,
  112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208];
export const SCALE_MIN = 40, SCALE_MAX = 208;

// A double pendulum like the real thing: a fixed bob below the pivot and the sliding weight above it.
// Beats a minute = two swings a period, so the angular frequency is pi * bpm / 60. Solving for how far
// above the pivot the weight has to be gives the real scale's spacing: wide at the slow end, tight at the fast.
const G = 9.81, L = 0.03, MU = 0.05;   // a heavy bob, a light sliding weight
const weightDistance = bpm => {
  const w = Math.PI * bpm / 60, a = MU * w * w, b = G * MU, c = w * w * L * L - G * L;
  return (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a);
};
const D_FAST = weightDistance(SCALE_MAX), D_SLOW = weightDistance(SCALE_MIN);
/** Where the weight sits for a tempo: 0 at the bottom of the scale (208, fast) to 1 at the top (40, slow) */
export function weightPosition(bpm) {
  const b = Math.min(SCALE_MAX, Math.max(SCALE_MIN, +bpm || 120));
  return (weightDistance(b) - D_FAST) / (D_SLOW - D_FAST);
}
/** The tempo a weight position gives (the other way round, for dragging the weight) */
export function bpmAtWeight(p) {
  const d = D_FAST + Math.min(1, Math.max(0, p)) * (D_SLOW - D_FAST);
  return 60 * Math.sqrt(G * (L - MU * d) / (L * L + MU * d * d)) / Math.PI;
}

// ---- pulses: what one swing, bounce or baton beat is

/**
 * The pulse a count belongs to. Usually each count; when the tempo counts a longer beat (6/8 in dotted
 * quarters) a pulse is the whole group. phase runs 0 to 1 across the pulse; startFrame is when it began.
 */
export function pulseOf(ev, frac) {
  if (ev.units > 1 && ev.groups && ev.groups.length) {
    const size = ev.units, pos = ev.count - size * ev.group;
    return { index: ev.group, of: ev.groups.length, size, pos, phase: (pos + frac) / size, startFrame: ev.frame - pos * ev.len, len: size * ev.len };
  }
  return { index: ev.count, of: ev.top, size: 1, pos: 0, phase: frac, startFrame: ev.frame, len: ev.len };
}

/** Where the clicks fall inside a pulse, as fractions of it: each count, and each subdivision of it */
export function pulseMarks(size, subs) {
  const out = [];
  for (let c = 0; c < size; c++) for (const f of subs) out.push((c + f) / size);
  return out;
}

/** Counts the pulses since Start, so the arm knows which side it's on */
export class PulseTracker {
  constructor() { this.reset(); }
  reset() { this.n = -1; this.key = null; }
  update(pulse) {
    const key = Math.round(pulse.startFrame);
    if (key !== this.key) { this.key = key; this.n++; }
    return this.n;
  }
}

// ---- the conductor's patterns

/**
 * The beats a conductor would give a bar, as sizes in counts: up to 6 counts one beat each; past that,
 * the groups (7/8 as 2+2+3 is conducted in 3); a longer beat (6/8 in dotted quarters) one beat a group.
 */
export function conductorBeats(top, groups, units) {
  if (units > 1 && groups && groups.length) return groups.slice();
  if (top <= 6) return new Array(top).fill(1);
  let g = groups && !groups.every(x => x === 1) ? groups.slice() : null;
  if (!g) { g = []; let left = top; while (left > 0) { const s = left === 4 || left === 2 ? 2 : 3; g.push(Math.min(s, left)); left -= Math.min(s, left); } }
  while (g.length > 6) { const merged = []; for (let i = 0; i < g.length; i += 2) merged.push(g[i] + (g[i + 1] || 0)); g = merged; }
  return g;
}

// Where each beat lands (the ictus), x from -1 (left) to 1, y from 0 (top) to 1 (bottom). Beat 1 is always
// straight down in the middle and the last beat always goes up, the way every pattern is taught.
const ICTUS = {
  1: [[0, 0.92]],
  2: [[0, 0.92], [0.5, 0.76]],
  3: [[0, 0.92], [0.78, 0.8], [0.3, 0.62]],
  4: [[0, 0.92], [-0.74, 0.8], [0.78, 0.8], [0.3, 0.6]],
  5: [[0, 0.92], [-0.46, 0.84], [-0.86, 0.76], [0.8, 0.8], [0.3, 0.6]],
  6: [[0, 0.92], [-0.42, 0.84], [-0.84, 0.76], [0.44, 0.84], [0.86, 0.76], [0.3, 0.6]],
};
export const patternFor = beats => ICTUS[Math.min(6, Math.max(1, beats))];

/**
 * The baton tip during beat k at phase 0..1: leaves beat k's ictus with a rebound, comes down onto the
 * next one from above. The last beat rises high and drops onto 1. A cubic curve, so it stays in the box.
 */
export function batonPoint(pattern, k, phase) {
  const n = pattern.length, a = pattern[k % n], b = pattern[(k + 1) % n], last = k % n === n - 1;
  const dx = b[0] - a[0];
  const c1 = last ? [a[0] - 0.08 * Math.sign(a[0] || 1), a[1] - 0.7] : [a[0] + dx * 0.25, a[1] - 0.38];
  const c2 = last ? [b[0], b[1] - 0.9] : [b[0] - dx * 0.15, b[1] - 0.42];
  const t = Math.min(1, Math.max(0, phase)), u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return [w0 * a[0] + w1 * c1[0] + w2 * c2[0] + w3 * b[0], w0 * a[1] + w1 * c1[1] + w2 * c2[1] + w3 * b[1]];
}

// ---- the bounce and the circle

/** The ball's height over a pulse: on the ground exactly at the beat, highest halfway */
export const bounceHeight = phase => 4 * phase * (1 - phase);
/** The circle's hand, in radians clockwise from 12 o'clock */
export const ringAngle = (count, frac, top) => 2 * Math.PI * (count + frac) / top;

// ---- drawing

const LEVEL_GLOW = [0, 0.35, 0.65, 1];

function tokens() {
  const cs = typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement) : null;
  const v = (name, d) => (cs && cs.getPropertyValue(name).trim()) || d;
  return { text: v('--text', '#f2efe8'), soft: v('--soft', '#bdb4a9'), dim: v('--dim', '#91887d'), accent: v('--accent', '#ff3b00'),
           blue: v('--blue', '#22d3ee'), track: v('--bg-surface-strong', '#2c2723'), edge: v('--divider-strong', 'rgb(242 239 232 / 0.18)'),
           font: v('--family-primary', 'DM Sans, sans-serif') };
}

/**
 * Draws one look on a canvas. draw(view, st) each animation frame, with
 * st = { ev, frac, sr, running, S, reduced, n } (ev null when nothing is sounding).
 */
export class Views {
  constructor(canvas) {
    this.c = canvas;
    this.t = tokens();
    this.angle = 0;
    this.cache = {};
    this.geo = null;   // the pendulum's last geometry, for dragging the weight
  }
  size() {
    const c = this.c, dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
    if (!w || !h) return null;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); this.cache = {}; }
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    return { g, w, h, dpr };
  }
  /** What the look needs from a count, or the bar at rest when nothing is playing */
  frame(st) {
    const S = st.S;
    let ev = st.ev, frac = st.frac || 0, idle = false;
    if (!ev) {
      idle = true;
      ev = { frame: 0, len: 1, bar: 0, count: 0, top: S.top, group: 0, groups: S.groups, units: S.units, level: S.accents[0] ?? 3, countIn: false, gap: false, muted: false,
             bpm: S.bpm, subs: st.subsIdle || [0], polyN: S.poly && S.poly.on ? S.poly.n : 0 };
      frac = 0;
    }
    const accents = S.top === ev.top && S.accents.length === ev.top ? S.accents : new Array(ev.top).fill(2).map((x, i) => i ? x : 3);
    const pulse = pulseOf(ev, frac);
    const since = idle ? Infinity : (pulse.phase * pulse.len) / (st.sr || 48000);
    const pulseLevel = pulse.size > 1 ? accents[ev.count - pulse.pos] ?? ev.level : ev.level;
    const glow = idle || ev.muted ? 0 : LEVEL_GLOW[pulseLevel] * Math.exp(-since / 0.14);
    return { ev, frac, idle, accents, pulse, since, glow, pulseLevel, fade: ev.muted ? 0.18 : 1, hot: ev.countIn ? this.t.dim : this.t.accent };
  }
  draw(view, st) {
    const sz = this.size();
    if (!sz) return;
    const f = this.frame(st);
    if (view === 'pendulum') this.pendulum(sz, f, st);
    else if (view === 'conductor') this.conductor(sz, f, st);
    else if (view === 'bounce') this.bounce(sz, f, st);
    else if (view === 'circle') this.circle(sz, f, st);
  }

  // -- the pendulum: a wooden pyramid, the Maelzel scale, a swinging arm with a sliding brass weight
  pendulum({ g, w, h, dpr }, f, st) {
    // the arm: exact while counts are sounding; held to one side after Start until the first click; back to the middle after Stop
    if (!f.idle && !st.reduced) this.angle = pendulumAngle(st.n, f.pulse.phase);
    else if (st.running && !st.reduced) this.angle += (-SWING - this.angle) * 0.3;
    else this.angle *= 0.85;
    if (Math.abs(this.angle) < 1e-4) this.angle = 0;
    const bh = Math.min(h * 0.94, w * 0.86 / 0.62), bw = bh * 0.62, cx = w / 2, top = (h - bh) / 2, base = top + bh;
    const pivotY = top + bh * 0.8, dMin = bh * 0.24, dMax = bh * 0.7, armLen = bh * 0.79;
    const key = `p${w}x${h}`;
    if (!this.cache[key]) this.cache[key] = this.pendulumLayers(w, h, dpr, { bh, bw, cx, top, base, pivotY, dMin, dMax });
    const L = this.cache[key];
    g.drawImage(L.body, 0, 0, w, h);
    // the arm
    const bpm = f.idle ? st.S.bpm : f.ev.bpm, p = weightPosition(bpm), dW = dMin + p * (dMax - dMin);
    const a = this.angle, sx = Math.sin(a), sy = -Math.cos(a);
    g.save();
    g.translate(cx, pivotY);
    g.rotate(a);
    const rodW = Math.max(2, bh * 0.012);
    const rod = g.createLinearGradient(-rodW, 0, rodW, 0);
    rod.addColorStop(0, '#8d8a84'); rod.addColorStop(0.5, '#f1efe9'); rod.addColorStop(1, '#77736c');
    g.fillStyle = rod;
    g.fillRect(-rodW / 2, -armLen, rodW, armLen + bh * 0.04);
    g.beginPath(); g.arc(0, -armLen, rodW * 1.3, 0, 2 * Math.PI); g.fill();
    // the weight: its top edge reads the tempo off the scale
    const ww = bh * 0.1, wh = bh * 0.07;
    if (f.glow > 0.01) {
      g.shadowColor = f.pulseLevel === 3 ? f.hot : this.t.text;
      g.shadowBlur = bh * 0.09 * f.glow;
    }
    const brass = g.createLinearGradient(-ww / 2, 0, ww / 2, 0);
    brass.addColorStop(0, '#8a6a2c'); brass.addColorStop(0.45, '#f0d58c'); brass.addColorStop(0.6, '#d4b061'); brass.addColorStop(1, '#6e5222');
    g.fillStyle = brass;
    g.beginPath();
    g.moveTo(-ww * 0.38, -dW); g.lineTo(ww * 0.38, -dW); g.lineTo(ww / 2, -dW + wh); g.lineTo(-ww / 2, -dW + wh); g.closePath();
    g.fill();
    g.shadowBlur = 0;
    if (f.glow > 0.01) {
      g.globalAlpha = Math.min(1, f.glow);
      g.fillStyle = f.pulseLevel === 3 ? f.hot : 'rgb(255 255 255 / 0.6)';
      g.fill();
      g.globalAlpha = 1;
    }
    g.fillStyle = 'rgb(40 26 10 / 0.75)';
    g.fillRect(-ww * 0.38, -dW, ww * 0.76, Math.max(1, bh * 0.006));
    g.restore();
    g.drawImage(L.front, 0, 0, w, h);
    // little lights on the base: the clicks inside this pulse (subdivisions, or the counts of a 6/8 beat)
    const marks = pulseMarks(f.pulse.size, f.ev.subs || [0]);
    if (marks.length > 1) {
      const r = Math.max(2.5, bh * 0.012), gap = r * 3.2, y = base - bh * 0.05, x0 = cx - gap * (marks.length - 1) / 2;
      let cur = 0;
      while (cur + 1 < marks.length && marks[cur + 1] <= f.pulse.phase) cur++;
      marks.forEach((m, i) => {
        g.fillStyle = !f.idle && i === cur && !f.ev.muted ? (i === 0 && f.pulseLevel === 3 ? f.hot : '#f8e7b5') : 'rgb(0 0 0 / 0.45)';
        g.beginPath(); g.arc(x0 + i * gap, y, r, 0, 2 * Math.PI); g.fill();
      });
    }
    this.geo = { cx, pivotY, dMin, dMax, a, wh, wx: cx + sx * (dW - wh / 2), wy: pivotY + sy * (dW - wh / 2), wr: Math.max(ww, 22) };
  }
  pendulumLayers(w, h, dpr, { bh, bw, cx, top, base, pivotY, dMin, dMax }) {
    const layer = () => { const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, g]; };
    const topW = bh * 0.13;
    const at = y => topW + (bw - topW) * (y - top) / bh;   // the body's width at height y
    const shape = (g, y0, y1, inset = 0) => { g.beginPath(); g.moveTo(cx - at(y0) / 2 + inset, y0); g.lineTo(cx + at(y0) / 2 - inset, y0); g.lineTo(cx + at(y1) / 2 - inset, y1); g.lineTo(cx - at(y1) / 2 + inset, y1); g.closePath(); };
    const wood = (g, x0, x1, dark = 0) => {
      const gr = g.createLinearGradient(x0, 0, x1, 0);
      gr.addColorStop(0, dark ? '#24130a' : '#3a2113'); gr.addColorStop(0.3, dark ? '#4c2b17' : '#6e4125'); gr.addColorStop(0.55, dark ? '#432612' : '#5e361e'); gr.addColorStop(1, dark ? '#1e1008' : '#2f1a0d');
      return gr;
    };
    const grain = (g, y0, y1) => {
      g.save(); g.clip();
      g.strokeStyle = 'rgb(20 8 2 / 0.22)'; g.lineWidth = 1;
      for (let i = 0; i < 22; i++) {
        const x = cx - bw / 2 + bw * (i + 0.5) / 22;
        g.beginPath();
        for (let y = y0; y <= y1; y += 6) g.lineTo(x + Math.sin(y * 0.031 + i * 1.7) * 3 + Math.sin(y * 0.11 + i) * 0.8, y);
        g.stroke();
      }
      g.restore();
    };
    const [body, b] = layer();
    // a soft shadow on the "table"
    b.fillStyle = 'rgb(0 0 0 / 0.35)';
    b.beginPath(); b.ellipse(cx, base, bw * 0.58, bh * 0.025, 0, 0, 2 * Math.PI); b.fill();
    shape(b, top, base);
    b.fillStyle = wood(b, cx - bw / 2, cx + bw / 2);
    b.fill();
    shape(b, top, base); grain(b, top, base);
    // the little cap on top
    b.fillStyle = '#24140a';
    b.fillRect(cx - topW * 0.62, top - bh * 0.012, topW * 1.24, bh * 0.02);
    // the open front and its scale plate
    const pTop = top + bh * 0.07, pBot = pivotY - bh * 0.015, inset = bh * 0.05;
    shape(b, pTop, pBot, inset);
    b.fillStyle = '#1a0e07'; b.fill();
    const plateW = Math.max(bh * 0.13, 30);
    const plate = b.createLinearGradient(cx - plateW / 2, 0, cx + plateW / 2, 0);
    plate.addColorStop(0, '#bfae86'); plate.addColorStop(0.5, '#e6d9b8'); plate.addColorStop(1, '#b5a47c');
    const sTop = pivotY - dMax - bh * 0.025, sBot = pivotY - dMin + bh * 0.03;
    b.fillStyle = plate;
    b.fillRect(cx - plateW / 2, sTop, plateW, sBot - sTop);
    // the scale: every Maelzel mark, numbers where there's room
    const fs = Math.max(7, Math.min(13, bh * 0.026));
    b.font = `700 ${fs}px ${this.t.font}`;
    b.textBaseline = 'middle';
    let lastLabel = Infinity;
    MAELZEL.forEach((m, i) => {
      const y = pivotY - (dMin + weightPosition(m) * (dMax - dMin));
      b.fillStyle = '#3b2a1d';
      const tick = plateW * (m % 20 === 0 ? 0.2 : 0.12);
      b.fillRect(cx - plateW / 2 + 2, y - 0.5, tick, 1);
      b.fillRect(cx + plateW / 2 - 2 - tick, y - 0.5, tick, 1);
      if (Math.abs(lastLabel - y) >= fs * 1.15 || i === 0) {
        const s = String(m), tw = b.measureText(s).width;
        b.fillText(s, (i % 2 ? cx + plateW / 2 - tick - 3 - tw : cx - plateW / 2 + tick + 3), y);
        lastLabel = y;
      }
    });
    const [front, fg] = layer();
    // the solid lower front that hides the pivot and the bob below it, with a maker's mark
    const fTop = pivotY - bh * 0.012;
    shape(fg, fTop, base);
    fg.fillStyle = wood(fg, cx - bw / 2, cx + bw / 2, 1);
    fg.fill();
    shape(fg, fTop, base); grain(fg, fTop, base);
    fg.fillStyle = 'rgb(255 230 170 / 0.12)';
    fg.fillRect(cx - at(fTop) / 2, fTop, at(fTop), 1);
    const ms = Math.max(8, bh * 0.04);
    fg.font = `800 ${ms}px ${this.t.font}`;
    fg.textAlign = 'center'; fg.textBaseline = 'middle';
    fg.fillStyle = 'rgb(232 200 130 / 0.55)';
    fg.fillText('ENCORE.', cx, fTop + (base - fTop) * 0.42);
    return { body, front };
  }

  // -- the conductor: the pattern traced faintly, the baton tip moving through it
  conductor({ g, w, h }, f, st) {
    const S = st.S, ev = f.ev;
    const sizes = conductorBeats(ev.top, ev.groups, ev.units), pat = patternFor(sizes.length);
    // which conducted beat, and how far through it (beats can be unequal: 7/8 as 2+2+3)
    let k = 0, start = 0;
    while (k < sizes.length - 1 && start + sizes[k] <= ev.count) start += sizes[k++];
    const phase = (ev.count - start + f.frac) / sizes[k];
    const since = f.idle ? Infinity : (ev.count - start + f.frac) * ev.len / (st.sr || 48000);
    const lvl = f.accents[start] ?? 2, glow = f.idle || ev.muted ? 0 : LEVEL_GLOW[lvl] * Math.exp(-since / 0.16);
    const s = Math.min(w * 0.84, (h - 34) / 0.62), x0 = w / 2, y0 = (h - 0.62 * s) / 2 - 0.1 * s + 10;
    const X = p => x0 + p[0] * s / 2, Y = p => y0 + p[1] * s * 0.62;
    // the whole pattern, faintly
    g.lineWidth = Math.max(1.5, s * 0.008); g.strokeStyle = this.t.edge; g.lineCap = 'round';
    g.beginPath();
    for (let b = 0; b < pat.length; b++) for (let i = 0; i <= 32; i++) { const q = batonPoint(pat, b, i / 32); i || b ? g.lineTo(X(q), Y(q)) : g.moveTo(X(q), Y(q)); }
    g.stroke();
    // where each beat lands, numbered
    const fs = Math.max(11, s * 0.05);
    g.font = `800 ${fs}px ${this.t.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    pat.forEach((q, b) => {
      const now = b === k && !f.idle, r = Math.max(4, s * (b === 0 ? 0.026 : 0.02)) * (now ? 1 + 0.6 * glow : 1);
      g.fillStyle = now && !ev.muted ? (b === 0 ? f.hot : this.t.text) : b === 0 ? 'rgb(255 59 0 / 0.55)' : this.t.dim;
      g.beginPath(); g.arc(X(q), Y(q), r, 0, 2 * Math.PI); g.fill();
      g.fillStyle = now ? this.t.text : this.t.dim;
      g.fillText(String(b + 1), X(q) + (q[0] < -0.2 ? -1 : q[0] > 0.2 ? 1 : 0) * fs * 1.1, Y(q) + fs * 1.15);
    });
    // the baton tip and its trail
    if (!st.reduced) {
      const tip = batonPoint(pat, k, phase);
      g.globalAlpha = f.fade;
      for (let j = 14; j >= 1; j--) {
        let pk = k, pp = phase - j * 0.025;
        if (pp < 0) { if (f.idle) continue; pk = (k - 1 + pat.length) % pat.length; pp += 1; }
        const q = batonPoint(pat, pk, pp);
        g.fillStyle = `rgb(242 239 232 / ${0.28 * (1 - j / 15)})`;
        g.beginPath(); g.arc(X(q), Y(q), Math.max(3, s * 0.018) * (1 - j / 20), 0, 2 * Math.PI); g.fill();
      }
      g.fillStyle = this.t.text;
      g.shadowColor = glow > 0.05 && lvl === 3 ? f.hot : this.t.text; g.shadowBlur = 6 + 18 * glow;
      g.beginPath(); g.arc(X(tip), Y(tip), Math.max(5, s * 0.026), 0, 2 * Math.PI); g.fill();
      g.shadowBlur = 0; g.globalAlpha = 1;
    }
    g.textAlign = 'left'; g.font = `600 12px ${this.t.font}`; g.fillStyle = this.t.dim;
    g.fillText(sizes.length === ev.top ? `In ${sizes.length}` : `In ${sizes.length} (${sizes.join('+')})`, 8, 14);
    void S;
  }

  // -- the bounce: a ball hopping from beat to beat, landing on each click
  bounce({ g, w, h }, f, st) {
    const ev = f.ev, n = f.pulse.of, k = f.pulse.index, ph = f.pulse.phase;
    const x0 = w * 0.07, x1 = w * 0.93, X = i => x0 + (x1 - x0) * i / n, sp = (x1 - x0) / n;
    const k2 = Math.min(2.5, Math.max(1, h / 300));   // bigger on a big screen
    const yb = h * 0.78, r = Math.max(6, Math.min(h * 0.06, sp * 0.16, 24 * k2)), amp = Math.max(10, Math.min(yb - r - h * 0.06, h * 0.5));
    const marks = pulseMarks(f.pulse.size, ev.subs || [0]);
    // the ground line, the clicks inside each pulse as ticks
    g.fillStyle = this.t.track; g.fillRect(x0, yb, x1 - x0, 2);
    for (let i = 0; i < n; i++) for (let m = 1; m < marks.length; m++) {
      const x = X(i + marks[m]), passed = !f.idle && i === k && marks[m] <= ph;
      g.fillStyle = passed ? this.t.text : this.t.dim;
      g.fillRect(x - k2, yb - 5 * k2, 2 * k2, 12 * k2);
    }
    // a pad for each beat (sized by its accent), and a faint 1 at the end for the next bar
    const fs = Math.max(11, Math.min(22 * k2, h * 0.07));
    g.font = `800 ${fs}px ${this.t.font}`; g.textAlign = 'center'; g.textBaseline = 'top';
    for (let i = 0; i <= n; i++) {
      const ghost = i === n, ci = f.pulse.size > 1 ? i * f.pulse.size : i, lvl = ghost ? f.accents[0] : f.accents[ci] ?? 2;
      const pw = Math.min(46 * k2, sp * 0.5), ph2 = [3, 6, 9, 13][lvl] * k2, now = !ghost && i === k && !f.idle;
      g.globalAlpha = ghost ? 0.35 : 1;
      const lit = now ? f.glow : 0;
      g.fillStyle = lvl === 3 ? (lit > 0.05 ? f.hot : 'rgb(255 59 0 / 0.55)') : lit > 0.05 ? this.t.text : lvl === 0 ? 'transparent' : this.t.dim;
      if (lvl === 0) { g.strokeStyle = this.t.dim; g.strokeRect(X(i) - pw / 2, yb - ph2, pw, ph2 + 2); }
      else { g.fillRect(X(i) - pw / 2, yb - ph2 - 2 * lit, pw, ph2 + 2 + 2 * lit); }
      g.fillStyle = now ? this.t.text : this.t.dim;
      g.fillText(String(ghost ? 1 : i + 1), X(i), yb + 8 * k2);
      g.globalAlpha = 1;
    }
    // the ball
    const still = f.idle || st.reduced;
    const bx = still ? X(k) : X(k) + sp * ph, hgt = still ? 0 : amp * bounceHeight(ph);
    const squash = f.idle ? 0 : Math.max(0, 1 - f.since / 0.06) * 0.25;
    g.globalAlpha = 0.35 * f.fade;
    g.fillStyle = '#000';
    g.beginPath(); g.ellipse(bx, yb + 1, r * (1.1 - 0.5 * hgt / amp), r * 0.25, 0, 0, 2 * Math.PI); g.fill();
    g.globalAlpha = f.fade;
    g.fillStyle = f.pulseLevel === 3 && f.glow > 0.05 ? f.hot : this.t.text;
    if (st.reduced && f.glow > 0.05) { g.shadowColor = g.fillStyle; g.shadowBlur = 16 * f.glow; }
    g.beginPath(); g.ellipse(bx, yb - r * (1 - squash) - hgt, r * (1 + squash), r * (1 - squash), 0, 0, 2 * Math.PI); g.fill();
    g.shadowBlur = 0; g.globalAlpha = 1;
  }

  // -- the circle: the bar around a ring, groups as arcs, a hand sweeping round, a polyrhythm inside
  circle({ g, w, h }, f, st) {
    const ev = f.ev, top = ev.top, cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.4;
    const A = x => -Math.PI / 2 + 2 * Math.PI * x / top, P = (x, r) => [cx + r * Math.cos(A(x)), cy + r * Math.sin(A(x))];
    const pos = f.idle ? 0 : ev.count + f.frac;
    // how far through the bar, shaded
    if (!f.idle && !st.reduced) {
      g.fillStyle = 'rgb(242 239 232 / 0.05)';
      g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, R, A(0), A(pos)); g.closePath(); g.fill();
    }
    // the groups as arcs
    g.lineWidth = Math.max(3, R * 0.035); g.lineCap = 'round'; g.strokeStyle = this.t.track;
    if (ev.groups.length < 2 || ev.groups.every(x => x === 1)) { g.beginPath(); g.arc(cx, cy, R, 0, 2 * Math.PI); g.stroke(); }
    else {
      // a gap between groups, so 2+2+3 reads as three arcs
      let s0 = 0;
      for (const gr of ev.groups) { g.beginPath(); g.arc(cx, cy, R, A(s0) + 0.09, A(s0 + gr) - 0.09); g.stroke(); s0 += gr; }
    }
    // subdivision ticks
    const subs = ev.subs || [0];
    g.lineWidth = Math.max(1.5, R * 0.012);
    for (let i = 0; i < top; i++) for (let m = 1; m < subs.length; m++) {
      const x = i + subs[m], passed = !f.idle && i === ev.count && subs[m] <= f.frac;
      const [ax, ay] = P(x, R * 0.9), [bx, by] = P(x, R * 1.08);
      g.strokeStyle = passed ? this.t.text : this.t.dim;
      g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    }
    // a polyrhythm, on an inner ring
    if (ev.polyN) {
      const n = ev.polyN, rr = R * 0.7, at = pos / top;
      g.strokeStyle = 'rgb(34 211 238 / 0.18)'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(cx, cy, rr, 0, 2 * Math.PI); g.stroke();
      for (let j = 0; j < n; j++) {
        const p = j / n, lit = !f.idle && at >= p && at < p + Math.min(0.08, 0.6 / n);
        const [x, y] = P(p * top, rr);
        g.fillStyle = lit ? this.t.blue : 'rgb(34 211 238 / 0.4)';
        g.beginPath(); g.arc(x, y, R * (lit ? 0.05 : 0.032), 0, 2 * Math.PI); g.fill();
      }
    }
    // the counts, sized by their accent
    for (let i = 0; i < top; i++) {
      const lvl = f.accents[i] ?? 2, now = !f.idle && i === ev.count, lit = now ? Math.max(f.glow, st.reduced ? 0.6 : 0) : 0;
      const [x, y] = P(i, R), rad = R * [0.045, 0.045, 0.065, 0.085][lvl] * (1 + 0.35 * lit);
      g.beginPath(); g.arc(x, y, rad, 0, 2 * Math.PI);
      if (lvl === 0) { g.strokeStyle = now ? this.t.text : this.t.dim; g.lineWidth = 2; g.stroke(); continue; }
      g.fillStyle = lvl === 3 ? (now && !ev.muted ? f.hot : 'rgb(255 59 0 / 0.6)') : now && !ev.muted ? this.t.text : lvl === 1 ? this.t.track : this.t.dim;
      if (lit > 0.05 && !ev.muted) { g.shadowColor = g.fillStyle; g.shadowBlur = 20 * lit; }
      g.fill(); g.shadowBlur = 0;
    }
    // the hand
    if (!st.reduced) {
      const [hx, hy] = P(pos, R * 0.86);
      g.globalAlpha = f.fade;
      g.strokeStyle = this.t.text; g.lineWidth = Math.max(2, R * 0.02);
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(hx, hy); g.stroke();
      g.fillStyle = this.t.text; g.beginPath(); g.arc(cx, cy, Math.max(3, R * 0.03), 0, 2 * Math.PI); g.fill();
      g.globalAlpha = 1;
    }
    // the count in the middle
    const allOnes = ev.groups.every(x => x === 1), num = ev.muted ? '·' : String(allOnes ? ev.count + 1 : ev.group + 1);
    g.font = `800 ${R * (st.reduced ? 0.6 : 0.42)}px ${this.t.font}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = f.idle ? this.t.dim : ev.level === 3 ? f.hot : this.t.text;
    g.globalAlpha = st.reduced ? 1 : 0.85;
    g.fillText(num, cx, cy + (st.reduced ? 0 : R * 0.3));
    g.globalAlpha = 1;
    if (ev.countIn) { g.font = `600 ${Math.max(11, R * 0.09)}px ${this.t.font}`; g.fillStyle = this.t.dim; g.fillText('count-in', cx, cy + R * 0.58); }
  }

  /** Dragging the pendulum's weight: is (x, y) on it, and what tempo is it at height y */
  onWeight(x, y) { const q = this.geo; return !!q && Math.hypot(x - q.wx, y - q.wy) < q.wr; }
  bpmAt(y) { const q = this.geo; if (!q) return null; return bpmAtWeight(((q.pivotY - y) / Math.cos(q.a) + q.wh / 2 - q.dMin) / (q.dMax - q.dMin)); }
}
