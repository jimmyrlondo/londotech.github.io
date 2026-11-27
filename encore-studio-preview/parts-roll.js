// ENCORE. Learning Tracks: the scrolling piano roll. Bars across the top (with the loop), every
// part's notes (yours bright, the others dim), a playhead, and the words under the notes.
// Pure drawing: the page passes everything in, and hitTest() says what a point is over.
import { noteName, barAt, lyricLine } from "./parts-core.js";

export const RULER = 24, LYRIC = 30, GUTTER = 34;
const ORANGE = "#ff3b00";

/** The view: which song seconds are on screen and the pitch range */
export function viewOf(song, parts, w, view) {
  const vocal = parts.filter((p) => p.role === "voice");
  const use = vocal.length ? vocal : parts;
  let lo = Math.min(...use.map((p) => p.low)) - 2, hi = Math.max(...use.map((p) => p.high)) + 2;
  if (hi - lo < 14) { const mid = (hi + lo) / 2; lo = Math.floor(mid - 7); hi = Math.ceil(mid + 7); }
  const barDur = song.bars[Math.min(1, song.bars.length - 1)]?.dur || 2;
  const span = Math.min(song.length + 0.5, Math.max(6, barDur * (w < 600 ? 2.5 : 4.5)));
  return { lo, hi, span, start: Math.max(0, Math.min(view, Math.max(0, song.length + 0.5 - span))) };
}

/**
 * Draw. s: { song, parts, focus, kind, pos (song seconds), view (left edge seconds), loop: { on, start, end }, playing, dpr }
 * Returns the view used (for hit testing).
 */
