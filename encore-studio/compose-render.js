// ENCORE. Compose: engraving. Draws a score as SVG (every glyph drawn here, no
// music font) in systems that wrap to the width, and returns a hit map so the
// page can turn clicks into notes and ticks. The music logic (spelling, bars,
// ties, accidentals by the bar) is compose-core.js's layout; this file only
// decides where things go and draws them, following the usual engraving rules
// (Gould, Behind Bars): stems by the middle line, 3.5-space stems, beams by the
// beat with limited slope, seconds and accidentals in chords set apart,
// spacing by duration, every staff's bars lined up, justified systems.
// v2: several parts (bracketed), grand staves (braced), two voices a staff,
// slurs, hairpins, octave lines, pedal, repeats, endings, rehearsal marks,
// segno and coda, key, time and tempo changes. Contract: COMPOSE-MODEL.md.
import * as core from "./compose-core.js";

const STEPS = "CDEFGAB", PC = [0, 2, 4, 5, 7, 9, 11];
// the diatonic number (octave * 7 + step) of each clef's bottom line
const CLEF_BOTTOM = { treble: 30, treble8vb: 23, bass: 18, alto: 24, tenor: 22, percussion: 30 };
// key signature positions (half spaces above the bottom line) for treble; other clefs shift
const SHARP_POS = [8, 5, 9, 6, 3, 7, 4], FLAT_POS = [4, 7, 3, 6, 2, 5, 1];
const TENOR_SHARP_POS = [2, 6, 3, 7, 4, 8, 5];
const SHARP_ORDER = "FCGDAEB";
const LEVEL = { whole: 0, half: 0, quarter: 0, eighth: 1, "16th": 2, "32nd": 3, "64th": 4 };
const ORANGE = "#ff3b00", SOFT = "#ff8a5c";
const SERIF = `Georgia, 'Times New Roman', serif`;
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

