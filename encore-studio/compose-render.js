// ENCORE. Compose: engraving. Draws a score as SVG (every glyph drawn here, no
// music font) in systems that wrap to the width, and returns a hit map so the
// page can turn clicks into notes and ticks. The music logic (spelling, bars,
// ties, accidentals by the bar) is compose-core.js's layout(); this file only
// decides where things go and draws them, following the usual engraving rules
// (Gould, Behind Bars): stems by the middle line, 3.5-space stems, beams by the
// beat with limited slope, seconds and accidentals in chords set apart,
// spacing by duration, justified systems.
// Contract: COMPOSE-MODEL.md.
import { layout, writtenKey } from "./compose-core.js";

const STEPS = "CDEFGAB", PC = [0, 2, 4, 5, 7, 9, 11];
// the diatonic number (octave * 7 + step) of each clef's bottom line
const CLEF_BOTTOM = { treble: 30, treble8vb: 23, bass: 18, alto: 24, tenor: 22, percussion: 30 };
// key signature positions (half spaces above the bottom line) for treble; other clefs shift
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4], FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
const TENOR_SHARP_POS = [2, 6, 3, 7, 4, 8, 5];
const SHARP_ORDER = "FCGDAEB";
const LEVEL = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
const BASE = { whole: 1920, half: 960, quarter: 480, eighth: 240, "16th": 120, "32nd": 60, "64th": 30 };
const f2 = (n) => Math.round(n * 100) / 100;
const escx = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// ---------- text measuring (a canvas in the browser, an estimate in Node) ----------
let ctx2d = null;
function textWidth(text, px, weight = 400, family = "DM Sans, system-ui, sans-serif", italic = false) {
  if (typeof document !== "undefined") {
    ctx2d ||= document.createElement("canvas").getContext("2d");
    ctx2d.font = `${italic ? "italic " : ""}${weight} ${px}px ${family}`;
    return ctx2d.measureText(text).width;
  }
  return String(text).length * px * 0.55;
}

// ---------- glyphs (sp = staff space in px; x, y in px) ----------
function ellipsePts(cx, cy, rx, ry, rotDeg, n = 28) {
  const a = (rotDeg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), pts = [];
  for (let i = 0; i < n; i++) { const t = (i / n) * Math.PI * 2, x = rx * Math.cos(t), y = ry * Math.sin(t); pts.push(`${f2(cx + x * c - y * s)},${f2(cy + x * s + y * c)}`); }
  return "M" + pts.join("L") + "Z";
}
const HEAD_W = 1.18; // notehead width in spaces
function notehead(type, x, y, sp, fill = "currentColor") {
  const cx = x + (HEAD_W * sp) / 2;
  if (type === "whole") return `<path fill="${fill}" fill-rule="evenodd" d="${ellipsePts(cx + 0.1 * sp, y, 0.78 * sp, 0.5 * sp, 0)}${ellipsePts(cx + 0.1 * sp, y, 0.36 * sp, 0.24 * sp, 58)}"/>`;
  if (type === "half") return `<path fill="${fill}" fill-rule="evenodd" d="${ellipsePts(cx, y, 0.6 * sp, 0.42 * sp, -22)}${ellipsePts(cx, y, 0.5 * sp, 0.2 * sp, -35)}"/>`;
  return `<path fill="${fill}" d="${ellipsePts(cx, y, 0.6 * sp, 0.42 * sp, -22)}"/>`;
}
const headWidth = (type, sp) => (type === "whole" ? 1.75 : HEAD_W) * sp;

function accidental(alter, x, y, sp, fill = "currentColor") {
  const S = (v) => f2(v * sp), X = (v) => f2(x + v * sp), Y = (v) => f2(y + v * sp);
  const thin = S(0.12);
  if (alter === 1) { // sharp: two uprights, two thick rising bars
    const bar = (yy) => `<path d="M${X(-0.55)},${Y(yy + 0.2)}L${X(0.55)},${Y(yy - 0.12)}L${X(0.55)},${Y(yy - 0.52)}L${X(-0.55)},${Y(yy - 0.2)}Z"/>`;
    return `<g fill="${fill}"><rect x="${X(-0.31)}" y="${Y(-1.3)}" width="${thin}" height="${S(2.7)}"/><rect x="${X(0.19)}" y="${Y(-1.45)}" width="${thin}" height="${S(2.7)}"/>${bar(-0.25)}${bar(0.75)}</g>`;
  }
  if (alter === -1) return flatGlyph(x, y, sp, fill);
  if (alter === 0) { // natural
    const bar = (yy) => `<path d="M${X(-0.32)},${Y(yy + 0.08)}L${X(0.32)},${Y(yy - 0.12)}L${X(0.32)},${Y(yy - 0.45)}L${X(-0.32)},${Y(yy - 0.25)}Z"/>`;
    return `<g fill="${fill}"><rect x="${X(-0.32)}" y="${Y(-1.35)}" width="${thin}" height="${S(1.95)}"/><rect x="${X(0.2)}" y="${Y(-0.6)}" width="${thin}" height="${S(1.95)}"/>${bar(-0.18)}${bar(0.62)}</g>`;
  }
  if (alter === 2) { // double sharp: a bold x
    return `<g fill="${fill}"><path d="M${X(-0.45)},${Y(-0.45)}L${X(-0.15)},${Y(-0.45)}L${X(0)},${Y(-0.15)}L${X(0.15)},${Y(-0.45)}L${X(0.45)},${Y(-0.45)}L${X(0.45)},${Y(-0.15)}L${X(0.15)},${Y(0)}L${X(0.45)},${Y(0.15)}L${X(0.45)},${Y(0.45)}L${X(0.15)},${Y(0.45)}L${X(0)},${Y(0.15)}L${X(-0.15)},${Y(0.45)}L${X(-0.45)},${Y(0.45)}L${X(-0.45)},${Y(0.15)}L${X(-0.15)},${Y(0)}L${X(-0.45)},${Y(-0.15)}Z"/></g>`;
  }
  if (alter === -2) return flatGlyph(x - 0.3 * sp, y, sp, fill) + flatGlyph(x + 0.35 * sp, y, sp, fill);
  return "";
}
function flatGlyph(x, y, sp, fill) {
  const X = (v) => f2(x + v * sp), Y = (v) => f2(y + v * sp);
  return `<g fill="${fill}"><rect x="${X(-0.38)}" y="${Y(-1.75)}" width="${f2(0.12 * sp)}" height="${f2(2.3 * sp)}"/><path d="M${X(-0.3)},${Y(0.55)}C${X(0.15)},${Y(0.25)} ${X(0.62)},${Y(-0.05)} ${X(0.58)},${Y(-0.38)}C${X(0.55)},${Y(-0.7)} ${X(0.05)},${Y(-0.72)} ${X(-0.3)},${Y(-0.3)}L${X(-0.3)},${Y(-0.08)}C${X(-0.05)},${Y(-0.42)} ${X(0.32)},${Y(-0.42)} ${X(0.3)},${Y(-0.22)}C${X(0.28)},${Y(0.02)} ${X(0)},${Y(0.3)} ${X(-0.3)},${Y(0.4)}Z"/></g>`;
}
const ACC_W = { 1: 1.15, "-1": 0.95, 0: 0.75, 2: 1.0, "-2": 1.6 };