export function drawRoll(canvas, s) {
  const dpr = s.dpr || 1, W = canvas.clientWidth, H = canvas.clientHeight;
  if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const g = canvas.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, W, H);
  const css = getComputedStyle(canvas), text = css.getPropertyValue("--text").trim() || "#f5f5f4", dim = css.getPropertyValue("--dim").trim() || "#8a8580";
  if (!s.song) return null;
  const { song, parts } = s;
  const focusPart = s.focus >= 0 ? parts[s.focus] : null;
  const lyricPart = (focusPart?.lyrics ? focusPart : null) || parts.find((p) => p.role === "voice" && p.lyrics) || null;
  const lyricH = lyricPart ? LYRIC : 0;
  const v = viewOf(song, parts, W, s.view), top = RULER, bottom = H - lyricH, noteH = Math.max(3, (bottom - top) / (v.hi - v.lo + 1));
  const x = (t) => GUTTER + ((t - v.start) / v.span) * (W - GUTTER);
  const y = (m) => bottom - (m - v.lo + 1) * noteH;
  // bars: shading, lines and numbers
  g.font = "600 11px 'Space Mono', monospace"; g.textBaseline = "middle";
  song.bars.forEach((b, i) => {
    const x0 = x(b.time), x1 = x(b.time + b.dur);
    if (x1 < GUTTER || x0 > W) return;
    if (i % 2) { g.fillStyle = "rgba(255,255,255,0.025)"; g.fillRect(x0, top, x1 - x0, bottom - top); }
    g.fillStyle = "rgba(255,255,255,0.05)";
    for (let k = 1; k < b.beats; k++) g.fillRect(x0 + ((x1 - x0) * k) / b.beats, top, 1, bottom - top);
    g.fillStyle = "rgba(255,255,255,0.16)"; g.fillRect(x0, top - 6, 1, bottom - top + 6);
    g.fillStyle = dim; g.fillText(String(b.num), x0 + 4, RULER / 2);
  });
  // the loop
  if (s.loop?.on) {
    const a = x(s.loop.start), b = x(s.loop.end);
    g.fillStyle = "rgba(255,59,0,0.07)"; g.fillRect(a, top, b - a, bottom - top);
    g.fillStyle = "rgba(255,59,0,0.55)"; g.fillRect(a, 2, b - a, 4);
  }
  // C lines and their names
  g.font = "10px 'Space Mono', monospace";
  for (let m = Math.ceil(v.lo); m <= v.hi; m++) {
    if (m % 12 !== 0) continue;
    g.fillStyle = "rgba(255,255,255,0.07)"; g.fillRect(GUTTER, y(m) + noteH - 0.5, W - GUTTER, 1);
    g.fillStyle = dim; g.fillText(noteName(m), 3, y(m) + noteH / 2);
  }
  // the notes: accompaniment faint, then the others, your part on top
  const order = parts.map((p, i) => i).filter((i) => parts[i].role !== "off").sort((a, b) => rank(a) - rank(b));
  function rank(i) { return parts[i].role === "accomp" ? 0 : i === s.focus ? 2 : 1; }
  for (const i of order) {
    const p = parts[i], isF = i === s.focus;
    let fill = p.color, alpha = 0.85, outline = false;
    if (p.role === "accomp") alpha = 0.18;
    else if (s.focus >= 0) {
      if (s.kind === "predominant") { if (isF) { fill = ORANGE; alpha = 1; } else alpha = 0.3; }
      else if (s.kind === "missing") { if (isF) { fill = ORANGE; outline = true; alpha = 1; } else alpha = 0.75; }
      else if (s.kind === "alone") { if (isF) { fill = ORANGE; alpha = 1; } else alpha = 0.1; }
    }
    g.globalAlpha = alpha;
    for (const e of p.events) {
      const x0 = x(e.time), x1 = x(e.time + e.dur);
      if (x1 < GUTTER || x0 > W || e.midi < v.lo - 1 || e.midi > v.hi + 1) continue;
      const on = (s.playing || s.pos > 0) && s.pos >= e.time && s.pos < e.time + e.dur, w = Math.max(2, x1 - x0 - 1), yy = y(e.midi) + 1, hh = Math.max(2, noteH - 2);
      if (outline) { g.strokeStyle = fill; g.lineWidth = on ? 2.5 : 1.5; g.setLineDash([4, 3]); roundRect(g, x0, yy, w, hh, 3); g.stroke(); g.setLineDash([]); }
      else { g.fillStyle = fill; roundRect(g, x0, yy, w, hh, 3); g.fill(); }
      if (on && !outline && p.role !== "accomp") { g.globalAlpha = 1; g.strokeStyle = "#fff"; g.lineWidth = 1.5; roundRect(g, x0, yy, w, hh, 3); g.stroke(); g.globalAlpha = alpha; }
    }
    g.globalAlpha = 1;
  }
  // the words
  if (lyricPart) {
    g.fillStyle = "rgba(255,255,255,0.04)"; g.fillRect(GUTTER, bottom, W - GUTTER, lyricH);
    g.font = "600 13px 'DM Sans', sans-serif"; g.textBaseline = "middle";
    const words = lyricLine(lyricPart);
    let edge = -Infinity; // where the last word drawn ends: crowded words move right instead of overlapping
    words.forEach((wd, k) => {
      const x0 = x(wd.time);
      if (x0 > W) return;
      const label = wd.text + (wd.hyphen ? " -" : ""), w = g.measureText(label).width, at = Math.max(GUTTER + 2, x0, edge + 6);
      edge = at + w;
      if (at + w < GUTTER) return;
      const next = words[k + 1]?.time ?? Infinity, now = s.pos >= wd.time && s.pos < next && (s.playing || s.pos > 0);
      g.fillStyle = now ? ORANGE : text;
      g.fillText(label, at, bottom + lyricH / 2);
    });
  }
  // the playhead
  const px = x(s.pos);
  if (px >= GUTTER && px <= W) { g.fillStyle = "#fff"; g.fillRect(px - 1, 0, 2, bottom); }
  // gutter edge
  g.fillStyle = "rgba(255,255,255,0.08)"; g.fillRect(GUTTER - 1, top, 1, bottom - top);
  return { ...v, W, H, top, bottom, noteH, lyricH, x, y, toTime: (px2) => v.start + ((px2 - GUTTER) / (W - GUTTER)) * v.span, toMidi: (py) => v.lo - 1 + (bottom - py) / noteH };
}
function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
/** What's at a point: { area: "ruler", bar } | { area: "note", part } | { area: "roll", time } | null */
export function hitTest(view, s, px, py) {
  if (!view || !s.song) return null;
  if (px < GUTTER) return null;
  const t = view.toTime(px);
  if (py <= view.top) return { area: "ruler", bar: barAt(s.song, Math.max(0, t)), time: t };
  if (py > view.bottom) return null;
  const m = view.toMidi(py);
  // your part first, then the others
  const idx = s.parts.map((p, i) => i).filter((i) => s.parts[i].role === "voice").sort((a, b) => (b === s.focus) - (a === s.focus));
  for (const i of idx) for (const e of s.parts[i].events) if (t >= e.time && t <= e.time + e.dur && m >= e.midi && m < e.midi + 1) return { area: "note", part: i };
  return { area: "roll", time: t };
}