function clefGlyph(clef, x, staffTop, sp, scale = 1) {
  if (scale !== 1) {
    // a clef change mid-line is drawn smaller (about two thirds), sitting on the same lines
    const ox = x, oy = staffTop + 4 * sp;
    return `<g transform="translate(${f2(ox)},${f2(oy)}) scale(${scale}) translate(${f2(-ox)},${f2(-oy)})">${clefGlyph(clef, x, staffTop, sp)}</g>`;
  }
  const X = (v) => f2(x + v * sp), yB = staffTop + 4 * sp;
  if (clef === "treble" || clef === "treble8vb") {
    const Y = (v) => f2(yB - sp + v * sp); // origin on the G line (second line up)
    const d = `M${X(1.5)},${Y(0.28)}C${X(1.0)},${Y(0.42)} ${X(0.82)},${Y(-0.3)} ${X(1.35)},${Y(-0.52)}C${X(2.25)},${Y(-0.82)} ${X(2.45)},${Y(1.0)} ${X(1.3)},${Y(1.12)}`
      + `C${X(0.12)},${Y(1.22)} ${X(-0.25)},${Y(0.05)} ${X(0.35)},${Y(-0.8)}C${X(0.82)},${Y(-1.5)} ${X(1.72)},${Y(-2.05)} ${X(1.9)},${Y(-3.05)}C${X(2.05)},${Y(-3.85)} ${X(1.82)},${Y(-4.75)} ${X(1.48)},${Y(-4.72)}`
      + `C${X(1.05)},${Y(-4.68)} ${X(0.92)},${Y(-3.55)} ${X(1.12)},${Y(-2.55)}L${X(1.58)},${Y(2.15)}C${X(1.7)},${Y(2.95)} ${X(1.05)},${Y(3.12)} ${X(0.72)},${Y(2.82)}`;
    const belly = `M${X(1.3)},${Y(1.12)}C${X(0.12)},${Y(1.22)} ${X(-0.25)},${Y(0.05)} ${X(0.35)},${Y(-0.8)}C${X(0.82)},${Y(-1.5)} ${X(1.5)},${Y(-1.9)} ${X(1.75)},${Y(-2.6)}`;
    let s = `<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="${d}" stroke-width="${f2(0.16 * sp)}"/><path d="${belly}" stroke-width="${f2(0.34 * sp)}"/>`
      + `<path d="M${X(1.35)},${Y(-0.52)}C${X(2.25)},${Y(-0.82)} ${X(2.45)},${Y(1.0)} ${X(1.3)},${Y(1.12)}" stroke-width="${f2(0.28 * sp)}"/></g><circle cx="${X(0.78)}" cy="${Y(2.5)}" r="${f2(0.34 * sp)}" fill="currentColor"/>`;
    if (clef === "treble8vb") s += `<text x="${X(1.2)}" y="${Y(3.95)}" font-size="${f2(1.25 * sp)}" font-family="${SERIF}" font-style="italic" font-weight="700" text-anchor="middle" fill="currentColor">8</text>`;
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

// rests: dy moves the whole rest up or down (a second voice), in px
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

// flags: a full curved flag per level from the stem's end, swept out and back in (mirrored for a down stem)
function flags(n, x, yEnd, up, sp, fill) {
  let s = "";
  const d = up ? 1 : -1;
  for (let i = 0; i < n; i++) {
    const y = yEnd + d * i * 0.78 * sp, X = (v) => f2(x + v * sp), Y = (v) => f2(y + d * v * sp);
    const last = i === n - 1, tail = last ? 1 : 0.8; // inner flags are a little shorter
    s += `<path fill="${fill}" d="M${X(0)},${Y(0)}C${X(0.08)},${Y(0.62)} ${X(0.92)},${Y(0.95)} ${X(1.05)},${Y(1.7 * tail)}`
      + `C${X(1.16)},${Y(2.25 * tail)} ${X(0.98)},${Y(2.72 * tail)} ${X(0.74)},${Y(3.05 * tail)}C${X(0.9)},${Y(2.62 * tail)} ${X(0.96)},${Y(2.2 * tail)} ${X(0.72)},${Y(1.8 * tail)}`
      + `C${X(0.52)},${Y(1.45)} ${X(0.2)},${Y(1.22)} ${X(0)},${Y(1.15)}Z"/>`;
  }
  return s;
}
// a curve between two points, thick in the middle (ties and slurs); lift: height of the arch in px
function arc(x1, y1, x2, y2, above, lift, sp, fill = "currentColor") {
  const d = above ? -1 : 1, t = 0.3 * sp, k = 0.25;
  const c1x = x1 + (x2 - x1) * k, c2x = x2 - (x2 - x1) * k;
  const c1y = y1 + (y2 - y1) * k + d * lift * 1.33, c2y = y2 - (y2 - y1) * k + d * lift * 1.33;
  return `<path fill="${fill}" d="M${f2(x1)},${f2(y1)}C${f2(c1x)},${f2(c1y)} ${f2(c2x)},${f2(c2y)} ${f2(x2)},${f2(y2)}C${f2(c2x)},${f2(c2y - d * t)} ${f2(c1x)},${f2(c1y - d * t)} ${f2(x1)},${f2(y1)}Z"/>`;
}
function tie(x1, x2, y, above, sp, fill = "currentColor") {
  const h = Math.min(1.2, 0.35 + (x2 - x1) / sp / 14) * sp * 0.75;
  return arc(x1, y, x2, y, above, h, sp, fill);
}
function timeSig(time, x, staffTop, sp) {
  const f = `font-family="${SERIF}" font-weight="900" font-size="${f2(2.85 * sp)}" text-anchor="middle" fill="currentColor"`;
  const w = Math.max(String(time.n).length, String(time.d).length) * 1.45 * sp, cx = x + w / 2;
  return { svg: `<text x="${f2(cx)}" y="${f2(staffTop + 1.92 * sp)}" ${f}>${time.n}</text><text x="${f2(cx)}" y="${f2(staffTop + 3.92 * sp)}" ${f}>${time.d}</text>`, w };
}
const timeW = (time, sp) => Math.max(String(time.n).length, String(time.d).length) * 1.45 * sp;

// a curly brace for a grand staff, top to bottom
function brace(x, y1, y2, sp) {
  const h = y2 - y1, m = (y1 + y2) / 2, w = Math.min(1.6 * sp, 0.1 * h + 0.6 * sp);
  const X = (v) => f2(x + v * w), Y = (v) => f2(y1 + v * h);
  // outer edge then inner edge: two S curves meeting at the middle point
  return `<path fill="currentColor" d="M${X(1)},${Y(0)}C${X(0.15)},${Y(0.04)} ${X(0.75)},${Y(0.3)} ${X(0.55)},${Y(0.4)}C${X(0.45)},${Y(0.45)} ${X(0.2)},${Y(0.48)} ${X(0)},${f2(m)}`
    + `C${X(0.2)},${Y(0.52)} ${X(0.45)},${Y(0.55)} ${X(0.55)},${Y(0.6)}C${X(0.75)},${Y(0.7)} ${X(0.15)},${Y(0.96)} ${X(1)},${Y(1)}`
    + `C${X(0.5)},${Y(0.95)} ${X(1.2)},${Y(0.74)} ${X(0.95)},${Y(0.6)}C${X(0.8)},${Y(0.53)} ${X(0.45)},${Y(0.51)} ${X(0.18)},${f2(m)}`
    + `C${X(0.45)},${Y(0.49)} ${X(0.8)},${Y(0.47)} ${X(0.95)},${Y(0.4)}C${X(1.2)},${Y(0.26)} ${X(0.5)},${Y(0.05)} ${X(1)},${Y(0)}Z"/>`;
}
// the thick bracket that joins the staves of several instruments, with curled ends
function bracket(x, y1, y2, sp) {
  const t = 0.5 * sp;
  return `<rect x="${f2(x)}" y="${f2(y1 - 0.4 * sp)}" width="${f2(t)}" height="${f2(y2 - y1 + 0.8 * sp)}" fill="currentColor"/>`
    + `<path fill="currentColor" d="M${f2(x)},${f2(y1 - 0.4 * sp)}C${f2(x + 0.8 * sp)},${f2(y1 - 0.45 * sp)} ${f2(x + 1.6 * sp)},${f2(y1 - 0.8 * sp)} ${f2(x + 2.0 * sp)},${f2(y1 - 1.4 * sp)}C${f2(x + 1.7 * sp)},${f2(y1 - 0.6 * sp)} ${f2(x + 0.9 * sp)},${f2(y1 + 0.1 * sp)} ${f2(x)},${f2(y1 + 0.1 * sp)}Z"/>`
    + `<path fill="currentColor" d="M${f2(x)},${f2(y2 + 0.4 * sp)}C${f2(x + 0.8 * sp)},${f2(y2 + 0.45 * sp)} ${f2(x + 1.6 * sp)},${f2(y2 + 0.8 * sp)} ${f2(x + 2.0 * sp)},${f2(y2 + 1.4 * sp)}C${f2(x + 1.7 * sp)},${f2(y2 + 0.6 * sp)} ${f2(x + 0.9 * sp)},${f2(y2 - 0.1 * sp)} ${f2(x)},${f2(y2 - 0.1 * sp)}Z"/>`;
}
// segno: a slanted S with a stroke through it and two dots
function segno(cx, cy, sp) {
  const X = (v) => f2(cx + v * sp), Y = (v) => f2(cy + v * sp);
  return `<g fill="none" stroke="currentColor" stroke-linecap="round"><path stroke-width="${f2(0.32 * sp)}" d="M${X(0.75)},${Y(-1.0)}C${X(0.55)},${Y(-1.55)} ${X(-0.85)},${Y(-1.45)} ${X(-0.6)},${Y(-0.55)}C${X(-0.4)},${Y(0.1)} ${X(0.7)},${Y(-0.05)} ${X(0.65)},${Y(0.7)}C${X(0.6)},${Y(1.5)} ${X(-0.75)},${Y(1.5)} ${X(-0.75)},${Y(0.95)}"/>`
    + `<path stroke-width="${f2(0.13 * sp)}" d="M${X(-1.0)},${Y(1.35)}L${X(1.0)},${Y(-1.35)}"/></g><circle cx="${X(-0.85)}" cy="${Y(-0.15)}" r="${f2(0.2 * sp)}" fill="currentColor"/><circle cx="${X(0.85)}" cy="${Y(0.25)}" r="${f2(0.2 * sp)}" fill="currentColor"/>`;
}
// coda: an oval crossed by a long upright and a long level line
function codaSym(cx, cy, sp) {
  return `<path fill="currentColor" fill-rule="evenodd" d="${ellipsePts(cx, cy, 0.85 * sp, 1.05 * sp, 0)}${ellipsePts(cx, cy, 0.55 * sp, 0.9 * sp, 0)}"/>`
    + `<rect x="${f2(cx - 0.07 * sp)}" y="${f2(cy - 1.55 * sp)}" width="${f2(0.14 * sp)}" height="${f2(3.1 * sp)}" fill="currentColor"/><rect x="${f2(cx - 1.4 * sp)}" y="${f2(cy - 0.07 * sp)}" width="${f2(2.8 * sp)}" height="${f2(0.14 * sp)}" fill="currentColor"/>`;
}
// a metronome mark: note = bpm
function tempoMark(bpm, beat, x, y, sp) {
  const comp = beat === "dotted", type = beat === "half" ? "half" : "quarter";
  return `<g transform="translate(${f2(x)},${f2(y)}) scale(.72)">${notehead(type, 0, 0, sp)}<line x1="${f2(HEAD_W * sp - 0.06 * sp)}" y1="0" x2="${f2(HEAD_W * sp - 0.06 * sp)}" y2="${f2(-3.2 * sp)}" stroke="currentColor" stroke-width="${f2(0.12 * sp)}"/>${comp ? `<circle cx="${f2(HEAD_W * sp + 0.55 * sp)}" cy="0" r="${f2(0.2 * sp)}" fill="currentColor"/>` : ""}</g>`
    + `<text x="${f2(x + (comp ? 1.9 : 1.4) * sp)}" y="${f2(y + 0.45 * sp)}" font-size="${f2(1.45 * sp)}" font-weight="700" fill="currentColor">= ${bpm}</text>`;
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

// ---------- keys ----------
const keyAlter = (step, key) => (key > 0 && SHARP_ORDER.slice(0, key).includes(step) ? 1 : key < 0 && [...SHARP_ORDER].reverse().join("").slice(0, -key).includes(step) ? -1 : 0);
function keyPositions(key, clef) {
  if (key > 0) return clef === "tenor" ? TENOR_SHARP_POS : SHARP_POS.map((p) => p - (clef === "bass" ? 2 : clef === "alto" ? 1 : 0));
  return FLAT_POS.map((p) => p - (clef === "bass" ? 2 : clef === "alto" ? 1 : clef === "tenor" ? -1 : 0));
}
/**
 * The accidentals of a key signature, with naturals first to cancel the old key where that's the
 * convention: going to C (or a minor's relative) cancels everything, switching sharps for flats
 * cancels the old ones, and dropping some of the same kind cancels just those.
 */
function keyItems(key, prev = null) {
  const items = [];
  if (prev !== null && prev !== key) {
    const cancel = key === 0 || Math.sign(key) !== Math.sign(prev) ? Math.abs(prev) : Math.max(0, Math.abs(prev) - Math.abs(key));
    const from = key === 0 || Math.sign(key) !== Math.sign(prev) ? 0 : Math.abs(key);
    for (let i = from; i < from + cancel && i < Math.abs(prev); i++) items.push({ alter: 0, sign: Math.sign(prev), i });
  }
  for (let i = 0; i < Math.abs(key); i++) items.push({ alter: key > 0 ? 1 : -1, sign: Math.sign(key), i });
  return items;
}
const keySigW = (key, prev, sp) => { const n = keyItems(key, prev).length; return n ? n * 1.05 * sp + 0.6 * sp : 0; };
function keySigSvg(key, prev, clef, x, T, sp) {
  let s = "", xx = x;
  const yOf = (pos) => 4 * sp - (pos * sp) / 2;
  for (const it of keyItems(key, prev)) {
    const pos = keyPositions(it.sign || 1, clef)[it.i];
    s += accidental(it.alter, xx + 0.5 * sp, T + yOf(pos), sp);
    xx += 1.05 * sp;
  }
  return s;
}

// ---------- the layout: v2 core's layoutScore, or the same shape built from v1 layout() ----------
function scoreLayout(score, opts) {
  if (typeof core.layoutScore === "function") return core.layoutScore(score, { transposed: !!opts.transposed, bars: opts.bars || 0, courtesy: !!opts.courtesy });
  const parts = score.parts.map((p, pi) => {
    const nStaves = p.staves === 2 ? 2 : 1, clefs = p.clefs || [p.clef || "treble", "bass"];
    const vs = p.voiceStaff || (nStaves === 2 ? [0, 0, 1, 1] : [0, 0, 0, 0]);
    const staves = Array.from({ length: nStaves }, (_, s) => ({ clef: clefs[s] || (s ? "bass" : "treble"), voices: [] }));
    const voices = p.voices && p.voices.length ? p.voices : [[]];
    for (let s = 0; s < nStaves; s++) {
      const mine = voices.map((v, vi) => vi).filter((vi) => (vs[vi] ?? 0) === s);
      if (!mine.length) mine.push(-1);
      mine.forEach((vi, k) => {
        if (k > 0 && !(voices[vi] || []).length) return;
        const ms = vi >= 0 ? core.layout(score, pi, { voice: vi, transposed: !!(opts.transposed && p.transpose), bars: opts.bars || 0 }) : core.layout({ ...score, parts: [{ ...p, voices: [[]] }] }, 0, { bars: opts.bars || 0 });
        for (const m of ms) { m.voice = vi; m.staff = s; if (k > 0 && m.events.every((e) => e.filler || e.ref < 0)) m.events = []; }
        staves[s].voices.push(ms);
      });
    }
    return { staves };
  });
  const base = parts[0]?.staves[0]?.voices[0] || [];
  const n = Math.max(1, ...parts.flatMap((p) => p.staves.flatMap((s) => s.voices.map((v) => v.length))));
  const bars = [];
  let key = score.key || 0, mode = score.mode || "major", time = score.time || { n: 4, d: 4 }, tempo = score.tempo || 0;
  for (let i = 0; i < n; i++) {
    const b = score.bars?.[i] || {}, m = base[i];
    const keyChange = b.key !== undefined && b.key !== key && i > 0, timeChange = !!b.time && i > 0 && (b.time.n !== time.n || b.time.d !== time.d), tempoChange = b.tempo !== undefined && i > 0 && b.tempo !== tempo;
    if (b.key !== undefined) key = b.key; if (b.mode) mode = b.mode; if (b.time) time = b.time; if (b.tempo !== undefined) tempo = b.tempo;
    const prev = bars[i - 1], ticks = m ? m.ticks : time.n * (1920 / time.d);
    bars.push({ ...b, index: i, number: m ? m.number : (prev ? prev.number + 1 : 1), start: m ? m.start : prev ? prev.start + prev.ticks : 0, ticks, pickup: !!m?.pickup, key, mode, time, tempo, keyChange, timeChange, tempoChange });
  }
  // every voice has every bar (a bar a voice doesn't reach yet is empty, or a bar rest for a staff's first voice)
  for (const p of parts) for (const st of p.staves) st.voices.forEach((ms, k) => {
    for (let i = ms.length; i < n; i++) {
      const b = bars[i];
      ms.push({ index: i, number: b.number, start: b.start, ticks: b.ticks, pickup: b.pickup, voice: ms[0]?.voice ?? 0, staff: ms[0]?.staff ?? 0,
        events: k > 0 ? [] : [{ ref: -1, start: b.start, pos: 0, ticks: b.ticks, written: b.ticks, type: "whole", dots: 0, rest: true, full: true, filler: true, notes: [], chord: null, lyric: null, lyricHyphen: false, artic: [], dyn: null, tuplet: null, tiedFromPrev: false, beam: null }] });
    }
  });
  return { bars, parts };
}

/**
 * Draws the score; returns { svg, height, sp, events, measures, systems, pitchAt, pitchInfo, tickAt }.
 * opts: { width, scale, parts (indexes to show; all by default), part (v1: one part), selection: { part, voice, event, note },
 *         range: { part, voice, from, to }, cursor: { part, voice, tick }, playhead, transposed, header, bars }
 */
export function engrave(score, opts = {}) {
  const sp = 8.5 * (opts.scale || 1), width = Math.max(200, opts.width || 800);
  const L = scoreLayout(score, opts), bars = L.bars;
  // the parts to draw: all of them, or a list (one player's part for printing)
  const shown = Array.isArray(opts.parts) ? opts.parts.filter((i) => score.parts[i]) : typeof opts.parts === "number" ? [opts.parts] : score.parts.map((_, i) => i);
  const sel = opts.selection ? { part: 0, voice: 0, ...opts.selection } : null;
  const range = opts.range ? { part: 0, voice: 0, ...opts.range } : null;
  const margin = 1.2 * sp;
  const yOf = (pos) => 4 * sp - (pos * sp) / 2;

  // ---- 0. the staves on the page, top to bottom ----
  const staves = [];
  for (const pi of shown) {
    const part = score.parts[pi], lp = L.parts[pi];
    const transposed = !!(opts.transposed && part.transpose);
    lp.staves.forEach((st, s) => staves.push({ pi, s, part, clef: st.clef || "treble", voices: st.voices, transposed, nStaves: lp.staves.length,
      bottom: CLEF_BOTTOM[st.clef] ?? 30, keyAt: (b) => (transposed ? core.writtenKey(b.key || 0, part.transpose) : b.key || 0) }));
  }
  const multi = shown.length > 1;
  const anyGrand = staves.some((st) => st.nStaves > 1);

  // ---- 1. each piece: noteheads, stems, accidentals, its natural width ----
  for (const st of staves) {
    st.voices.forEach((ms, k) => {
      const vIndex = ms[0]?.voice ?? k;
      const src = st.part.voices?.[vIndex] || [];
      for (const m of ms) for (const e of m.events) {
        e.vk = k; e.voice = vIndex; e.st = st; e.m = m;
        e.level = LEVEL[e.type] ?? 0;
        e.src = src[e.ref] || {};
        e.hyphen = e.lyricHyphen ?? e.src.lyricHyphen; e.arts = e.artic ?? e.src.artic ?? []; e.dynamic = e.dyn ?? e.src.dyn;
        e.xShift = 0;
        if (e.rest) { e.w = (e.slash ? 1.9 : REST_W[e.type]) * sp; e.left = 0; continue; }
        e.heads = e.notes.map((n, i) => ({ ...n, i, pos: n.octave * 7 + STEPS.indexOf(n.step) - st.bottom })).sort((a, b) => a.pos - b.pos);
        e.stemless = e.type === "whole";
        e.hw = headWidth(e.type, sp);
      }
    });
  }
  // voices in a bar: two voices on a staff share it (first stems up, second down), otherwise normal stems
  const real = (m) => m && m.events.some((e) => !e.filler && e.ref >= 0);
  for (const st of staves) {
    for (let i = 0; i < bars.length; i++) {
      const vm = st.voices.map((ms) => ms[i]);
      // shared when a second voice has music in this bar
      const shared = vm.length > 1 && vm.slice(1).some(real);
      // the core marks bars where two voices sound (m.stem); a second voice of rests alone still moves aside
      vm.forEach((m, k) => { if (m) for (const e of m.events) e.forced = m.stem || (shared ? (k === 0 ? "up" : "down") : null); });
    }
  }
  const setStemAndSeconds = (e, up) => {
    e.up = up;
    let prev = null;
    for (const h of up ? e.heads : [...e.heads].reverse()) { h.shift = prev && Math.abs(h.pos - prev.pos) <= 1 && !prev.shift ? (up ? 1 : -1) : 0; prev = h; }
  };
  for (const st of staves) for (const ms of st.voices) for (const m of ms) for (const e of m.events) {
    if (e.rest) continue;
    const top = e.heads[e.heads.length - 1].pos, bot = e.heads[0].pos;
    setStemAndSeconds(e, e.forced ? e.forced === "up" : top - 4 < 4 - bot); // the note further from the middle line decides; the middle line goes down
    const hw = e.hw, anyLeft = e.heads.some((h) => h.shift < 0), anyRight = e.heads.some((h) => h.shift > 0);
    // accidentals: columns leftwards, top note first, each in the first column with room
    const cols = [];
    for (const h of [...e.heads].reverse().filter((h) => h.showAcc)) {
      let c = 0;
      while (cols[c] && cols[c].some((p) => Math.abs(p - h.pos) < 6)) c++;
      (cols[c] ||= []).push(h.pos);
      h.accCol = c;
    }
    e.accColW = cols.map((col, c) => Math.max(...e.heads.filter((h) => h.showAcc && h.accCol === c).map((h) => ACC_W[h.alter] ?? 1)) * sp * (1));
    const accW = e.accColW.reduce((a, b) => a + b + 0.18 * sp, 0);
    e.left = accW + (anyLeft ? hw : 0) + (accW ? 0.2 * sp : 0);
    e.w = hw + (anyRight ? hw : 0) + (e.dots ? 0.5 * sp + e.dots * 0.55 * sp : 0) + (e.level && e.up ? 1.1 * sp : 0);
  }
  // two voices at the same moment: a second (or a unison with different noteheads) puts the down voice to the right
  for (const st of staves) for (let i = 0; i < bars.length; i++) {
    const vm = st.voices.map((ms) => ms[i]).filter((m) => m && m.events.length);
    if (vm.length < 2) continue;
    const byPos = new Map();
    for (const m of vm) for (const e of m.events) if (!e.rest) { if (!byPos.has(e.pos)) byPos.set(e.pos, []); byPos.get(e.pos).push(e); }
    for (const list of byPos.values()) {
      const upE = list.find((e) => e.forced === "up"), dn = list.find((e) => e.forced === "down");
      if (!upE || !dn) continue;
      const upLow = upE.heads[0].pos, dnHigh = dn.heads[dn.heads.length - 1].pos;
      const unison = upLow === dnHigh && upE.type === dn.type && upE.dots === dn.dots && upE.heads.length === 1 && dn.heads.length === 1;
      if (unison) dn.shareHead = true; // one notehead, two stems
      else if (upLow - dnHigh <= 1) { dn.xShift = upE.hw * (upLow === dnHigh ? 1.05 : 1); dn.w += dn.xShift; }
    }
  }

  // ---- 2. bars: the moments where something starts in any staff, spaced by duration, all staves together ----
  const space = (ticks) => sp * (1.9 + 2.3 * Math.pow(Math.max(ticks, 30) / 480, 0.62));
  const lyricPx = 1.45 * sp;
  bars.forEach((b, i) => {
    const evs = [];
    for (const st of staves) for (const ms of st.voices) if (ms[i]) for (const e of ms[i].events) evs.push(e);
    const posList = [...new Set(evs.filter((e) => !(e.full || (e.rest && e.ticks === b.ticks && e.pos === 0 && evs.some((x) => !x.full && x !== e)))).map((e) => e.pos))].sort((a, c) => a - c);
    if (!posList.length) posList.push(0);
    const cols = posList.map((pos) => ({ pos, left: 0, right: 0, lyr: 0 }));
    const colOf = (pos) => { let k = 0; while (k + 1 < cols.length && cols[k + 1].pos <= pos) k++; return k; };
    for (const e of evs) {
      if (e.full || (e.rest && e.ticks === b.ticks && e.pos === 0)) { e.wholeBar = true; continue; }
      const c = cols[colOf(e.pos)];
      e.col = colOf(e.pos);
      c.left = Math.max(c.left, e.left); c.right = Math.max(c.right, e.w);
      if (e.lyric) c.lyr = Math.max(c.lyr, textWidth(e.lyric, lyricPx) / 2 + 0.4 * sp);
    }
    b.cols = cols;
    cols.forEach((c, k) => {
      const next = cols[k + 1], dt = (next ? next.pos : b.ticks) - c.pos;
      c.flex = space(dt);
      c.dist = next ? Math.max(c.flex, c.right + 0.45 * sp + next.left, c.lyr + next.lyr + 0.3 * sp)
        : Math.max(c.flex, c.right + 1.3 * sp, c.lyr + 0.6 * sp); // the last note keeps clear of the barline
    });
    b.lead = 1.0 * sp + (cols[0]?.left || 0);
    b.min = b.lead + cols.reduce((a, c) => a + c.dist, 0);
    b.flex = cols.reduce((a, c) => a + c.flex, 0);
    if (evs.every((e) => e.wholeBar)) { b.min = Math.max(b.min, 7 * sp); }
    // what's drawn at the start of a bar inside a line: a key change, a time change, a start repeat
    b.preMid = (b.keyChange ? Math.max(...staves.map((st) => keySigW(st.keyAt(b), st.keyAt(bars[i - 1] || b), sp)), 0) + 0.4 * sp : 0)
      + (b.timeChange ? timeW(b.time, sp) + 0.8 * sp : 0) + (b.repeatStart ? 1.6 * sp : 0);
    b.preFirst = b.repeatStart ? 1.6 * sp : 0;
    b.endW = b.repeatEnd ? 1.4 * sp : b.barline === "double" || b.barline === "final" || b.keyChange ? 0.8 * sp : 0;
  });
  // bars of the next one's key change end with a double line
  bars.forEach((b, i) => { const nx = bars[i + 1]; if (nx && nx.keyChange && !b.repeatEnd && !b.barline) b.autoDouble = true; });

  // ---- 3. systems: as many bars as fit, then stretched to the width ----
  const nameOf = (p, full) => (full ? p.name || p.instrument || "" : p.short || shortName(p.name || p.instrument || ""));
  const namesW = (full) => (multi || (anyGrand && shown.length > 1) ? Math.max(0, ...shown.map((pi) => textWidth(nameOf(score.parts[pi], full), 1.3 * sp, 600))) + (full ? 1.2 * sp : 0.9 * sp) : 0);
  const decoW = (multi ? 2.4 * sp : 0) + (anyGrand ? 1.6 * sp : 0);
  const startW = (bi, first) => {
    const b = bars[bi];
    const k = Math.max(0, ...staves.map((st) => keySigW(st.keyAt(b), null, sp)));
    const c = Math.max(...staves.map((st) => CLEF_W[st.clef] || 2.6));
    return (c + 1.0) * sp + k + (first || b.timeChange ? timeW(b.time, sp) + 1.0 * sp : 0) + b.preFirst;
  };
  const courtesyW = (bi) => { const b = bars[bi]; if (!b) return 0; return (b.keyChange ? Math.max(...staves.map((st) => keySigW(st.keyAt(b), st.keyAt(bars[bi - 1]), sp))) + 0.8 * sp : 0) + (b.timeChange ? timeW(b.time, sp) + 0.8 * sp : 0); };
  const systems = [];
  let cur = null;
  const leftOf = (first) => margin + namesW(first) + decoW;
  bars.forEach((b, i) => {
    if (!cur) cur = { bars: [], first: !systems.length, start: startW(i, !systems.length) };
    cur.left = leftOf(cur.first);
    const innerW = width - margin - cur.left;
    const used = cur.start + cur.bars.reduce((a, x) => a + x.min + (x === cur.bars[0] ? 0 : x.preMid) + x.endW, 0);
    if (cur.bars.length && used + b.min + b.preMid + b.endW + courtesyW(i + 1) > innerW) { systems.push(cur); cur = { bars: [], first: false, start: startW(i, false) }; cur.left = leftOf(false); }
    cur.bars.push(b);
  });
  if (cur) systems.push(cur);
  systems.forEach((s, si) => {
    const last = si === systems.length - 1, nextFirst = last ? null : systems[si + 1].bars[0].index;
    s.courtesy = nextFirst !== null ? courtesyW(nextFirst) : 0;
    const innerW = width - margin - s.left;
    const fixed = s.start + s.courtesy + s.bars.reduce((a, b, k) => a + b.min + (k ? b.preMid : 0) + b.endW, 0);
    const target = last && fixed < innerW * 0.6 ? fixed : innerW;
    const extra = Math.max(0, target - fixed), flexSum = s.bars.reduce((a, b) => a + b.flex, 0) || 1;
    let x = s.left + s.start;
    s.bars.forEach((b, k) => {
      b.system = si;
      b.pre = k ? b.preMid : 0;
      b.x = x; // the barline before this bar (or the end of the system start)
      let cx = x + b.pre + b.lead;
      for (const c of b.cols) { c.x = cx; cx += c.dist + (extra * c.flex) / flexSum; }
      b.w = cx - x + b.endW;
      x += b.w;
    });
    s.width = x - s.left + s.courtesy;
    s.right = x + s.courtesy;
  });
  // piece positions: the main notehead column (or the rest)
  for (const st of staves) for (const ms of st.voices) for (const m of ms) {
    const b = bars[m.index];
    for (const e of m.events) {
      if (e.wholeBar) { e.x = b.x + b.pre + (b.w - b.pre - b.endW) / 2 - 0.62 * sp; continue; }
      const c = b.cols[e.col ?? 0];
      e.x = c.x + e.xShift;
    }
  }

  // ---- 4. stems and beams (staff-relative y: the top line is 0) ----
  for (const st of staves) for (const ms of st.voices) for (const m of ms) {
    let group = null;
    const groups = [];
    for (const e of m.events) {
      const beat = e.beam;
      if (!e.rest && e.level >= 1 && beat !== null && beat !== undefined) {
        if (group && group.beat === beat && group.tup === !!e.tuplet) group.events.push(e);
        else { group = { beat, tup: !!e.tuplet, events: [e] }; groups.push(group); }
      } else group = null;
    }
    for (const g of groups) if (g.events.length > 1) {
      const all = g.events.flatMap((e) => e.heads.map((h) => h.pos)), top = Math.max(...all), bot = Math.min(...all);
      const forced = g.events[0].forced;
      const up = forced ? forced === "up" : top - 4 < 4 - bot;
      g.up = up;
      for (const e of g.events) { setStemAndSeconds(e, up); e.beamG = g; }
      const sx = (e) => (up ? e.x + e.hw - 0.06 * sp : e.x + 0.06 * sp);
      const endNote = (e) => (up ? e.heads[e.heads.length - 1] : e.heads[0]);
      const levels = Math.max(...g.events.map((e) => e.level));
      const len = (3.25 + Math.max(0, levels - 1) * 0.75) * sp;
      const a = g.events[0], b = g.events[g.events.length - 1];
      const ya = yOf(endNote(a).pos) + (up ? -len : len), yb = yOf(endNote(b).pos) + (up ? -len : len);
      const dx = sx(b) - sx(a) || 1;
      let dy = yb - ya;
      const maxDy = Math.min(1.0 * sp, dx * 0.25);
      dy = Math.max(-maxDy, Math.min(maxDy, dy * 0.5));
      const ends = [endNote(a).pos, endNote(b).pos], inner = g.events.slice(1, -1).map((e) => endNote(e).pos);
      if (inner.some((p) => (up ? p > Math.max(...ends) : p < Math.min(...ends)))) dy = 0;
      let y0 = up ? Math.min(ya, yb - dy) : Math.max(ya, yb - dy);
      for (const e of g.events) {
        const at = y0 + (dy * (sx(e) - sx(a))) / dx, far = up ? e.heads[e.heads.length - 1] : e.heads[0];
        const need = yOf(far.pos) + (up ? -2.75 * sp - (levels - 1) * 0.75 * sp : 2.75 * sp + (levels - 1) * 0.75 * sp);
        if (up && at > need) y0 -= at - need;
        if (!up && at < need) y0 += need - at;
      }
      g.beamAt = (x) => y0 + (dy * (x - sx(a))) / dx;
      for (const e of g.events) { e.stemX = sx(e); e.stemEnd = g.beamAt(e.stemX); }
    }
    for (const e of m.events) {
      if (e.rest || e.stemless || e.beamG) continue;
      const far = e.up ? e.heads[e.heads.length - 1] : e.heads[0];
      const len = 3.5 * sp + Math.max(0, e.level - 1) * 0.75 * sp;
      let end = yOf(far.pos) + (e.up ? -len : len);
      if (!e.forced) { if (e.up && end > yOf(4)) end = yOf(4); if (!e.up && end < yOf(4)) end = yOf(4); } // ledger notes reach the middle line
      e.stemX = e.up ? e.x + e.hw - 0.06 * sp : e.x + 0.06 * sp;
      e.stemEnd = end;
    }
  }

  // spans: the first and last piece of each span's events (drawn after the notes are placed)
  const spanList = (score.spans || []).filter((sp_) => shown.includes(sp_.part ?? 0)).map((sp_) => {
    const part = score.parts[sp_.part ?? 0], v = part.voices?.[sp_.voice ?? 0] || [];
    const a = v.findIndex((e) => e.id === sp_.from), b = v.findIndex((e) => e.id === sp_.to);
    if (a < 0 || b < 0) return null;
    const st = staves.find((x) => x.pi === (sp_.part ?? 0) && x.voices.some((ms) => (ms[0]?.voice ?? 0) === (sp_.voice ?? 0)));
    if (!st) return null;
    const ms = st.voices.find((m) => (m[0]?.voice ?? 0) === (sp_.voice ?? 0));
    const pieces = ms.flatMap((m) => m.events).filter((e) => e.ref >= Math.min(a, b) && e.ref <= Math.max(a, b));
    if (!pieces.length) return null;
    return { ...sp_, st, pieces, first: pieces[0], last: pieces[pieces.length - 1] };
  }).filter(Boolean);

  const voltaRuns = voltas(bars);
  for (const st of staves) for (const ms of st.voices) for (const m of ms) for (const e of m.events) e.sys = bars[m.index].system;

  // ---- 5. how much each staff needs above and below, system by system ----
  let y = 0;
  const header = opts.header !== false && (score.title || score.composer || score.subtitle);
  let headSvg = "";
  const oneTransposed = shown.length === 1 && staves[0]?.transposed;
  if (header) {
    if (score.title) { y += 3.2 * sp; headSvg += `<text x="${f2(width / 2)}" y="${f2(y)}" text-anchor="middle" font-size="${f2(2.6 * sp)}" font-weight="800" fill="currentColor">${escx(score.title)}</text>`; }
    if (score.subtitle) { y += 1.9 * sp; headSvg += `<text x="${f2(width / 2)}" y="${f2(y)}" text-anchor="middle" font-size="${f2(1.5 * sp)}" fill="currentColor" opacity=".8">${escx(score.subtitle)}</text>`; }
    y += 1.9 * sp;
    if (score.composer) headSvg += `<text x="${f2(width - margin)}" y="${f2(y)}" text-anchor="end" font-size="${f2(1.35 * sp)}" fill="currentColor">${escx(score.composer)}</text>`;
    if (score.lyricist) headSvg += `<text x="${f2(margin)}" y="${f2(y)}" font-size="${f2(1.35 * sp)}" fill="currentColor">${escx("Words: " + score.lyricist)}</text>`;
    if (oneTransposed) { y += 1.6 * sp; headSvg += `<text x="${f2(margin)}" y="${f2(y)}" font-size="${f2(1.2 * sp)}" font-style="italic" fill="currentColor" opacity=".8">${escx(staves[0].part.name || staves[0].part.instrument || "")} (written pitch)</text>`; }
    y += 0.8 * sp;
  }
  const barMarks = (b) => b.mark || b.nav || b.text || b.tempoChange;
  systems.forEach((s, si) => {
    const idx = new Set(s.bars.map((b) => b.index));
    s.staves = staves.map((st, k) => {
      let hi = 8, lo = 0, chords = false, lyricLines = 0, dyn = false, hair = false, ped = false, oct8va = false, oct8vb = false;
      const lyrVoices = new Set();
      for (const ms of st.voices) for (const m of ms) {
        if (!idx.has(m.index)) continue;
        for (const e of m.events) {
          if (e.chord) chords = true;
          if (e.lyric) lyrVoices.add(e.voice);
          if (!e.tiedFromPrev && e.dynamic) dyn = true;
          if (e.rest) { if (e.forced === "up") hi = Math.max(hi, 11); if (e.forced === "down") lo = Math.min(lo, -3); continue; }
          for (const h of e.heads) { hi = Math.max(hi, h.pos + 1); lo = Math.min(lo, h.pos - 1); }
          if (e.stemEnd !== undefined) { const p = (4 * sp - e.stemEnd) / (sp / 2); hi = Math.max(hi, p + 1); lo = Math.min(lo, p - 1); }
          if (e.tuplet) hi = Math.max(hi, (e.up ? (4 * sp - e.stemEnd) / (sp / 2) : 8) + 3);
        }
      }
      lyricLines = lyrVoices.size;
      for (const sp_ of spanList) if (sp_.st === st && sp_.pieces.some((e) => idx.has(e.m.index))) {
        if (sp_.type === "cresc" || sp_.type === "dim") hair = true;
        if (sp_.type === "pedal") ped = true;
        if (sp_.type === "8va") oct8va = spanList.some((q) => q.type === "slur" && q.st === st) ? 2 : 1;
        if (sp_.type === "8vb") oct8vb = true;
        if (sp_.type === "slur") { hi += 2; lo -= 2; }
      }
      const isTop = k === 0;
      const marks = isTop && s.bars.some(barMarks), volta = isTop && s.bars.some((b) => b.voltaRun);
      const above = Math.max(2.5 * sp, ((hi - 8) * sp) / 2 + 1.0 * sp) + (chords ? 2.4 * sp : 0) + (oct8va ? (oct8va === 2 ? 4.2 : 1.8) * sp : 0) + (volta ? 2.4 * sp : 0) + (marks ? 2.6 * sp : 0) + (isTop && si === 0 ? 1.8 * sp : isTop ? 0.6 * sp : 0);
      const below = Math.max(2.0 * sp, (-lo * sp) / 2 + 1.0 * sp) + (dyn || hair ? 2.2 * sp : 0) + lyricLines * 2.4 * sp + (ped ? 2.2 * sp : 0) + (oct8vb ? 1.8 * sp : 0);
      return { st, hi, lo, chords, above, below, dyn: dyn || hair, lyricVoices: [...lyrVoices].sort(), ped, volta, marks };
    });
    s.y = y;
    s.staves.forEach((ss, k) => {
      const gap = k === 0 ? ss.above : Math.max(ss.above + s.staves[k - 1].below, ss.st.pi === s.staves[k - 1].st.pi ? 7 * sp : 8 * sp);
      ss.top = (k === 0 ? y : s.staves[k - 1].top + 4 * sp) + gap;
    });
    const lastS = s.staves[s.staves.length - 1];
    s.top = s.staves[0].top;
    y = lastS.top + 4 * sp + lastS.below + (staves.length > 1 ? 1.5 * sp : 0);
    s.h = y - s.y;
  });
  // endings: each volta runs to the next ending or a closing repeat (marks the bars so the space is kept)
  void 0;
  const height = Math.ceil(y + 1 * sp);

  // ---- 6. draw ----
  const out = [];
  const hit = { events: [], measures: [] };
  const line = (x1, y1, x2, y2, w, color = "currentColor") => `<line x1="${f2(x1)}" y1="${f2(y1)}" x2="${f2(x2)}" y2="${f2(y2)}" stroke="${color}" stroke-width="${f2(w)}"/>`;
  systems.forEach((s, si) => {
    const g = [], under = [];
    const sTop = s.staves[0].top, sBot = s.staves[s.staves.length - 1].top + 4 * sp;
    const leftX = s.left;
    // staff lines and system start (clef, key, time) for every staff
    s.staves.forEach((ss, k) => {
      const T = ss.top, st = ss.st, b0 = s.bars[0];
      for (let i = 0; i < 5; i++) g.push(line(leftX, T + i * sp, s.right, T + i * sp, 0.11 * sp));
      let x = leftX + 0.6 * sp;
      g.push(clefGlyph(st.clef, x, T, sp));
      x += ((CLEF_W[st.clef] || 2.6) + 0.6) * sp;
      const key = st.keyAt(b0);
      g.push(keySigSvg(key, null, st.clef, x, T, sp));
      x += keySigW(key, null, sp);
      if (s.first || b0.timeChange) g.push(timeSig(b0.time, x + 0.3 * sp, T, sp).svg);
      // part names: full on the first system, short after; a grand staff's name sits between its staves
      if (multi && st.s === 0) {
        const nm = nameOf(st.part, s.first);
        const yy = st.nStaves > 1 ? (T + s.staves[k + 1].top + 4 * sp) / 2 + 0.45 * sp : T + 2.45 * sp;
        if (nm) g.push(`<text x="${f2(leftX - decoW - 0.6 * sp)}" y="${f2(yy)}" text-anchor="end" font-size="${f2(1.3 * sp)}" font-weight="600" fill="currentColor">${escx(nm)}</text>`);
      }
      // a grand staff: the brace, and barlines through both staves
      if (st.nStaves > 1 && st.s === 0) g.push(brace(leftX - (anyGrand ? 1.5 * sp : 0), T, s.staves[k + 1].top + 4 * sp, sp));
    });
    // the line at the start of the system joins every staff; several parts get a bracket
    g.push(line(leftX, sTop, leftX, sBot, 0.16 * sp));
    if (multi) g.push(bracket(leftX - decoW, sTop, sBot, sp));
    // tempo over the first system; bar numbers over the others
    const T0 = sTop, above0 = s.staves[0].above;
    if (si === 0 && score.tempo) {
      const b0 = bars[0], tm = b0.time || score.time, comp = tm.d === 8 && tm.n % 3 === 0 && tm.n > 3;
      const bpm = comp ? Math.round(((b0.tempo || score.tempo) * 2) / 3) : tm.d === 2 ? Math.round((b0.tempo || score.tempo) / 2) : b0.tempo || score.tempo;
      g.push(tempoMark(bpm, comp ? "dotted" : tm.d === 2 ? "half" : "quarter", leftX + 0.2 * sp, T0 - above0 + 1.8 * sp, sp));
    } else if (si > 0) {
      const b0 = s.bars[0];
      g.push(`<text x="${f2(leftX + 0.2 * sp)}" y="${f2(T0 - 1.2 * sp)}" font-size="${f2(1.15 * sp)}" font-style="italic" fill="currentColor" opacity=".75">${b0.number}</text>`);
    }
    // per staff: barlines, notes, everything attached to them
    s.staves.forEach((ss, k) => {
      const T = ss.top, st = ss.st;
      const firstOfPart = k === 0 || s.staves[k - 1].st.pi !== st.pi;
      const chordY = T - ss.above + (k === 0 ? (si === 0 ? 1.8 * sp : 0.6 * sp) + (ss.marks ? 2.6 * sp : 0) + (ss.volta ? 2.4 * sp : 0) : 0) + 2.0 * sp;
      const lowest = T + 4 * sp + Math.max(2.0 * sp, (-ss.lo * sp) / 2 + 1.0 * sp);
      const dynY = lowest + 1.6 * sp;
      const lyricBase = lowest + (ss.dyn ? 2.2 * sp : 0) + 1.6 * sp;
      const pedY = lyricBase + ss.lyricVoices.length * 2.4 * sp + 0.4 * sp;
      // barlines: through a grand staff, and through a group of instruments (vocal staves keep theirs to themselves),
      // drawn once from the top of each joined run of staves
      const joined = (q, r) => q.st.pi === r.st.pi || (multi && !vocal(q.st.part) && !vocal(r.st.part));
      const joinedNext = k < s.staves.length - 1 && joined(ss, s.staves[k + 1]);
      let runTop = k; while (runTop > 0 && joined(s.staves[runTop - 1], s.staves[runTop])) runTop--;
      const runTops = s.staves.slice(runTop, k + 1).map((q) => q.top);
      s.bars.forEach((b, bi) => {
        const xr = b.x + b.w, last = si === systems.length - 1 && bi === s.bars.length - 1;
        if (!joinedNext) {
          const y1 = s.staves[runTop].top, y2 = T + 4 * sp;
          g.push(barline(b.repeatEnd ? "end" : b.barline || (last ? "final" : b.autoDouble ? "double" : "single"), xr, y1, y2, sp, false, runTops));
          // ||: at the start of the bar: after the system's clef and key, or after a change inside the line;
          // straight after a :|| the two share the thick line
          if (b.repeatStart) {
            const afterEnd = bi > 0 && bars[b.index - 1]?.repeatEnd && !b.keyChange && !b.timeChange;
            const x0 = bi === 0 ? b.x - b.preFirst + 0.1 * sp : afterEnd ? b.x - 0.5 * sp : b.x + b.pre - 1.6 * sp;
            g.push(barline("start", x0, y1, y2, sp, afterEnd, runTops));
          }
        }
        // key and time changes inside the line
        if (b.pre && (b.keyChange || b.timeChange)) {
          let x = b.x + 0.4 * sp;
          if (b.keyChange) { const prevB = bars[b.index - 1]; g.push(keySigSvg(st.keyAt(b), st.keyAt(prevB), st.clef, x, T, sp)); x += Math.max(...staves.map((q) => keySigW(q.keyAt(b), q.keyAt(prevB), sp))) + 0.4 * sp; }
          if (b.timeChange) g.push(timeSig(b.time, x, T, sp).svg);
        }
        if (k === 0 || firstOfPart) hit.measures.push({ index: b.index, x: b.x, w: b.w, system: si, y: s.y, h: s.h, start: b.start, ticks: b.ticks, part: st.pi, staves: s.staves.filter((q) => q.st.pi === st.pi).map((q) => ({ part: q.st.pi, staff: q.st.s, y: q.top, h: 4 * sp })) });
      });
      // courtesy key and time at the end of the line, before a change
      if (s.courtesy) {
        const nb = systems[si + 1].bars[0];
        let x = s.right - s.courtesy + 0.6 * sp;
        if (nb.keyChange) { g.push(keySigSvg(st.keyAt(nb), st.keyAt(bars[nb.index - 1]), st.clef, x, T, sp)); x += keySigW(st.keyAt(nb), st.keyAt(bars[nb.index - 1]), sp) + 0.4 * sp; }
        if (nb.timeChange) g.push(timeSig(nb.time, x, T, sp).svg);
      }
      // the notes, voice by voice
      const lyricLists = new Map();
      st.voices.forEach((ms) => {
        for (const m of ms) {
          if (!s.bars.includes(bars[m.index])) continue;
          for (const e of m.events) drawPiece(e, m, ms, ss, T, si, g, under, lyricLists, dynY, chordY);
          const seen = new Set();
          for (const e of m.events) if (e.beamG && !seen.has(e.beamG)) { seen.add(e.beamG); g.push(drawBeams(e.beamG, T, sp, isSel(e) ? ORANGE : "currentColor")); }
          drawTuplets(m, T, g);
        }
      });
      // lyrics: one line per voice that has words, centered under the notes; hyphens and extender lines
      ss.lyricVoices.forEach((v, li) => {
        const list = lyricLists.get(v) || [], ly = lyricBase + li * 2.4 * sp;
        list.forEach((l, i) => {
          const w = textWidth(l.text, lyricPx);
          if (l.text) g.push(`<text x="${f2(l.x)}" y="${f2(ly)}" text-anchor="middle" font-size="${f2(lyricPx)}" fill="currentColor">${escx(l.text)}</text>`);
          const next = list[i + 1], a = l.x + w / 2, bx = next ? next.x - textWidth(next.text, lyricPx) / 2 : s.right;
          if (l.hyphen) { if (bx - a > 0.8 * sp) g.push(line((a + bx) / 2 - 0.35 * sp, ly - 0.42 * sp, (a + bx) / 2 + 0.35 * sp, ly - 0.42 * sp, 0.12 * sp)); }
          else {
            // held over tied notes, or over more notes before the next syllable (not after the last words)
            const to = Math.max(l.tied || 0, next || l.later ? l.melisma || 0 : 0);
            if (to > a + 0.6 * sp) g.push(line(a + 0.2 * sp, ly + 0.1 * sp, Math.min(to, bx - 0.6 * sp), ly + 0.1 * sp, 0.12 * sp));
          }
        });
      });
      // spans on this staff: slurs, hairpins, octave lines, pedal
      for (const sp_ of spanList) if (sp_.st === st) drawSpan(sp_, s, si, ss, T, g, dynY, pedY);
    });
    // marks over the top staff: endings, rehearsal letters, segno and coda, tempo changes, directions
    const top = s.staves[0], Tt = top.top;
    const markY = Tt - top.above + (si === 0 ? 1.8 * sp : 0.6 * sp) + 2.0 * sp;
    const voltaY = markY + (top.marks ? 2.4 * sp : 0) + 0.3 * sp;
    for (const b of s.bars) {
      let mx = b.x + b.pre + 0.4 * sp;
      if (b.mark) { const w = Math.max(1.9 * sp, textWidth(b.mark, 1.6 * sp, 800) + 0.9 * sp); g.push(`<rect x="${f2(mx - 0.2 * sp)}" y="${f2(markY - 1.65 * sp)}" width="${f2(w)}" height="${f2(2.2 * sp)}" fill="none" stroke="currentColor" stroke-width="${f2(0.16 * sp)}"/><text x="${f2(mx - 0.2 * sp + w / 2)}" y="${f2(markY)}" text-anchor="middle" font-size="${f2(1.6 * sp)}" font-weight="800" fill="currentColor">${escx(b.mark)}</text>`); mx += w + 0.6 * sp; }
      const navs = [].concat(b.nav || []);
      if (navs.includes("Segno")) { g.push(segno(mx + 1.0 * sp, markY - 0.6 * sp, sp)); mx += 2.6 * sp; }
      if (navs.includes("Coda")) { g.push(codaSym(mx + 1.4 * sp, markY - 0.6 * sp, sp)); mx += 3.2 * sp; }
      if (b.tempoChange && b.tempo) { const tm = b.time, comp = tm.d === 8 && tm.n % 3 === 0 && tm.n > 3; g.push(tempoMark(comp ? Math.round((b.tempo * 2) / 3) : tm.d === 2 ? Math.round(b.tempo / 2) : b.tempo, comp ? "dotted" : tm.d === 2 ? "half" : "quarter", mx, markY - 0.2 * sp, sp)); mx += 6 * sp; }
      if (b.text) g.push(`<text x="${f2(mx)}" y="${f2(markY)}" font-family="${SERIF}" font-style="italic" font-size="${f2(1.5 * sp)}" fill="currentColor">${escx(b.text)}</text>`);
      // directions at the end of the bar: Fine, D.C., D.S. al Coda, To Coda (with its sign)
      const words = navs.filter((n) => n !== "Segno" && n !== "Coda");
      if (words.length) {
        const xr = b.x + b.w - 0.4 * sp, txt = words.join("   "), toCoda = words.some((n) => /To Coda/.test(n));
        g.push(`<text x="${f2(xr - (toCoda ? 3.0 * sp : 0))}" y="${f2(markY)}" text-anchor="end" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${f2(1.5 * sp)}" fill="currentColor">${escx(txt)}</text>`);
        if (toCoda) g.push(codaSym(xr - 1.3 * sp, markY - 0.55 * sp, sp * 0.85));
      }
    }
    for (const run of voltaRuns) {
      const inSys = s.bars.filter((b) => b.index >= run.from && b.index <= run.to);
      if (!inSys.length) continue;
      const startsHere = inSys[0].index === run.from, endsHere = inSys[inSys.length - 1].index === run.to;
      const x1 = inSys[0].x + (startsHere ? inSys[0].pre + 0.2 * sp : 0), x2 = inSys[inSys.length - 1].x + inSys[inSys.length - 1].w - 0.4 * sp;
      const yy = voltaY - 1.6 * sp, hook = 2.0 * sp;
      let d = `M${f2(x1)},${f2(yy + (startsHere ? hook : 0))}L${f2(x1)},${f2(yy)}L${f2(x2)},${f2(yy)}`;
      if (endsHere && run.closed) d += `L${f2(x2)},${f2(yy + hook)}`;
      g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.14 * sp)}" d="${d}"/>`);
      if (startsHere) g.push(`<text x="${f2(x1 + 0.5 * sp)}" y="${f2(yy + 1.45 * sp)}" font-size="${f2(1.3 * sp)}" font-weight="700" fill="currentColor">${escx(run.label)}</text>`);
    }
    // the cursor and playhead
    if (opts.cursor && opts.cursor.tick !== undefined) {
      const c = { part: 0, voice: 0, ...opts.cursor };
      const ss = s.staves.find((q) => q.st.pi === c.part && q.st.voices.some((ms) => (ms[0]?.voice ?? 0) === c.voice)) || s.staves.find((q) => q.st.pi === c.part);
      const cx = ss ? xForTick(s, ss.st, c.voice, c.tick, sp) : null;
      if (cx !== null && ss) g.push(`<rect class="cursor" x="${f2(cx - 0.09 * sp)}" y="${f2(ss.top - 1.5 * sp)}" width="${f2(0.18 * sp)}" height="${f2(7 * sp)}" fill="${ORANGE}" rx="${f2(0.09 * sp)}"/>`);
    }
    if (opts.playhead !== undefined && opts.playhead !== null) {
      const px = xForTick(s, s.staves[0].st, null, opts.playhead, sp);
      if (px !== null) g.push(`<rect class="playhead" x="${f2(px - 0.12 * sp)}" y="${f2(sTop - 2 * sp)}" width="${f2(0.24 * sp)}" height="${f2(sBot - sTop + 4 * sp)}" fill="${ORANGE}" opacity=".55"/>`);
    }
    out.push(`<g class="system" data-system="${si}">${under.join("")}${g.join("")}</g>`);
  });

  // ---- one piece of music: noteheads, stem, flags, dots, ties, articulations, chord symbol, lyric, dynamic ----
  function isSel(e) { return sel && sel.part === e.st.pi && sel.voice === e.voice && sel.event === e.ref && e.ref >= 0; }
  function inRange(e) { return range && range.part === e.st.pi && range.voice === e.voice && e.ref >= Math.min(range.from, range.to) && e.ref <= Math.max(range.from, range.to); }
  function drawPiece(e, m, ms, ss, T, si, g, under, lyricLists, dynY, chordY) {
    const st = ss.st, selected = isSel(e), ink = selected ? ORANGE : "currentColor";
    const band = { y: T - ss.above * 0.6, h: 4 * sp + ss.above * 0.6 + ss.below * 0.6 };
    if (inRange(e)) under.push(`<rect x="${f2(e.x - (e.left || 0) - 0.4 * sp)}" y="${f2(T - 1.5 * sp)}" width="${f2((e.left || 0) + e.w + 0.8 * sp + 1.2 * sp)}" height="${f2(7 * sp)}" fill="${ORANGE}" opacity=".16"/>`);
    if (e.rest && e.slash) {
      // a lead sheet's rhythm slash: a slanted notehead on the middle line (open for halves and wholes)
      const cy = T + 2 * sp, w = 1.25 * sp, h = 0.5 * sp, open = e.type === "half" || e.type === "whole";
      const d = `M${f2(e.x)},${f2(cy + sp)}L${f2(e.x + h)},${f2(cy + sp)}L${f2(e.x + w + h)},${f2(cy - sp)}L${f2(e.x + w)},${f2(cy - sp)}Z`;
      g.push(open ? `<path fill="none" stroke="${ink}" stroke-width="${f2(0.16 * sp)}" d="${d}"/>` : `<path fill="${ink}" d="${d}"/>`);
      if (e.type !== "whole" && e.type !== "quarter") g.push(line(e.x + w + h - 0.06 * sp, cy - sp, e.x + w + h - 0.06 * sp, cy - 3.5 * sp, 0.12 * sp, ink));
      hit.events.push({ part: st.pi, staff: st.s, voice: e.voice, event: e.ref, measure: m.index, x: e.x - 0.3 * sp, y: band.y, w: w + h + 0.6 * sp, h: band.h, system: si, start: e.start, ticks: e.ticks, rest: true, slash: true });
    } else if (e.rest) {
      // a second voice's rests move out of the way: up for the first voice, down for the second
      const dy = e.forced === "up" ? -2 * sp : e.forced === "down" ? 2 * sp : 0;
      const type = e.wholeBar ? "whole" : e.type;
      g.push(restGlyph(type, e.x, T + dy, sp, ink));
      if (e.dots && !e.wholeBar) g.push(`<circle cx="${f2(e.x + REST_W[e.type] * sp + 0.45 * sp)}" cy="${f2(T + 1.5 * sp + dy)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
      hit.events.push({ part: st.pi, staff: st.s, voice: e.voice, event: e.ref, measure: m.index, x: e.x - 0.3 * sp, y: band.y, w: REST_W[type] * sp + 0.6 * sp, h: band.h, system: si, start: e.start, ticks: e.ticks, rest: true });
    } else {
      const hw = e.hw;
      const maxP = e.heads[e.heads.length - 1].pos, minP = e.heads[0].pos;
      const lx1 = e.x - 0.35 * sp - (e.heads.some((h) => h.shift < 0) ? hw : 0), lx2 = e.x + hw + 0.35 * sp + (e.heads.some((h) => h.shift > 0) ? hw : 0);
      for (let p = 10; p <= maxP; p += 2) g.push(line(lx1, T + yOf(p), lx2, T + yOf(p), 0.16 * sp));
      for (let p = -2; p >= minP; p -= 2) g.push(line(lx1, T + yOf(p), lx2, T + yOf(p), 0.16 * sp));
      let accX = e.x - (e.heads.some((h) => h.shift < 0) ? hw : 0) - 0.2 * sp;
      const colX = []; for (let c = 0; c < e.accColW.length; c++) { colX[c] = accX - e.accColW[c] / 2; accX -= e.accColW[c] + 0.18 * sp; }
      for (const h of e.heads) {
        const hx = e.x + h.shift * hw, hy = T + yOf(h.pos);
        const noteSel = selected && (sel.note === undefined || sel.note === null || sel.note === h.i);
        if (!e.shareHead) g.push(notehead(e.type, hx, hy, sp, noteSel ? ORANGE : selected ? SOFT : "currentColor"));
        if (h.showAcc && !e.shareHead) {
          const acc = accidental(h.alter, colX[h.accCol], hy, sp, ink);
          g.push(h.showAcc === "courtesy" ? `<text x="${f2(colX[h.accCol] - 0.85 * sp)}" y="${f2(hy + 0.55 * sp)}" font-size="${f2(1.6 * sp)}" fill="${ink}">(</text>${acc}<text x="${f2(colX[h.accCol] + 0.5 * sp)}" y="${f2(hy + 0.55 * sp)}" font-size="${f2(1.6 * sp)}" fill="${ink}">)</text>` : acc);
        }
        if (e.dots) {
          const dy = h.pos % 2 === 0 ? (e.forced === "down" ? sp / 2 : -sp / 2) : 0;
          const dx0 = e.x + hw + (e.heads.some((q) => q.shift > 0) ? hw : 0) + (e.up && e.level && !e.beamG ? 1.1 * sp : 0) + 0.45 * sp;
          for (let d = 0; d < e.dots; d++) g.push(`<circle cx="${f2(dx0 + d * 0.55 * sp)}" cy="${f2(hy + dy)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
        }
        if (h.tie) {
          const nx = nextHead(ms, m, e, h);
          const above = e.forced ? e.forced === "up" : e.heads.length > 1 ? h.pos > (maxP + minP) / 2 || h === e.heads[e.heads.length - 1] : !e.up;
          const ty = hy + (above ? -0.55 * sp : 0.55 * sp), x1 = hx + hw * 0.8;
          if (nx && nx.system === si) g.push(tie(x1, nx.x + 0.2 * sp, ty, above, sp, ink));
          else g.push(tie(x1, Math.max(x1 + 2 * sp, systems[si].right - 0.5 * sp), ty, above, sp, ink));
        }
        if (e.tiedFromPrev && systems[si].bars[0].index === m.index && m.events[0] === e) {
          const above = e.forced ? e.forced === "up" : !e.up;
          g.push(tie(systems[si].left + systems[si].start - 1.2 * sp, e.x + 0.2 * sp, hy + (above ? -0.55 * sp : 0.55 * sp), above, sp, ink));
        }
      }
      if (!e.stemless) {
        const far = e.up ? e.heads[0] : e.heads[e.heads.length - 1];
        g.push(line(e.stemX, T + yOf(far.pos) + (e.up ? -0.15 * sp : 0.15 * sp), e.stemX, T + e.stemEnd, 0.12 * sp, ink));
        if (e.level && !e.beamG) g.push(flags(e.level, e.up ? e.stemX - 0.06 * sp : e.stemX - 0.06 * sp, T + e.stemEnd, e.up, sp, ink));
      }
      // articulations on the notehead side, fermata above (below for a down voice)
      const art = !e.tiedFromPrev ? e.arts : [];
      let ay = e.up ? T + yOf(e.heads[0].pos) + 1.1 * sp : T + yOf(e.heads[e.heads.length - 1].pos) - 1.1 * sp;
      const acx = e.x + hw / 2;
      for (const a of art) {
        if (a === "staccato") g.push(`<circle cx="${f2(acx)}" cy="${f2(ay)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
        if (a === "tenuto") g.push(line(acx - 0.6 * sp, ay, acx + 0.6 * sp, ay, 0.16 * sp, ink));
        if (a === "accent") g.push(`<path fill="none" stroke="${ink}" stroke-width="${f2(0.15 * sp)}" d="M${f2(acx - 0.7 * sp)},${f2(ay - 0.4 * sp)}L${f2(acx + 0.7 * sp)},${f2(ay)}L${f2(acx - 0.7 * sp)},${f2(ay + 0.4 * sp)}"/>`);
        if (a === "fermata") {
          const below = e.forced === "down", fy = below ? Math.max(T + 5.2 * sp, T + Math.max(yOf(e.heads[0].pos), e.up ? 0 : e.stemEnd) + 1.2 * sp) : Math.min(T - 1.2 * sp, T + Math.min(yOf(e.heads[e.heads.length - 1].pos), e.up ? e.stemEnd : 99) - 1.2 * sp);
          const d = below ? -1 : 1;
          g.push(`<path fill="${ink}" d="M${f2(acx - 1.1 * sp)},${f2(fy)}C${f2(acx - 1.0 * sp)},${f2(fy - d * 1.4 * sp)} ${f2(acx + 1.0 * sp)},${f2(fy - d * 1.4 * sp)} ${f2(acx + 1.1 * sp)},${f2(fy)}C${f2(acx + 0.9 * sp)},${f2(fy - d * 1.1 * sp)} ${f2(acx - 0.9 * sp)},${f2(fy - d * 1.1 * sp)} ${f2(acx - 1.1 * sp)},${f2(fy)}Z"/><circle cx="${f2(acx)}" cy="${f2(fy - d * 0.3 * sp)}" r="${f2(0.2 * sp)}" fill="${ink}"/>`);
        }
        if (a === "staccato" || a === "tenuto" || a === "accent") ay += (e.up ? 1 : -1) * 0.9 * sp;
      }
      hit.events.push({ part: st.pi, staff: st.s, voice: e.voice, event: e.ref, measure: m.index, x: e.x - e.left, y: band.y, w: e.left + e.w, h: band.h, system: si, start: e.start, ticks: e.ticks,
        notes: e.heads.map((h) => ({ note: h.i, y: T + yOf(h.pos), x: e.x + h.shift * hw })) });
    }
    if (e.chord) g.push(chordSymbolSvg(e.chord, e.x, chordY, sp).svg);
    // lyrics: a syllable held over more notes (a melisma) gets an extender line to its last note
    if (!lyricLists.has(e.voice)) lyricLists.set(e.voice, []);
    const list = lyricLists.get(e.voice), srcV = st.part.voices?.[e.voice] || [];
    // a held syllable from the line before: carry its extender in from the start of this line
    if (!list.length && !e.lyric && !e.rest && e.ref >= 0) {
      let j = e.ref - (e.tiedFromPrev ? 0 : 1); while (j >= 0 && !srcV[j]?.lyric) j--;
      if (j >= 0 && !srcV[j].lyricHyphen) list.push({ x: systems[si].left + systems[si].start - 1.0 * sp, text: "", hyphen: false, melisma: 0, tied: 0, open: !!e.tiedFromPrev && !srcV.slice(j + 1, e.ref).some((x) => !x.rest), later: srcV.slice(e.ref + 1).some((x) => x.lyric) });
    }
    const lastL = list[list.length - 1];
    if (e.lyric) list.push({ x: e.x + (e.rest ? 0.6 * sp : e.hw / 2), text: e.lyric, hyphen: !!e.hyphen, melisma: 0, tied: 0, open: true, later: srcV.slice(e.ref + 1).some((x) => x.lyric) });
    else if (lastL && !lastL.hyphen && !e.rest) {
      // tied straight on from the syllable's own note, or more notes before the next syllable
      if (e.tiedFromPrev && lastL.open) lastL.tied = e.x + e.hw;
      else { lastL.open = false; lastL.melisma = e.x + e.hw; }
    }
    if (!e.tiedFromPrev && e.dynamic) g.push(`<text x="${f2(e.x)}" y="${f2(dynY)}" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${f2(1.75 * sp)}" fill="currentColor">${escx(e.dynamic)}</text>`);
  }
  // tuplet numbers (and brackets when the group isn't one beam)
  function drawTuplets(m, T, g) {
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const n = run[0].tuplet.n, notes = run.filter((e) => !e.rest);
      const up = run[0].forced ? run[0].forced === "up" : notes.filter((e) => e.up).length >= notes.length / 2;
      const x1 = run[0].x - 0.2 * sp, x2 = run[run.length - 1].x + (run[run.length - 1].hw || sp) + 0.2 * sp, beamed = run.every((e) => e.beamG && e.beamG === run[0].beamG);
      const ends = notes.map((e) => (up ? Math.min(e.stemEnd ?? 0, yOf(e.heads[e.heads.length - 1].pos)) : Math.max(e.stemEnd ?? 4 * sp, yOf(e.heads[0].pos))));
      const ty = up ? Math.min(0, ...ends) - 1.0 * sp : Math.max(4 * sp, ...ends) + 1.0 * sp;
      const cx = (x1 + x2) / 2;
      if (!beamed) {
        const d = up ? 0.6 * sp : -0.6 * sp;
        g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.12 * sp)}" d="M${f2(x1)},${f2(T + ty + d)}L${f2(x1)},${f2(T + ty)}L${f2(cx - 0.8 * sp)},${f2(T + ty)}M${f2(cx + 0.8 * sp)},${f2(T + ty)}L${f2(x2)},${f2(T + ty)}L${f2(x2)},${f2(T + ty + d)}"/>`);
      }
      g.push(`<text x="${f2(cx)}" y="${f2(T + ty + 0.5 * sp)}" text-anchor="middle" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${f2(1.5 * sp)}" fill="currentColor">${n}</text>`);
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
  // a span on one staff: from its first piece to its last, split at system breaks
  function drawSpan(sp_, s, si, ss, T, g, dynY, pedY) {
    const a = sp_.first, b = sp_.last;
    const sysA = a.m && bars[a.m.index].system, sysB = b.m && bars[b.m.index].system;
    if (si < sysA || si > sysB) return;
    const sx = si === sysA ? null : s.left + s.start - 0.6 * sp, ex = si === sysB ? null : s.right - 0.4 * sp;
    if (sp_.type === "slur") {
      // above unless every note is stems-down... the notehead side: a stems-up phrase slurs below, mixed goes above
      const notes = sp_.pieces.filter((e) => !e.rest);
      const above = a.forced ? a.forced === "up" : notes.every((e) => !e.up) || notes.some((e) => e.up) && notes.some((e) => !e.up);
      const endY = (e, start) => {
        if (e.rest) return T + (above ? -0.5 * sp : 4.5 * sp);
        const hi = yOf(e.heads[e.heads.length - 1].pos), lo = yOf(e.heads[0].pos);
        if (above) return T + (e.up && !e.stemless ? Math.min(hi - 1.0 * sp, e.stemEnd - 0.4 * sp + (start ? 0 : 0)) : hi - 1.0 * sp);
        return T + (!e.up && !e.stemless ? Math.max(lo + 1.0 * sp, e.stemEnd + 0.4 * sp) : lo + 1.0 * sp);
      };
      const x1 = sx ?? a.x + a.hw * 0.5, x2 = ex ?? b.x + (b.hw || sp) * 0.5;
      let y1 = sx !== null ? null : endY(a, true), y2 = ex !== null ? null : endY(b, false);
      // continuing pieces: at the height of the notes nearby
      const inSys = notes.filter((e) => bars[e.m.index].system === si);
      const extreme = (e) => (above ? Math.min(yOf(e.heads[e.heads.length - 1].pos), e.up ? e.stemEnd : 99) - 1.0 * sp : Math.max(yOf(e.heads[0].pos), !e.up ? e.stemEnd : -99) + 1.0 * sp);
      if (y1 === null) y1 = T + (inSys.length ? extreme(inSys[0]) : above ? -1 * sp : 5 * sp);
      if (y2 === null) y2 = T + (inSys.length ? extreme(inSys[inSys.length - 1]) : above ? -1 * sp : 5 * sp);
      // lift so the curve clears every note in between
      const len = x2 - x1;
      let lift = Math.min(2.2 * sp, 0.6 * sp + (len / sp) * 0.08 * sp);
      for (const e of inSys) {
        if (e === a || e === b) continue;
        const t = (e.x - x1) / (len || 1); if (t <= 0 || t >= 1) continue;
        const base = y1 + (y2 - y1) * t, need = T + extreme(e);
        const curve = 3 * t * (1 - t) * 1.33; // how much of the lift the curve reaches at t
        const gap = above ? base - need : need - base;
        if (gap < 0) lift = Math.max(lift, (-gap + 0.3 * sp) / Math.max(0.3, curve));
      }
      g.push(arc(x1, y1, x2, y2, above, Math.min(lift, 4 * sp), sp));
      return;
    }
    if (sp_.type === "cresc" || sp_.type === "dim") {
      const x1 = sx ?? a.x, x2 = ex ?? b.x + (b.hw || sp), y = dynY - 0.55 * sp, open = 0.7 * sp;
      // how open each end is, so a hairpin broken across lines keeps its shape
      const total = (sp_.last.m.index - sp_.first.m.index + 1) || 1;
      void total;
      const startOpen = sp_.type === "cresc" ? (sx === null ? 0 : open * 0.5) : sx === null ? open : open * 0.5;
      const endOpen = sp_.type === "cresc" ? (ex === null ? open : open * 0.5) : ex === null ? 0 : open * 0.5;
      g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.13 * sp)}" stroke-linecap="round" d="M${f2(x2)},${f2(y - endOpen)}L${f2(x1)},${f2(y - startOpen)}M${f2(x1)},${f2(y + startOpen)}L${f2(x2)},${f2(y + endOpen)}"/>`);
      return;
    }
    if (sp_.type === "8va" || sp_.type === "8vb") {
      const up = sp_.type === "8va";
      const notes = sp_.pieces.filter((e) => !e.rest && bars[e.m.index].system === si);
      const rests = sp_.pieces.filter((e) => e.rest && bars[e.m.index].system === si);
      const slurred = spanList.some((q) => q.type === "slur" && q.st === sp_.st && q.pieces.some((e) => sp_.pieces.includes(e)));
      const yy = up ? T + Math.min(-1.6 * sp, ...notes.map((e) => Math.min(yOf(e.heads[e.heads.length - 1].pos), e.up ? e.stemEnd : 99) - 1.4 * sp), ...rests.map((e) => (e.forced === "up" ? -2.4 * sp : 0) - 0.4 * sp)) - (slurred ? 2.4 * sp : 0)
        : T + Math.max(5.6 * sp, ...notes.map((e) => Math.max(yOf(e.heads[0].pos), !e.up ? e.stemEnd : -99) + 1.8 * sp));
      const x1 = sx ?? a.x, x2 = ex ?? b.x + (b.hw || sp);
      const label = up ? "8va" : "8vb", lw = textWidth(label, 1.35 * sp, 700, SERIF, true);
      const shown8 = sx === null ? label : "(8)", sw = sx === null ? lw : textWidth("(8)", 1.35 * sp, 700, SERIF, true);
      g.push(`<text x="${f2(x1)}" y="${f2(yy + 0.45 * sp)}" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${f2(1.35 * sp)}" fill="currentColor">${shown8}</text>`);
      const lx = x1 + sw + 0.3 * sp;
      g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.12 * sp)}" stroke-dasharray="${f2(0.6 * sp)} ${f2(0.45 * sp)}" d="M${f2(lx)},${f2(yy)}L${f2(x2)},${f2(yy)}${ex === null ? `L${f2(x2)},${f2(yy + (up ? 1 : -1) * 1.0 * sp)}` : ""}"/>`);
      return;
    }
    if (sp_.type === "pedal") {
      const x1 = sx ?? a.x, x2 = ex ?? b.x + (b.hw || sp) + 0.6 * sp, yy = pedY;
      let d = "";
      if (sx === null) { g.push(`<text x="${f2(x1)}" y="${f2(yy)}" font-family="${SERIF}" font-style="italic" font-weight="700" font-size="${f2(1.45 * sp)}" fill="currentColor">Ped.</text>`); d = `M${f2(x1 + 3.0 * sp)},${f2(yy)}`; }
      else d = `M${f2(x1)},${f2(yy)}`;
      d += `L${f2(x2)},${f2(yy)}`;
      if (ex === null) d += `L${f2(x2)},${f2(yy - 1.1 * sp)}`;
      g.push(`<path fill="none" stroke="currentColor" stroke-width="${f2(0.13 * sp)}" d="${d}"/>`);
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" class="score" width="${f2(width)}" height="${height}" viewBox="0 0 ${f2(width)} ${height}" role="img" aria-label="${escx(score.title || "Score")}">${headSvg}${out.join("")}</svg>`;
  // a height on a staff to a pitch: the line or space, in the key at that bar (concert pitch when written transposed)
  hit.pitchInfo = (si, yy, xx = null) => {
    const s = systems[si]; if (!s) return null;
    let ss = s.staves[0], best = Infinity;
    for (const q of s.staves) { const d = Math.abs(yy - (q.top + 2 * sp)); if (d < best) { best = d; ss = q; } }
    const b = xx === null ? s.bars[0] : s.bars.find((x) => xx < x.x + x.w) || s.bars[s.bars.length - 1];
    const key = ss.st.keyAt(b);
    const pos = Math.round((ss.top + 4 * sp - yy) / (sp / 2)), d = pos + ss.st.bottom, step = ((d % 7) + 7) % 7, oct = Math.floor(d / 7);
    const midi = (oct + 1) * 12 + PC[step] + keyAlter(STEPS[step], key) - (ss.st.transposed ? ss.st.part.transpose || 0 : 0);
    return { part: ss.st.pi, staff: ss.st.s, midi };
  };
  // v1 callers (one staff) get the number; several staves get { part, staff, midi }
  hit.pitchAt = (si, yy, xx = null) => { const r = hit.pitchInfo(si, yy, xx); if (!r) return null; return staves.length === 1 ? r.midi : r; };
  hit.tickAt = (si, xx) => {
    const s = systems[si]; if (!s) return null;
    const b = s.bars.find((x) => xx < x.x + x.w) || s.bars[s.bars.length - 1];
    const cols = b.cols;
    if (!cols.length || xx <= cols[0].x) return b.start;
    for (let i = 0; i < cols.length; i++) {
      const a = cols[i], nx = cols[i + 1], bx = nx ? nx.x : b.x + b.w - b.endW, end = nx ? nx.pos : b.ticks;
      if (xx < bx) return Math.round(b.start + a.pos + ((end - a.pos) * (xx - a.x)) / Math.max(1, bx - a.x));
    }
    return b.start + b.ticks;
  };
  hit.systems = systems.map((s, i) => ({ index: i, y: s.y, h: s.h, top: s.top, staffHeight: 4 * sp, x: s.left, w: s.right - s.left, measures: s.bars.map((b) => b.index),
    staves: s.staves.map((q) => ({ part: q.st.pi, staff: q.st.s, top: q.top })) }));
  return { svg, height, ...hit, sp };

  // a tick to an x on a staff (or across all staves): between the moments things start
  function xForTick(s, st, voice, tick, sp) {
    for (const b of s.bars) {
      if (tick < b.start || tick > b.start + b.ticks) continue;
      const rel = tick - b.start, cols = b.cols;
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i], nx = cols[i + 1];
        if (rel === c.pos) return c.x - 0.55 * sp - (c.left || 0) * 0.5;
        const end = nx ? nx.pos : b.ticks, bx = nx ? nx.x : b.x + b.w - b.endW - 0.6 * sp;
        if (rel > c.pos && rel < end) return c.x + ((bx - c.x) * (rel - c.pos)) / (end - c.pos);
      }
      return b.x + b.w - b.endW - 0.6 * sp;
    }
    void st; void voice;
    return null;
  }
}