function clefGlyph(clef, x, staffTop, sp) {
  const X = (v) => f2(x + v * sp), yB = staffTop + 4 * sp;
  if (clef === "treble" || clef === "treble8vb") {
    const Y = (v) => f2(yB - sp + v * sp); // origin on the G line (second line up)
    const d = `M${X(1.5)},${Y(0.28)}C${X(1.0)},${Y(0.42)} ${X(0.82)},${Y(-0.3)} ${X(1.35)},${Y(-0.52)}C${X(2.25)},${Y(-0.82)} ${X(2.45)},${Y(1.0)} ${X(1.3)},${Y(1.12)}`
      + `C${X(0.12)},${Y(1.22)} ${X(-0.25)},${Y(0.05)} ${X(0.35)},${Y(-0.8)}C${X(0.82)},${Y(-1.5)} ${X(1.72)},${Y(-2.05)} ${X(1.9)},${Y(-3.05)}C${X(2.05)},${Y(-3.85)} ${X(1.82)},${Y(-4.75)} ${X(1.48)},${Y(-4.72)}`
      + `C${X(1.05)},${Y(-4.68)} ${X(0.92)},${Y(-3.55)} ${X(1.12)},${Y(-2.55)}L${X(1.58)},${Y(2.15)}C${X(1.7)},${Y(2.95)} ${X(1.05)},${Y(3.12)} ${X(0.72)},${Y(2.82)}`;
    const belly = `M${X(1.3)},${Y(1.12)}C${X(0.12)},${Y(1.22)} ${X(-0.25)},${Y(0.05)} ${X(0.35)},${Y(-0.8)}C${X(0.82)},${Y(-1.5)} ${X(1.5)},${Y(-1.9)} ${X(1.75)},${Y(-2.6)}`;
    let s = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke-width="${f2(0.16 * sp)}"/><path d="${belly}" stroke-width="${f2(0.34 * sp)}"/>`
      + `<path d="M${X(1.35)},${Y(-0.52)}C${X(2.25)},${Y(-0.82)} ${X(2.45)},${Y(1.0)} ${X(1.3)},${Y(1.12)}" stroke-width="${f2(0.28 * sp)}"/></g><circle cx="${X(0.78)}" cy="${Y(2.5)}" r="${f2(0.34 * sp)}" fill="currentColor"/>`;
    if (clef === "treble8vb") s += `<text x="${X(1.2)}" y="${Y(3.95)}" font-size="${f2(1.25 * sp)}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" text-anchor="middle" fill="currentColor">8</text>`;
    return s;
  }
  if (clef === "bass") {
    const Y = (v) => f2(yB - 3 * sp + v * sp); // origin on the F line (fourth line up)
    return `<circle cx="${X(0.42)}" cy="${Y(0)}" r="${f2(0.36 * sp)}" fill="currentColor"/><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${f2(0.3 * sp)}" d="M${X(0.25)},${Y(-0.25)}C${X(0.55)},${Y(-1.05)} ${X(2.15)},${Y(-1.05)} ${X(2.2)},${Y(0.25)}C${X(2.25)},${Y(1.55)} ${X(1.2)},${Y(2.55)} ${X(0.15)},${Y(3.1)}"/>`
      + `<circle cx="${X(2.75)}" cy="${Y(-0.5)}" r="${f2(0.17 * sp)}" fill="currentColor"/><circle cx="${X(2.75)}" cy="${Y(0.5)}" r="${f2(0.17 * sp)}" fill="currentColor"/>`;
  }
  if (clef === "alto" || clef === "tenor") {
    const Y = (v) => f2(yB - (clef === "alto" ? 2 : 3) * sp + v * sp); // origin on the C line
    const lobe = (dir) => `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="${f2(0.26 * sp)}" d="M${X(0.9)},${Y(dir * 0.05)}C${X(1.45)},${Y(dir * 0.45)} ${X(1.65)},${Y(dir * 0.55)} ${X(1.75)},${Y(dir * 1.1)}C${X(1.95)},${Y(dir * 2.0)} ${X(1.2)},${Y(dir * 2.1)} ${X(1.15)},${Y(dir * 1.55)}"/><circle cx="${X(1.22)}" cy="${Y(dir * 1.55)}" r="${f2(0.24 * sp)}" fill="currentColor"/>`;
    return `<rect x="${X(0)}" y="${Y(-2)}" width="${f2(0.42 * sp)}" height="${f2(4 * sp)}" fill="currentColor"/><rect x="${X(0.6)}" y="${Y(-2)}" width="${f2(0.13 * sp)}" height="${f2(4 * sp)}" fill="currentColor"/>${lobe(-1)}${lobe(1)}`;
  }
  // percussion: two thick bars across the middle
  return `<rect x="${X(0.4)}" y="${f2(yB - 3 * sp)}" width="${f2(0.4 * sp)}" height="${f2(2 * sp)}" fill="currentColor"/><rect x="${X(1.1)}" y="${f2(yB - 3 * sp)}" width="${f2(0.4 * sp)}" height="${f2(2 * sp)}" fill="currentColor"/>`;
}
const CLEF_W = { treble: 2.6, treble8vb: 2.6, bass: 3.0, alto: 2.2, tenor: 2.2, percussion: 1.9 };

function restGlyph(type, x, staffTop, sp, fill = "currentColor") {
  const X = (v) => f2(x + v * sp), Y = (v) => f2(staffTop + v * sp); // y from the top line
  if (type === "whole") return `<rect x="${X(0)}" y="${Y(1)}" width="${f2(1.25 * sp)}" height="${f2(0.5 * sp)}" fill="${fill}"/>`;
  if (type === "half") return `<rect x="${X(0)}" y="${Y(1.5)}" width="${f2(1.25 * sp)}" height="${f2(0.5 * sp)}" fill="${fill}"/>`;
  if (type === "quarter") return `<path fill="none" stroke="${fill}" stroke-linejoin="round" stroke-linecap="round" stroke-width="${f2(0.3 * sp)}" d="M${X(0.15)},${Y(0.55)}L${X(0.78)},${Y(1.25)}L${X(0.28)},${Y(1.85)}L${X(0.85)},${Y(2.55)}C${X(0.2)},${Y(2.25)} ${X(0.05)},${Y(2.95)} ${X(0.6)},${Y(3.4)}"/>`;
  const n = LEVEL[type] || 1;
  // eighth and shorter: a slanted stem with a hook and dot per flag, stacked down the stem
  let s = `<path fill="none" stroke="${fill}" stroke-linecap="round" stroke-width="${f2(0.13 * sp)}" d="M${X(1.05 + (n - 1) * 0.12)},${Y(1.15)}L${X(0.55 - (n - 1) * 0.1)},${Y(3.0 + (n - 1) * 1)}"/>`;
  for (let i = 0; i < n; i++) {
    const yy = 1.15 + i, xx = 1.05 + (n - 1) * 0.12 - i * 0.2;
    s += `<circle cx="${X(xx - 0.72)}" cy="${Y(yy + 0.12)}" r="${f2(0.24 * sp)}" fill="${fill}"/><path fill="none" stroke="${fill}" stroke-linecap="round" stroke-width="${f2(0.13 * sp)}" d="M${X(xx - 0.8)},${Y(yy + 0.3)}C${X(xx - 0.45)},${Y(yy + 0.45)} ${X(xx - 0.15)},${Y(yy + 0.25)} ${X(xx)},${Y(yy)}"/>`;
  }
  return s;
}
const REST_W = { whole: 1.25, half: 1.25, quarter: 1.0, eighth: 1.2, "16th": 1.35, "32nd": 1.5, "64th": 1.6 };

function flags(n, x, yEnd, up, sp, fill) {
  let s = "";
  for (let i = 0; i < n; i++) {
    const d = up ? 1 : -1, y = yEnd + d * i * 0.8 * sp, X = (v) => f2(x + v * sp), Y = (v) => f2(y + d * v * sp);
    s += `<path fill="${fill}" d="M${X(0)},${Y(0)}C${X(0.15)},${Y(0.95)} ${X(1.15)},${Y(1.2)} ${X(0.95)},${Y(2.55)}C${X(0.95)},${Y(1.75)} ${X(0.45)},${Y(1.3)} ${X(0)},${Y(1.25)}Z"/>`;
  }
  return s;
}
function tie(x1, x2, y, above, sp, fill = "currentColor") {
  const d = above ? -1 : 1, h = Math.min(1.2, 0.35 + (x2 - x1) / sp / 14) * sp, t = 0.16 * sp;
  const mx = (x1 + x2) / 2;
  return `<path fill="${fill}" d="M${f2(x1)},${f2(y)}C${f2(x1 + (x2 - x1) * 0.2)},${f2(y + d * h)} ${f2(x2 - (x2 - x1) * 0.2)},${f2(y + d * h)} ${f2(x2)},${f2(y)}C${f2(x2 - (x2 - x1) * 0.2)},${f2(y + d * (h - t))} ${f2(x1 + (x2 - x1) * 0.2)},${f2(y + d * (h - t))} ${f2(x1)},${f2(y)}Z"/>`;
  void mx;
}
function timeSig(time, x, staffTop, sp) {
  const f = `font-family="Georgia, 'Times New Roman', serif" font-weight="900" font-size="${f2(2.85 * sp)}" text-anchor="middle" fill="currentColor"`;
  const w = Math.max(String(time.n).length, String(time.d).length) * 1.45 * sp, cx = x + w / 2;
  return { svg: `<text x="${f2(cx)}" y="${f2(staffTop + 1.92 * sp)}" ${f}>${time.n}</text><text x="${f2(cx)}" y="${f2(staffTop + 3.92 * sp)}" ${f}>${time.d}</text>`, w };
}