// the next notehead a tie goes to (same pitch, next piece of the same voice)
function nextHead(ms, m, e, h) {
  const mi = ms.indexOf(m), ei = m.events.indexOf(e);
  const nxt = m.events[ei + 1] || ms[mi + 1]?.events[0];
  if (!nxt || nxt.rest || !nxt.heads) return null;
  const n = nxt.heads.find((q) => q.midi === h.midi) || nxt.heads.find((q) => q.pos === h.pos);
  if (!n) return null;
  return { x: nxt.x + n.shift * nxt.hw, system: nxt.sys };
}
function drawBeams(g, T, sp, ink) {
  const evs = g.events, up = g.up, th = 0.48 * sp, gap = 0.75 * sp, d = up ? 1 : -1;
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
        const left = i === evs.length - 1 || (i > 0 && evs[i - 1].dots);
        const x = evs[i].stemX, len = 1.1 * sp;
        s += left ? poly(x - len, x + 0.06 * sp, off) : poly(x - 0.06 * sp, x + len, off);
      }
      i = j + 1;
    }
  }
  return s;
}
// barlines: single, double, final, dashed, and repeats (end :||, start ||:) through y1..y2; tops: each staff's top line (for repeat dots)
function barline(kind, x, y1, y2, sp, afterEnd = false, tops = [y1]) {
  const thin = 0.16 * sp, thick = 0.5 * sp, h = y2 - y1;
  const L = (xx) => `<rect x="${f2(xx - thin / 2)}" y="${f2(y1)}" width="${f2(thin)}" height="${f2(h)}" fill="currentColor"/>`;
  const Thick = (xx) => `<rect x="${f2(xx)}" y="${f2(y1)}" width="${f2(thick)}" height="${f2(h)}" fill="currentColor"/>`;
  const dots = (xx) => tops.map((t) => `<circle cx="${f2(xx)}" cy="${f2(t + 1.5 * sp)}" r="${f2(0.24 * sp)}" fill="currentColor"/><circle cx="${f2(xx)}" cy="${f2(t + 2.5 * sp)}" r="${f2(0.24 * sp)}" fill="currentColor"/>`).join("");
  if (kind === "double") return L(x - 0.45 * sp) + L(x);
  if (kind === "final") return L(x - 0.75 * sp) + Thick(x - thick);
  if (kind === "dashed") return `<line x1="${f2(x)}" y1="${f2(y1)}" x2="${f2(x)}" y2="${f2(y2)}" stroke="currentColor" stroke-width="${f2(thin)}" stroke-dasharray="${f2(0.5 * sp)} ${f2(0.4 * sp)}"/>`;
  if (kind === "end") return dots(x - 1.25 * sp) + L(x - 0.75 * sp) + Thick(x - thick);
  // ||: from x; straight after a :|| the two share the thick line
  if (kind === "start") return (afterEnd ? "" : Thick(x)) + L(x + 0.75 * sp) + dots(x + 1.25 * sp);
  return L(x);
}
// singers' staves don't share barlines with the band
const vocal = (p) => /^voice|vocal|choir|soprano|mezzo|contralto|^alto$|^tenor$|^bass$|SATB/i.test(p.instrument || "") || /vocal|voice|choir|soprano|SATB/i.test(p.name || "");
// endings: each volta from its bar to the bar before the next ending, or to a closing repeat (closed), else that bar (open)
function voltas(bars) {
  // the core decides where endings run when it can (so playback and the page agree)
  if (typeof core.voltaRegions === "function") {
    const runs = [];
    for (const [from, r] of core.voltaRegions(bars)) {
      for (let j = from; j <= r.end; j++) bars[j].voltaRun = true;
      runs.push({ from, to: r.end, closed: !!bars[r.end].repeatEnd, label: r.numbers.join(", ") + "." });
    }
    return runs;
  }
  const runs = [];
  bars.forEach((b, i) => {
    if (!b.volta || !b.volta.length) return;
    let to = i, closed = !!b.repeatEnd;
    for (let j = i; j < bars.length; j++) {
      if (j > i && bars[j].volta) break;
      to = j;
      if (bars[j].repeatEnd) { closed = true; break; }
      if (j > i && !bars[j].volta && j === bars.length - 1) break;
    }
    // without a closing repeat, a last ending covers just its own bar
    if (!closed) to = i;
    for (let j = i; j <= to; j++) bars[j].voltaRun = true;
    runs.push({ from: i, to, closed, label: b.volta.join(", ") + "." });
  });
  return runs;
}
// the short names on later systems: the usual orchestral ones, else the first word cut short
const SHORT = [[/violoncello|cello/i, "Vc."], [/double bass|contrabass|upright/i, "Cb."], [/viola(?! da)/i, "Vla."], [/violin|fiddle/i, "Vln."],
  [/piccolo/i, "Picc."], [/flute/i, "Fl."], [/english horn/i, "E.H."], [/oboe/i, "Ob."], [/bass clarinet/i, "B.Cl."], [/clarinet/i, "Cl."], [/bassoon/i, "Bsn."],
  [/soprano sax/i, "S.Sax."], [/alto sax/i, "A.Sax."], [/tenor sax/i, "T.Sax."], [/baritone sax/i, "B.Sax."], [/french horn|^horn/i, "Hn."], [/trumpet|cornet/i, "Tpt."],
  [/flugelhorn/i, "Flhn."], [/trombone/i, "Tbn."], [/euphonium/i, "Euph."], [/tuba/i, "Tba."], [/piano/i, "Pno."], [/organ/i, "Org."], [/harp(?!s)/i, "Hp."],
  [/bass guitar|^bass\b|bass \(/i, "Bass"], [/guitar/i, "Gtr."], [/ukulele/i, "Uke."], [/mandolin/i, "Mand."], [/banjo/i, "Bjo."], [/timpani/i, "Timp."],
  [/drum|percussion/i, "Perc."], [/soprano/i, "S."], [/alto/i, "A."], [/tenor/i, "T."], [/baritone/i, "Bar."], [/vocal|voice|lead/i, "Vox"]];
function shortName(name) {
  const n = String(name).trim();
  if (!n) return "";
  // a number after the name stays: Violin I, Horn 2
  const num = /\s([IVX]+|\d+)$/.exec(n)?.[1] || "";
  const hit = SHORT.find(([re]) => re.test(n));
  if (hit) return num ? `${hit[1]} ${num}` : hit[1];
  const w = n.replace(/\(.*?\)/g, "").trim().split(/\s+/)[0];
  return (w.length > 4 ? w.slice(0, 3) + "." : w) + (num ? ` ${num}` : "");
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