// ---------- chord symbols: root, then the quality, extensions raised and smaller ----------
function chordSymbolSvg(sym, x, y, sp) {
  const m = /^([A-G])([#b]?)(.*?)(?:\/([A-G][#b]?))?$/.exec(sym || "");
  const size = 1.65 * sp, small = 1.15 * sp, acc = (a) => (a === "#" ? "♯" : a === "b" ? "♭" : "");
  if (!m) return { svg: `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size)}" font-weight="700" fill="currentColor">${escx(sym)}</text>`, w: textWidth(sym, size, 700) };
  let q = m[3] || "", inlineQ = "";
  const mm = /^(m(?!aj)|min|dim|aug|\+|°|ø)/.exec(q);
  if (mm) { inlineQ = mm[0] === "min" ? "m" : mm[0]; q = q.slice(mm[0].length); }
  const ext = q.replace(/#/g, "♯").replace(/b(?=\d)/g, "♭");
  // pieces: [text, small?, raised?]; each tspan moves the baseline from the last one
  const pieces = [[m[1], false, false]];
  if (m[2]) pieces.push([acc(m[2]), true, true]);
  if (inlineQ) pieces.push([inlineQ, false, false]);
  if (ext) pieces.push([ext, true, true]);
  if (m[4]) { pieces.push(["/" + m[4][0], false, false]); if (m[4][1]) pieces.push([acc(m[4][1]), true, true]); }
  let s = `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(size)}" font-weight="700" fill="currentColor">`, raised = 0, w = 0;
  for (const [t, sm, up] of pieces) {
    const r = up ? -0.6 * sp : 0;
    s += `<tspan font-size="${f2(sm ? small : size)}"${r !== raised ? ` dy="${f2(r - raised)}"` : ""}>${escx(t)}</tspan>`;
    raised = r; w += textWidth(t, sm ? small : size, 700);
  }
  s += `</text>`;
  return { svg: s, w };
}

// ---------- the engraving ----------
const keyAlter = (step, key) => (key > 0 && SHARP_ORDER.slice(0, key).includes(step) ? 1 : key < 0 && [...SHARP_ORDER].reverse().join("").slice(0, -key).includes(step) ? -1 : 0);

/**
 * Draws the score; returns { svg, height, events, measures, pitchAt, tickAt }.
 * opts: { width, scale, part, selection: { event, note }, cursor: { tick }, playhead, transposed, header }
 */
export function engrave(score, opts = {}) {
  const pi = opts.part || 0, part = score.parts[pi], sp = 8.5 * (opts.scale || 1), width = Math.max(200, opts.width || 800);
  const transposed = !!(opts.transposed && part.transpose);
  const clef = part.clef || "treble", key = transposed ? writtenKey(score.key || 0, part.transpose) : score.key || 0, time = score.time || { n: 4, d: 4 };
  const bottom = CLEF_BOTTOM[clef] ?? 30, src = part.voices?.[0] || [];
  const measures = layout(score, pi, { transposed, bars: opts.bars });
  const sel = opts.selection || null, ORANGE = "#ff3b00";
  const margin = 1.2 * sp, innerW = width - 2 * margin;
  const posOf = (n) => n.octave * 7 + STEPS.indexOf(n.step) - bottom;
  // beam groups: by the beat (a dotted quarter in compound time), whole half-bars of eighths in 4/4 and 2/2
  const compound = time.d === 8 && time.n % 3 === 0 && time.n > 3;
  const beamUnit = compound ? 720 : time.d === 8 ? 240 * (time.n % 3 === 0 ? 3 : 2) : 1920 / time.d;

  // ---- 1. each event: noteheads, stems, accidentals, its natural width ----
  for (const m of measures) {
    for (const e of m.events) {
      e.level = LEVEL[e.type] ?? 0;
      e.src = src[e.ref] || {};
      e.hyphen = e.lyricHyphen ?? e.src.lyricHyphen; e.arts = e.artic ?? e.src.artic ?? []; e.dynamic = e.dyn ?? e.src.dyn;
      if (e.rest) { e.w = REST_W[e.type] * sp; e.left = 0; continue; }
      e.heads = e.notes.map((n, i) => ({ ...n, i, pos: posOf(n) })).sort((a, b) => a.pos - b.pos);
      const top = e.heads[e.heads.length - 1].pos, bot = e.heads[0].pos;
      e.up = top - 4 < 4 - bot; // the note further from the middle line decides; the middle line itself goes down
      e.stemless = e.type === "whole";
      // seconds: the note a step from its neighbor sits on the other side of the stem
      let prev = null;
      for (const h of e.up ? e.heads : [...e.heads].reverse()) { h.shift = prev && Math.abs(h.pos - prev.pos) <= 1 && !prev.shift ? (e.up ? 1 : -1) : 0; prev = h; }
      const hw = headWidth(e.type, sp);
      e.hw = hw;
      const anyLeft = e.heads.some((h) => h.shift < 0), anyRight = e.heads.some((h) => h.shift > 0);
      // accidentals: columns leftwards, top note first, each in the first column with room
      const cols = [];
      for (const h of [...e.heads].reverse().filter((h) => h.showAcc)) {
        let c = 0;
        while (cols[c] && cols[c].some((p) => Math.abs(p - h.pos) < 6)) c++;
        (cols[c] ||= []).push(h.pos);
        h.accCol = c;
      }
      e.accColW = cols.map((col, c) => Math.max(...e.heads.filter((h) => h.showAcc && h.accCol === c).map((h) => ACC_W[h.alter] ?? 1)) * sp);
      const accW = e.accColW.reduce((a, b) => a + b + 0.18 * sp, 0);
      e.left = accW + (anyLeft ? hw : 0) + (accW ? 0.2 * sp : 0); // room left of the main notehead column
      e.w = hw + (anyRight ? hw : 0) + (e.dots ? 0.5 * sp + e.dots * 0.55 * sp : 0) + (e.level && !e.up ? 0 : e.level ? 0.9 * sp : 0);
    }
  }
  // ---- 2. widths by duration (about the square root), with room for lyrics ----
  const space = (ticks) => sp * (1.9 + 2.3 * Math.pow(ticks / 480, 0.62));
  const lyricPx = 1.45 * sp;
  for (const m of measures) {
    m.min = 0; m.flex = 0;
    m.events.forEach((e, i) => {
      const lyr = e.lyric ? textWidth(e.lyric, lyricPx) + 0.8 * sp : 0;
      e.need = Math.max(e.left + e.w + 0.5 * sp, space(e.ticks), lyr);
      e.flexW = space(e.ticks);
      m.min += e.need; m.flex += e.flexW;
      void i;
    });
    if (!m.events.length) { m.min = 4 * sp; m.flex = 4 * sp; }
    m.min += 1.3 * sp; // after the barline
  }
  // ---- 3. systems: as many bars as fit, then stretched to the width ----
  const keyW = Math.abs(key) * 1.05 * sp + (key ? 0.8 * sp : 0);
  const startW = (first) => (CLEF_W[clef] + 1.0) * sp + keyW + (first ? timeSig(time, 0, 0, sp).w + 1.0 * sp : 0);
  const systems = [];
  let cur = null;
  measures.forEach((m) => {
    const first = !systems.length && !cur;
    if (!cur) cur = { measures: [], start: startW(first), first };
    const used = cur.start + cur.measures.reduce((a, x) => a + x.min, 0);
    if (cur.measures.length && used + m.min > innerW) { systems.push(cur); cur = { measures: [], start: startW(false), first: false }; }
    cur.measures.push(m);
  });
  if (cur) systems.push(cur);
  systems.forEach((s, si) => {
    const natural = s.start + s.measures.reduce((a, m) => a + m.min, 0);
    const last = si === systems.length - 1;
    const target = last && natural < innerW * 0.6 ? natural : innerW;
    const extra = Math.max(0, target - natural), flexSum = s.measures.reduce((a, m) => a + m.flex, 0) || 1;
    let x = margin + s.start;
    for (const m of s.measures) {
      m.x = x; m.system = si;
      let ex = x + 1.3 * sp;
      for (const e of m.events) {
        const add = (extra * e.flexW) / flexSum;
        e.x = ex + e.left; // the main notehead column (or the rest)
        ex += e.need + add;
      }
      if (!m.events.length) ex += (extra * m.flex) / flexSum + m.min - 1.3 * sp;
      m.w = ex - x; x = ex;
    }
    s.width = x - margin;
  });

  // ---- 4. stems and beams (staff-relative y: the top line is 0) ----
  const yOf = (pos) => 4 * sp - (pos * sp) / 2;
  for (const m of measures) {
    // beam groups: consecutive beamable notes in the same beat
    let group = null;
    const groups = [];
    const coreBeams = m.events.some((e) => e.beam !== undefined);
    for (const e of m.events) {
      const beat = coreBeams ? e.beam : Math.floor((e.start - m.start) / beamUnit);
      if (!e.rest && e.level >= 1 && beat !== null && beat !== undefined) {
        if (group && group.beat === beat && group.tup === !!e.tuplet) group.events.push(e);
        else { group = { beat, tup: !!e.tuplet, events: [e] }; groups.push(group); }
      } else group = null;
    }
    for (const g of groups) if (g.events.length > 1) {
      const all = g.events.flatMap((e) => e.heads.map((h) => h.pos)), top = Math.max(...all), bot = Math.min(...all);
      const up = top - 4 < 4 - bot;
      g.up = up;
      for (const e of g.events) { e.up = up; e.beam = g; let prev = null; for (const h of up ? e.heads : [...e.heads].reverse()) { h.shift = prev && Math.abs(h.pos - prev.pos) <= 1 && !prev.shift ? (up ? 1 : -1) : 0; prev = h; } }
      const sx = (e) => (up ? e.x + e.hw - 0.06 * sp : e.x + 0.06 * sp);
      const endNote = (e) => (up ? e.heads[e.heads.length - 1] : e.heads[0]);
      const levels = Math.max(...g.events.map((e) => e.level));
      const len = (3.25 + Math.max(0, levels - 1) * 0.75) * sp;
      const a = g.events[0], b = g.events[g.events.length - 1];
      let ya = yOf(endNote(a).pos) + (up ? -len : len), yb = yOf(endNote(b).pos) + (up ? -len : len);
      const dx = sx(b) - sx(a) || 1;
      let dy = yb - ya;
      const maxDy = Math.min(1.0 * sp, dx * 0.25);
      dy = Math.max(-maxDy, Math.min(maxDy, dy * 0.5));
      // an inner note further out than both ends: keep the beam level
      const ends = [endNote(a).pos, endNote(b).pos], inner = g.events.slice(1, -1).map((e) => endNote(e).pos);
      if (inner.some((p) => (up ? p > Math.max(...ends) : p < Math.min(...ends)))) dy = 0;
      let y0 = up ? Math.min(ya, yb - dy) : Math.max(ya, yb - dy);
      // every stem at least 2.75 spaces long (clear of the noteheads)
      for (const e of g.events) {
        const at = y0 + (dy * (sx(e) - sx(a))) / dx, far = up ? e.heads[e.heads.length - 1] : e.heads[0];
        const need = yOf(far.pos) + (up ? -2.75 * sp - (levels - 1) * 0.75 * sp : 2.75 * sp + (levels - 1) * 0.75 * sp);
        if (up && at > need) y0 -= at - need;
        if (!up && at < need) y0 += need - at;
      }
      // beams reach the middle line at least
      g.beamAt = (x) => y0 + (dy * (x - sx(a))) / dx;
      g.sx = sx;
      for (const e of g.events) { e.stemX = sx(e); e.stemEnd = g.beamAt(e.stemX); }
    }
    for (const e of m.events) {
      if (e.rest || e.stemless || e.beam) continue;
      const far = e.up ? e.heads[e.heads.length - 1] : e.heads[0], near = e.up ? e.heads[0] : e.heads[e.heads.length - 1];
      let len = 3.5 * sp + Math.max(0, e.level - 1) * 0.75 * sp;
      let end = yOf(far.pos) + (e.up ? -len : len);
      // ledger notes: the stem reaches the middle line
      if (e.up && end > yOf(4)) end = yOf(4);
      if (!e.up && end < yOf(4)) end = yOf(4);
      e.stemX = e.up ? e.x + e.hw - 0.06 * sp : e.x + 0.06 * sp;
      e.stemEnd = end; void near;
    }
  }

  // ---- 5. how much each system needs above and below the staff ----
  const anyChord = (s) => s.measures.some((m) => m.events.some((e) => e.chord));
  const anyLyric = (s) => s.measures.some((m) => m.events.some((e) => e.lyric));
  const anyDyn = (s) => s.measures.some((m) => m.events.some((e) => !e.tiedFromPrev && e.dynamic));
  let y = 0;
  const header = opts.header !== false && (score.title || score.composer || score.subtitle);
  let headSvg = "";
  if (header) {
    if (score.title) { y += 3.2 * sp; headSvg += `<text x="${f2(width / 2)}" y="${f2(y)}" text-anchor="middle" font-size="${f2(2.6 * sp)}" font-weight="800" fill="currentColor">${escx(score.title)}</text>`; }
    if (score.subtitle) { y += 1.9 * sp; headSvg += `<text x="${f2(width / 2)}" y="${f2(y)}" text-anchor="middle" font-size="${f2(1.5 * sp)}" fill="currentColor" opacity=".8">${escx(score.subtitle)}</text>`; }
    y += 1.9 * sp;
    if (score.composer) headSvg += `<text x="${f2(width - margin)}" y="${f2(y)}" text-anchor="end" font-size="${f2(1.35 * sp)}" fill="currentColor">${escx(score.composer)}</text>`;
    if (score.lyricist) headSvg += `<text x="${f2(margin)}" y="${f2(y)}" font-size="${f2(1.35 * sp)}" fill="currentColor">${escx("Words: " + score.lyricist)}</text>`;
    if (transposed) { y += 1.6 * sp; headSvg += `<text x="${f2(margin)}" y="${f2(y)}" font-size="${f2(1.2 * sp)}" font-style="italic" fill="currentColor" opacity=".8">${escx(part.name || part.instrument || "")} (written pitch)</text>`; }
    y += 0.8 * sp;
  }
  systems.forEach((s, si) => {
    let hi = 8, lo = 0;
    for (const m of s.measures) for (const e of m.events) {
      if (e.rest) continue;
      for (const h of e.heads) { hi = Math.max(hi, h.pos + 1); lo = Math.min(lo, h.pos - 1); }
      if (e.stemEnd !== undefined) { const p = (4 * sp - e.stemEnd) / (sp / 2); hi = Math.max(hi, p + 1); lo = Math.min(lo, p - 1); }
      if (e.tuplet) { hi = Math.max(hi, (e.up ? (4 * sp - e.stemEnd) / (sp / 2) : 8) + 3); }
    }
    s.above = Math.max(2.5 * sp, ((hi - 8) * sp) / 2 + 1.0 * sp) + (anyChord(s) ? 2.4 * sp : 0) + (si === 0 && !header ? 0 : 0) + (si === 0 ? 1.8 * sp : 0.6 * sp);
    s.below = Math.max(2.0 * sp, (-lo * sp) / 2 + 1.0 * sp) + (anyDyn(s) ? 2.2 * sp : 0) + (anyLyric(s) ? 2.6 * sp : 0);
    s.lo = lo; s.hi = hi;
    s.top = y + s.above; // the staff's top line
    s.y = y;
    y = s.top + 4 * sp + s.below;
    s.h = y - s.y;
  });
  const height = Math.ceil(y + 1 * sp);

  // ---- 6. draw ----
  const out = [];
  const hit = { events: [], measures: [] };
  const line = (x1, y1, x2, y2, w, color = "currentColor") => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${color}" stroke-width="${f2(w)}"/>`;
  const keyPositions = key > 0 ? (clef === "tenor" ? TENOR_SHARP_POS : SHARP_POS.map((p) => p - (clef === "bass" ? 2 : clef === "alto" ? 1 : 0))) : FLAT_POS.map((p) => p - (clef === "bass" ? 2 : clef === "alto" ? 1 : clef === "tenor" ? -1 : 0));
  systems.forEach((s, si) => {
    const T = s.top, g = [];
    const yAbs = (rel) => T + rel;
    // staff lines
    for (let i = 0; i < 5; i++) g.push(line(margin, T + i * sp, margin + s.width, T + i * sp, 0.11 * sp));
    // system start: clef, key, time
    let x = margin + 0.6 * sp;
    g.push(clefGlyph(clef, x, T, sp));
    x += (CLEF_W[clef] + 0.6) * sp;
    for (let i = 0; i < Math.abs(key); i++) { g.push(accidental(key > 0 ? 1 : -1, x + 0.5 * sp, T + yOf(keyPositions[i]), sp)); x += 1.05 * sp; }
    if (s.first) { const ts = timeSig(time, x + 0.5 * sp, T, sp); g.push(ts.svg); }
    // tempo over the first system; bar numbers over the others
    if (si === 0 && score.tempo) {
      const comp = compound, tx = margin + 0.2 * sp, ty = T - s.above + 1.8 * sp + (anyChord(s) ? 0 : 0);
      const bpm = comp ? Math.round((score.tempo * 2) / 3) : time.d === 2 ? Math.round(score.tempo / 2) : score.tempo;
      g.push(`<g transform="translate(${f2(tx)},${f2(ty)}) scale(.72)">${notehead(time.d === 2 ? "half" : "quarter", 0, 0, sp)}${line(HEAD_W * sp - 0.06 * sp, 0, HEAD_W * sp - 0.06 * sp, -3.2 * sp, 0.12 * sp)}${comp ? `<circle cx="${f2(HEAD_W * sp + 0.55 * sp)}" cy="0" r="${f2(0.2 * sp)}" fill="currentColor"/>` : ""}</g>`
        + `<text x="${f2(tx + (comp ? 1.9 : 1.4) * sp)}" y="${f2(ty + 0.45 * sp)}" font-size="${f2(1.45 * sp)}" font-weight="700" fill="currentColor">= ${bpm}</text>`);
    } else if (si > 0) {
      const m0 = s.measures[0], num = m0.number ?? (score.pickup ? m0.index : m0.index + 1);
      g.push(`<text x="${f2(margin + 0.2 * sp)}" y="${f2(T - 1.2 * sp)}" font-size="${f2(1.15 * sp)}" font-style="italic" fill="currentColor" opacity=".75">${num}</text>`);
    }
    // barlines
    g.push(line(margin, T, margin, T + 4 * sp, 0.16 * sp));
    s.measures.forEach((m, mi) => {
      const xr = m.x + m.w, lastBar = si === systems.length - 1 && mi === s.measures.length - 1;
      if (lastBar) { g.push(line(xr - 0.95 * sp, T, xr - 0.95 * sp, T + 4 * sp, 0.16 * sp)); g.push(`<rect x="${f2(xr - 0.5 * sp)}" y="${f2(T)}" width="${f2(0.5 * sp)}" height="${f2(4 * sp)}" fill="currentColor"/>`); }
      else g.push(line(xr, T, xr, T + 4 * sp, 0.16 * sp));
      hit.measures.push({ index: m.index, x: m.x, w: m.w, system: si, y: s.y, h: s.h, start: m.start, ticks: m.ticks });
    });
    // chord symbols, lyrics, dynamics baselines
    const chordY = T - s.above + (si === 0 ? 1.8 * sp : 0.6 * sp) + 2.0 * sp;
    const lyricY = T + 4 * sp + s.below - 1.0 * sp - (0);
    const dynY = T + 4 * sp + Math.max(2.0 * sp, (-s.lo * sp) / 2 + 1.0 * sp) + 1.6 * sp;
    const lyricList = [];
    for (const m of s.measures) {
      // a bar of rest: a whole rest in the middle
      const wholeRest = m.events.length === 1 && m.events[0].rest && (m.events[0].full || m.events[0].ticks === m.ticks);
      for (const e of m.events) {
        const selected = sel && sel.event === e.ref, ink = selected ? ORANGE : "currentColor";
        if (e.rest) {
          const rx = wholeRest ? m.x + m.w / 2 - 0.62 * sp : e.x;
          g.push(restGlyph(wholeRest ? "whole" : e.type, rx, T, sp, ink));
          if (e.dots && !wholeRest) g.push(`<circle cx="${f2(rx + REST_W[e.type] * sp + 0.45 * sp)}" cy="${f2(T + 1.5 * sp)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
          hit.events.push({ event: e.ref, measure: m.index, x: rx - 0.3 * sp, y: s.y, w: REST_W[e.type] * sp + 0.6 * sp, h: s.h, system: si, start: e.start, ticks: e.ticks, rest: true });
        } else {
          const hw = e.hw;
          // ledger lines
          const maxP = e.heads[e.heads.length - 1].pos, minP = e.heads[0].pos;
          const lx1 = e.x - 0.35 * sp - (e.heads.some((h) => h.shift < 0) ? hw : 0), lx2 = e.x + hw + 0.35 * sp + (e.heads.some((h) => h.shift > 0) ? hw : 0);
          for (let p = 10; p <= maxP; p += 2) g.push(line(lx1, T + yOf(p), lx2, T + yOf(p), 0.16 * sp));
          for (let p = -2; p >= minP; p -= 2) g.push(line(lx1, T + yOf(p), lx2, T + yOf(p), 0.16 * sp));
          // noteheads, accidentals, dots
          let accX = e.x - (e.heads.some((h) => h.shift < 0) ? hw : 0) - 0.2 * sp;
          const colX = []; for (let c = 0; c < e.accColW.length; c++) { colX[c] = accX - e.accColW[c] / 2; accX -= e.accColW[c] + 0.18 * sp; }
          for (const h of e.heads) {
            const hx = e.x + h.shift * hw, hy = T + yOf(h.pos);
            const noteSel = selected && (sel.note === undefined || sel.note === null || sel.note === h.i);
            g.push(notehead(e.type, hx, hy, sp, noteSel ? ORANGE : selected ? "#ff8a5c" : "currentColor"));
            if (h.showAcc) g.push(accidental(h.alter, colX[h.accCol], hy, sp, ink));
            if (e.dots) {
              const dy = h.pos % 2 === 0 ? -sp / 2 : 0;
              const dx0 = e.x + hw + (e.heads.some((q) => q.shift > 0) ? hw : 0) + (e.up && e.level && !e.beam ? 0.9 * sp : 0) + 0.45 * sp;
              for (let d = 0; d < e.dots; d++) g.push(`<circle cx="${f2(dx0 + d * 0.55 * sp)}" cy="${f2(hy + dy)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
            }
            // ties: to the next piece of the same pitch, curving away from the stem
            if (h.tie) {
              const nx = nextHead(measures, m, e, h);
              const above = e.heads.length > 1 ? h.pos > (maxP + minP) / 2 || (h === e.heads[e.heads.length - 1] && e.heads.length > 1) : !e.up;
              const ty = hy + (above ? -0.55 * sp : 0.55 * sp);
              const x1 = hx + hw * 0.8;
              if (nx && nx.system === si) g.push(tie(x1, nx.x + 0.2 * sp, ty, above, sp, ink));
              else g.push(tie(x1, Math.max(x1 + 2 * sp, margin + s.width - 0.5 * sp), ty, above, sp, ink));
            }
            if (e.tiedFromPrev && si > 0 && s.measures[0] === m && m.events[0] === e) {
              const above = !e.up;
              g.push(tie(margin + s.start - 1.2 * sp, e.x + 0.2 * sp, hy + (above ? -0.55 * sp : 0.55 * sp), above, sp, ink));
            }
          }
          // stem and flags
          if (!e.stemless) {
            const far = e.up ? e.heads[0] : e.heads[e.heads.length - 1];
            g.push(line(e.stemX, T + yOf(far.pos) + (e.up ? -0.15 * sp : 0.15 * sp), e.stemX, T + e.stemEnd, 0.12 * sp, ink));
            if (e.level && !e.beam) g.push(flags(e.level, e.stemX - 0.06 * sp, T + e.stemEnd, e.up, sp, ink));
          }
          // articulations (on the notehead side, away from the stem), fermata above
          const art = !e.tiedFromPrev ? e.arts : [];
          let ay = e.up ? T + yOf(e.heads[0].pos) + 1.1 * sp : T + yOf(e.heads[e.heads.length - 1].pos) - 1.1 * sp;
          if (!e.up && ay > T - 0.5 * sp) ay = Math.min(ay, T + yOf(e.heads[e.heads.length - 1].pos) - 1.1 * sp);
          const acx = e.x + hw / 2;
          for (const a of art) {
            if (a === "staccato") g.push(`<circle cx="${f2(acx)}" cy="${f2(ay)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
            if (a === "tenuto") g.push(line(acx - 0.6 * sp, ay, acx + 0.6 * sp, ay, 0.16 * sp, ink));
            if (a === "accent") g.push(`<path fill="none" stroke="${ink}" stroke-width="${f2(0.15 * sp)}" d="M${f2(acx - 0.7 * sp)},${f2(ay - 0.4 * sp)}L${f2(acx + 0.7 * sp)},${f2(ay)}L${f2(acx - 0.7 * sp)},${f2(ay + 0.4 * sp)}"/>`);
            if (a === "fermata") { const fy = Math.min(T - 1.2 * sp, T + Math.min(yOf(e.heads[e.heads.length - 1].pos), e.up ? e.stemEnd : 99) - 1.2 * sp); g.push(`<path fill="${ink}" d="M${f2(acx - 1.1 * sp)},${f2(fy)}C${f2(acx - 1.0 * sp)},${f2(fy - 1.4 * sp)} ${f2(acx + 1.0 * sp)},${f2(fy - 1.4 * sp)} ${f2(acx + 1.1 * sp)},${f2(fy)}C${f2(acx + 0.9 * sp)},${f2(fy - 1.1 * sp)} ${f2(acx - 0.9 * sp)},${f2(fy - 1.1 * sp)} ${f2(acx - 1.1 * sp)},${f2(fy)}Z"/><circle cx="${f2(acx)}" cy="${f2(fy - 0.3 * sp)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`); }
            if (a === "staccato" || a === "tenuto" || a === "accent") ay += (e.up ? 1 : -1) * 0.9 * sp;
          }
          hit.events.push({ event: e.ref, measure: m.index, x: e.x - e.left, y: s.y, w: e.left + e.w, h: s.h, system: si, start: e.start, ticks: e.ticks,
            notes: e.heads.map((h) => ({ note: h.i, y: T + yOf(h.pos), x: e.x + h.shift * hw })) });
        }
        if (e.chord) { const c = chordSymbolSvg(e.chord, e.x, chordY, sp); g.push(c.svg); }
        if (e.lyric) lyricList.push({ e, x: e.x + (e.rest ? 0.6 * sp : e.hw / 2), text: e.lyric, hyphen: !!e.hyphen });
        if (!e.tiedFromPrev && e.dynamic) g.push(`<text x="${f2(e.x)}" y="${f2(dynY)}" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="${f2(1.75 * sp)}" fill="currentColor">${escx(e.dynamic)}</text>`);
      }
      // beams
      const seen = new Set();
      for (const e of m.events) if (e.beam && !seen.has(e.beam)) { seen.add(e.beam); g.push(drawBeams(e.beam, T, sp, sel)); }
    }
    // lyrics, centered under their notes; hyphens between syllables of a word
    lyricList.forEach((l, i) => {
      const w = textWidth(l.text, lyricPx);
      g.push(`<text x="${f2(l.x)}" y="${f2(lyricY)}" text-anchor="middle" font-size="${f2(lyricPx)}" fill="currentColor">${escx(l.text)}</text>`);
      if (l.hyphen) {
        const next = lyricList[i + 1], a = l.x + w / 2, b = next ? next.x - textWidth(next.text, lyricPx) / 2 : margin + s.width;
        if (b - a > 0.8 * sp) g.push(line((a + b) / 2 - 0.35 * sp, lyricY - 0.42 * sp, (a + b) / 2 + 0.35 * sp, lyricY - 0.42 * sp, 0.12 * sp));
      }
    });
    // tuplet numbers (and brackets when the group isn't one beam)
    for (const m of s.measures) {
      let run = [];
      const flush = () => {
        if (!run.length) return;
        const n = run[0].tuplet.n, up = run.filter((e) => !e.rest && e.up).length >= run.filter((e) => !e.rest).length / 2;
        const x1 = run[0].x - 0.2 * sp, x2 = run[run.length - 1].x + (run[run.length - 1].hw || sp) + 0.2 * sp, beamed = run.every((e) => e.beam && e.beam === run[0].beam);
        const ends = run.filter((e) => !e.rest).map((e) => (up ? Math.min(e.stemEnd ?? 0, yOf(e.heads[e.heads.length - 1].pos)) : Math.max(e.stemEnd ?? 4 * sp, yOf(e.heads[0].pos))));
        let ty = up ? Math.min(0, ...ends) - 1.0 * sp : Math.max(4 * sp, ...ends) + 1.0 * sp;
        const cx = (x1 + x2) / 2;
        if (!beamed) {
          const d = up ? 0.6 * sp : -0.6 * sp;
          g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.12 * sp)}" d="M${f2(x1)},${f2(T + ty + d)}L${f2(x1)},${f2(T + ty)}L${f2(cx - 0.8 * sp)},${f2(T + ty)}M${f2(cx + 0.8 * sp)},${f2(T + ty)}L${f2(x2)},${f2(T + ty)}L${f2(x2)},${f2(T + ty + d)}"/>`);
        }
        g.push(`<text x="${f2(cx)}" y="${f2(T + ty + 0.5 * sp)}" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700" font-size="${f2(1.5 * sp)}" fill="currentColor">${n}</text>`);
        run = [];
      };
      for (const e of m.events) {
        if (!e.tuplet) { flush(); continue; }
        if (run.length && (e.tuplet.id !== undefined ? run[0].tuplet.id !== e.tuplet.id : run[0].tuplet.n !== e.tuplet.n)) flush();
        run.push(e);
        if (e.tuplet.last) flush();
      }
      flush();
    }
    // the cursor and playhead
    if (opts.cursor && opts.cursor.tick !== undefined) {
      const cx = xForTick(s, opts.cursor.tick, sp);
      if (cx !== null) g.push(`<rect class="cursor" x="${f2(cx - 0.09 * sp)}" y="${f2(T - 1.5 * sp)}" width="${f2(0.18 * sp)}" height="${f2(7 * sp)}" fill="${ORANGE}" rx="${f2(0.09 * sp)}"/>`);
    }
    if (opts.playhead !== undefined && opts.playhead !== null) {
      const px = xForTick(s, opts.playhead, sp);
      if (px !== null) g.push(`<rect class="playhead" x="${f2(px - 0.12 * sp)}" y="${f2(s.y + 0.3 * sp)}" width="${f2(0.24 * sp)}" height="${f2(s.h - 0.6 * sp)}" fill="${ORANGE}" opacity=".55"/>`);
    }
    out.push(`<g class="system" data-system="${si}">${g.join("")}</g>`);
    void yAbs;
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="score" width="${f2(width)}" height="${height}" viewBox="0 0 ${f2(width)} ${height}" role="img" aria-label="${escx(score.title || "Score")}">${headSvg}${out.join("")}</svg>`;
  const T0 = (si) => systems[si].top;
  // a height on a staff to a pitch: the line or space, in the key (concert pitch when written transposed)
  hit.pitchAt = (si, yy) => {
    if (!systems[si]) return null;
    const pos = Math.round((T0(si) + 4 * sp - yy) / (sp / 2)), d = pos + bottom, step = ((d % 7) + 7) % 7, oct = Math.floor(d / 7);
    const midi = (oct + 1) * 12 + PC[step] + keyAlter(STEPS[step], key);
    return midi - (transposed ? part.transpose || 0 : 0);
  };
  hit.tickAt = (si, xx) => {
    const s = systems[si]; if (!s) return null;
    const m = s.measures.find((m) => xx < m.x + m.w) || s.measures[s.measures.length - 1];
    const evs = m.events;
    if (!evs.length || xx <= evs[0].x) return m.start;
    for (let i = 0; i < evs.length; i++) {
      const a = evs[i], bx = i + 1 < evs.length ? evs[i + 1].x : m.x + m.w;
      if (xx < bx) return Math.round(a.start + (a.ticks * (xx - a.x)) / Math.max(1, bx - a.x));
    }
    return m.start + m.ticks;
  };
  hit.systems = systems.map((s, i) => ({ index: i, y: s.y, h: s.h, top: s.top, staffHeight: 4 * sp, x: margin, w: s.width, measures: s.measures.map((m) => m.index) }));
  return { svg, height, ...hit, sp };
}
function xForTick(s, tick, sp) {
  for (const m of s.measures) {
    if (tick < m.start || tick > m.start + m.ticks) continue;
    const evs = m.events;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      if (tick === e.start) return e.x - 0.55 * sp - (e.left || 0) * 0.5;
      const nx = i + 1 < evs.length ? evs[i + 1].x : m.x + m.w - 0.6 * sp;
      if (tick > e.start && tick < e.start + e.ticks) return e.x + ((nx - e.x) * (tick - e.start)) / e.ticks;
    }
    return m.x + m.w - 0.6 * sp;
  }
  return null;
}
// the next notehead a tie goes to (same pitch, next piece of music)
function nextHead(measures, m, e, h) {
  const mi = measures.indexOf(m), ei = m.events.indexOf(e);
  const nxt = m.events[ei + 1] || measures[mi + 1]?.events[0];
  if (!nxt || nxt.rest) return null;
  const n = nxt.heads?.find((q) => q.midi === h.midi) || nxt.heads?.find((q) => q.pos === h.pos);
  if (!n) return null;
  return { x: nxt.x + n.shift * nxt.hw, system: (measures[mi + (m.events[ei + 1] ? 0 : 1)] || m).system };
}
function drawBeams(g, T, sp, sel) {
  const evs = g.events, up = g.up, th = 0.48 * sp, gap = 0.75 * sp, d = up ? 1 : -1;
  const ink = sel && evs.every((e) => e.ref === sel.event) ? "#ff3b00" : "currentColor";
  const poly = (x1, x2, off) => { const y1 = T + g.beamAt(x1) + d * off, y2 = T + g.beamAt(x2) + d * off; return `<path fill="${ink}" d="M${f2(x1)},${f2(y1)}L${f2(x2)},${f2(y2)}L${f2(x2)},${f2(y2 + d * th)}L${f2(x1)},${f2(y1 + d * th)}Z"/>`; };
  let s = poly(evs[0].stemX - 0.06 * sp, evs[evs.length - 1].stemX + 0.06 * sp, 0);
  const maxL = Math.max(...evs.map((e) => e.level));
  for (let L = 2; L <= maxL; L++) {
    const off = (L - 1) * gap;
    let i = 0;
    while (i < evs.length) {
      if (evs[i].level < L) { i++; continue; }
      let j = i; while (j + 1 < evs.length && evs[j + 1].level >= L) j++;
      if (j > i) s += poly(evs[i].stemX - 0.06 * sp, evs[j].stemX + 0.06 * sp, off);
      else {
        // a lone short note: a stub toward its neighbor (left after a dotted note or at the end)
        const left = i === evs.length - 1 || (i > 0 && evs[i - 1].dots);
        const x = evs[i].stemX, len = 1.1 * sp;
        s += left ? poly(x - len, x + 0.06 * sp, off) : poly(x - 0.06 * sp, x + len, off);
      }
      i = j + 1;
    }
  }
  return s;
}

/** Draw into a container element (its width if opts.width is not given) and return the hit map */
export function render(container, score, opts = {}) {
  const width = opts.width || container.clientWidth || 800;
  const r = engrave(score, { ...opts, width });
  container.innerHTML = r.svg;
  const { svg, ...hitmap } = r;
  void svg;
  return hitmap;
}
