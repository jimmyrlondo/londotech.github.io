// ENCORE. Chip: the piano roll (a canvas) and the tracker view of the same notes.
import { rowsFor, isMelodic, noteRange, noteName, ARPS, KIT } from "./chip-core.js";

export const CH_COLORS = ["#ff3b00", "#ffb020", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#14b8a6", "#eab308", "#f97316", "#60a5fa", "#f472b6", "#84cc16"];
const KW = 54, RULER = 22;
const BLACK = new Set([1, 3, 6, 8, 10]);

/**
 * api: { state() -> { proj, ci, row, sel:Set, tool, noteLen, playStep, playing, free },
 *        pattern(create) -> pattern|null, addNote(s, p) -> note, commit(kind, notes), remove(notes),
 *        select(set), preview(p), seek(step) }
 */
export class PianoRoll {
  constructor(canvas, api) {
    this.c = canvas; this.api = api; this.g = canvas.getContext("2d");
    this.scroll = 0; this.rh = 14; this.drag = null; this.lastKind = null; this.lastRow = -1;
    canvas.addEventListener("pointerdown", (e) => this.down(e));
    canvas.addEventListener("pointermove", (e) => this.move(e));
    canvas.addEventListener("pointerup", (e) => this.up(e));
    canvas.addEventListener("pointercancel", () => { this.drag = null; this.draw(); });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      if (e.ctrlKey) { this.rh = Math.max(9, Math.min(26, this.rh - Math.sign(e.deltaY) * 2)); }
      else this.scroll += Math.sign(e.deltaY) * 3;
      this.clampScroll(); this.draw();
    }, { passive: false });
    new ResizeObserver(() => this.resize()).observe(canvas);
  }
  resize() {
    const dpr = window.devicePixelRatio || 1, r = this.c.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.w = r.width; this.h = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.clampScroll(); this.draw();
  }
  rows() {
    const s = this.api.state(), kind = s.proj.channels[s.ci].kind;
    return rowsFor(s.proj.chip, kind).slice().reverse();
  }
  cw() { const s = this.api.state(); return (this.w - KW) / s.proj.patLen; }
  visibleRows() { return Math.floor((this.h - RULER) / this.rh); }
  clampScroll() { const n = this.rows().length; this.scroll = Math.max(0, Math.min(Math.max(0, n - this.visibleRows()), this.scroll)); }
  /** scroll so the notes (or the middle of the range) are in view; called when the channel changes */
  focus() {
    const s = this.api.state(), rows = this.rows(), pat = this.api.pattern(false);
    const vis = this.visibleRows();
    if (rows.length <= vis) { this.scroll = 0; return; }
    let target;
    if (pat && pat.notes.length) { const ps = pat.notes.map((n) => n.p); target = (Math.max(...ps) + Math.min(...ps)) / 2; }
    else target = s.proj.channels[s.ci].kind === "triangle" ? 48 : 66;
    const idx = rows.findIndex((r) => r.p <= target);
    this.scroll = Math.round(idx - vis / 2); this.clampScroll();
  }
  at(e) {
    const r = this.c.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    const rows = this.rows(), ri = Math.floor((y - RULER) / this.rh) + this.scroll;
    return { x, y, stepF: (x - KW) / this.cw(), row: rows[ri], ri, inGrid: x >= KW && y >= RULER, inKeys: x < KW && y >= RULER, inRuler: y < RULER && x >= KW };
  }
  hit(pt) {
    const pat = this.api.pattern(false);
    if (!pat || !pt.row) return null;
    return pat.notes.find((n) => n.p === pt.row.p && pt.stepF >= n.s && pt.stepF < n.s + n.l) || null;
  }
  down(e) {
    const s = this.api.state(), pt = this.at(e);
    if (pt.inKeys && pt.row) { this.api.preview(pt.row.p); return; }
    if (pt.inRuler) { this.api.seek(Math.max(0, Math.floor(pt.stepF))); return; }
    if (!pt.inGrid || !pt.row) return;
    this.c.setPointerCapture?.(e.pointerId);
    const note = this.hit(pt);
    if (e.button === 2) { if (note) this.api.remove([note]); return; }
    const L = s.proj.patLen;
    if (note) {
      if (!s.sel.has(note)) this.api.select(e.shiftKey ? new Set([...s.sel, note]) : new Set([note]));
      else if (e.shiftKey) { const n = new Set(s.sel); n.delete(note); this.api.select(n); return; }
      const edge = pt.x > KW + (note.s + note.l) * this.cw() - Math.min(8, this.cw() * 0.4);
      const sel = [...this.api.state().sel];
      this.drag = { mode: edge ? "resize" : "move", x0: pt.x, y0: pt.y, ri0: pt.ri, notes: sel, orig: sel.map((n) => ({ s: n.s, l: n.l, p: n.p })), moved: false, note };
      this.api.preview(note.p, note);
    } else if (s.tool === "draw") {
      const st = Math.max(0, Math.min(L - 1, Math.floor(pt.stepF)));
      const n = this.api.addNote(st, pt.row.p);
      if (!n) return;
      this.drag = { mode: "draw", x0: pt.x, y0: pt.y, ri0: pt.ri, notes: [n], orig: [{ s: n.s, l: n.l, p: n.p }], moved: true, note: n };
    } else {
      this.api.select(new Set());
      this.drag = { mode: "band", x0: pt.x, y0: pt.y, x1: pt.x, y1: pt.y, moved: false };
    }
    this.draw();
  }
  move(e) {
    const d = this.drag; if (!d) return;
    const pt = this.at(e), s = this.api.state(), L = s.proj.patLen, rows = this.rows(), cw = this.cw();
    const dx = Math.round((pt.x - d.x0) / cw), dr = Math.round((pt.y - d.y0) / this.rh);
    if (Math.abs(pt.x - d.x0) > 3 || Math.abs(pt.y - d.y0) > 3) d.moved = true;
    if (d.mode === "band") { d.x1 = pt.x; d.y1 = pt.y; this.bandSelect(d); this.draw(); return; }
    if (d.mode === "move") {
      const lo = Math.min(...d.orig.map((o) => o.s)), hi = Math.max(...d.orig.map((o) => o.s + o.l));
      const ddx = Math.max(-lo, Math.min(L - hi, dx));
      let changedPitch = false;
      d.notes.forEach((n, i) => {
        const o = d.orig[i], idx = rows.findIndex((r) => r.p === o.p), ni = Math.max(0, Math.min(rows.length - 1, idx + dr));
        n.s = o.s + ddx;
        if (rows[ni].p !== n.p) changedPitch = true;
        n.p = rows[ni].p;
      });
      if (changedPitch) this.api.preview(d.note.p, d.note);
    } else {
      d.notes.forEach((n, i) => { const o = d.orig[i]; n.l = Math.max(1, Math.min(L - o.s, d.mode === "draw" ? Math.max(o.l, Math.floor(pt.stepF) - o.s + 1) : o.l + dx)); });
    }
    this.draw();
  }
  up() {
    const d = this.drag; this.drag = null;
    if (!d) return;
    if (d.mode === "band") { this.draw(); return; }
    const changed = d.notes.some((n, i) => n.s !== d.orig[i].s || n.l !== d.orig[i].l || n.p !== d.orig[i].p);
    if (d.mode === "draw" || changed) this.api.commit(d.mode, d.notes);
    this.draw();
  }
  bandSelect(d) {
    const pat = this.api.pattern(false); if (!pat) return;
    const cw = this.cw(), rows = this.rows();
    const x0 = Math.min(d.x0, d.x1), x1 = Math.max(d.x0, d.x1), y0 = Math.min(d.y0, d.y1), y1 = Math.max(d.y0, d.y1);
    const sel = new Set();
    for (const n of pat.notes) {
      const ri = rows.findIndex((r) => r.p === n.p) - this.scroll;
      const nx0 = KW + n.s * cw, nx1 = nx0 + n.l * cw, ny0 = RULER + ri * this.rh, ny1 = ny0 + this.rh;
      if (nx1 > x0 && nx0 < x1 && ny1 > y0 && ny0 < y1) sel.add(n);
    }
    this.api.select(sel);
  }
  draw() {
    if (!this.w) return;
    const g = this.g, s = this.api.state(), proj = s.proj, ch = proj.channels[s.ci], kind = ch.kind;
    if (this.lastKind !== kind + s.ci || this.lastRow !== s.row) { this.lastKind = kind + s.ci; this.lastRow = s.row; this.focus(); }
    const rows = this.rows(), cw = this.cw(), rh = this.rh, L = proj.patLen, vis = this.visibleRows() + 1;
    const css = getComputedStyle(document.documentElement);
    const bg = "#151210", bgDark = "#0e0c0b", line = "rgba(255,255,255,0.06)", beat = "rgba(255,255,255,0.13)", bar = "rgba(255,255,255,0.28)";
    void css;
    g.clearRect(0, 0, this.w, this.h);
    g.fillStyle = bg; g.fillRect(0, 0, this.w, this.h);
    const [lo, hi] = isMelodic(kind) ? noteRange(proj.chip, kind) : [-1, 999];
    g.font = "10px 'Space Mono', monospace"; g.textBaseline = "middle";
    for (let k = 0; k < vis; k++) {
      const r = rows[k + this.scroll]; if (!r) break;
      const y = RULER + k * rh;
      const black = isMelodic(kind) && BLACK.has(r.p % 12);
      g.fillStyle = black ? bgDark : bg; g.fillRect(KW, y, this.w - KW, rh);
      if (!proj.free && isMelodic(kind) && (r.p < lo || r.p > hi)) { g.fillStyle = "rgba(239,68,68,0.10)"; g.fillRect(KW, y, this.w - KW, rh); }
      g.fillStyle = line; g.fillRect(KW, y + rh - 1, this.w - KW, 1);
      if (isMelodic(kind) && r.p % 12 === 0) { g.fillStyle = beat; g.fillRect(KW, y + rh - 1, this.w - KW, 1); }
      // keys
      g.fillStyle = black ? "#2a2522" : "#d9d4cf"; g.fillRect(0, y, KW - 2, rh - 1);
      if (!isMelodic(kind) || r.p % 12 === 0 || rh >= 13) {
        g.fillStyle = black ? "#a39d97" : "#1a1715";
        const label = isMelodic(kind) ? (r.p % 12 === 0 || rh >= 16 ? r.label : "") : r.label;
        if (label) g.fillText(label.length > 8 ? label.slice(0, 8) : label, 4, y + rh / 2);
      }
    }
    for (let st = 0; st <= L; st++) {
      const x = KW + st * cw;
      g.fillStyle = st % (proj.spb * 4) === 0 ? bar : st % proj.spb === 0 ? beat : line;
      g.fillRect(Math.round(x), RULER, 1, this.h - RULER);
    }
    // ruler
    g.fillStyle = "#1d1916"; g.fillRect(0, 0, this.w, RULER);
    g.fillStyle = "#8a8580";
    for (let st = 0; st < L; st += proj.spb) {
      const x = KW + st * cw;
      g.fillText(st % (proj.spb * 4) === 0 ? `${s.row + 1}.${st / (proj.spb * 4) + 1}` : "·", x + 3, RULER / 2);
    }
    g.fillText(`Row ${s.row + 1}`, 4, RULER / 2);
    const yOf = (p) => { const i = rows.findIndex((r) => r.p === p) - this.scroll; return i < 0 || i >= vis ? null : RULER + i * rh; };
    // ghosts: the other channels' notes in this row
    if (isMelodic(kind)) proj.channels.forEach((c2, ci) => {
      if (ci === s.ci || !isMelodic(c2.kind)) return;
      const pi = proj.order[s.row]?.[ci], pat = pi >= 0 ? proj.patterns[ci][pi] : null;
      if (!pat) return;
      g.fillStyle = CH_COLORS[ci % CH_COLORS.length] + "33";
      for (const n of pat.notes) { const y = yOf(n.p); if (y != null) g.fillRect(KW + n.s * cw + 1, y + 2, n.l * cw - 2, rh - 4); }
    });
    const pat = this.api.pattern(false), col = CH_COLORS[s.ci % CH_COLORS.length];
    if (pat) for (const n of pat.notes) {
      const y = yOf(n.p); if (y == null) continue;
      const x = KW + n.s * cw + 1, w = Math.max(3, n.l * cw - 2);
      g.globalAlpha = 0.45 + 0.55 * ((n.v ?? 12) / 15);
      g.fillStyle = col; g.fillRect(x, y + 1, w, rh - 2);
      g.globalAlpha = 1;
      if (s.sel.has(n)) { g.strokeStyle = "#fff"; g.lineWidth = 2; g.strokeRect(x + 1, y + 2, w - 2, rh - 4); }
      const fx = n.fx || {}, tags = (fx.arp && fx.arp !== "none" ? "A" : "") + (fx.vib ? "~" : "") + (fx.slide ? (fx.slide > 0 ? "/" : "\\") : "") + (fx.glide ? "G" : "") + (fx.sweep && fx.sweep !== "none" ? "W" : "") + (fx.env && fx.env !== "inst" ? "E" : "");
      if (tags && w > 14 && rh >= 11) { g.fillStyle = "#000"; g.fillText(tags, x + 3, y + rh / 2); }
    }
    if (this.drag?.mode === "band") { const d = this.drag; g.strokeStyle = "#ff3b00"; g.lineWidth = 1; g.strokeRect(Math.min(d.x0, d.x1), Math.min(d.y0, d.y1), Math.abs(d.x1 - d.x0), Math.abs(d.y1 - d.y0)); }
    // play cursor
    const ps = s.playStep - s.row * L;
    if (ps >= 0 && ps <= L) { g.fillStyle = s.playing ? "#ff3b00" : "rgba(255,59,0,0.5)"; g.fillRect(KW + ps * cw - 1, 0, 2, this.h); }
    if (!pat || !pat.notes.length) {
      g.fillStyle = "rgba(255,255,255,0.35)"; g.font = "13px 'DM Sans', sans-serif"; g.textAlign = "center";
      g.fillText(s.tool === "draw" ? "Click to add a note. Drag to make it longer." : "Drag to select notes.", KW + (this.w - KW) / 2, RULER + (this.h - RULER) / 2);
      g.textAlign = "left";
    }
  }
}

// ---- tracker view: one row per step, one column per channel
const HEX = (v) => v.toString(16).toUpperCase();
export function cellText(proj, ci, n, inside) {
  if (!n) return inside ? "  |       " : "---  -- - ";
  const kind = proj.channels[ci].kind;
  const name = isMelodic(kind) ? noteName(n.p).padEnd(3, "-").replace("#", "#") : kind === "dpcm" ? (KIT[n.p] || "?").slice(0, 3).toUpperCase() : `N${HEX(n.p)}`.padEnd(3, " ");
  const inst = String(proj.instruments.findIndex((i) => i.id === n.i) + 1).padStart(2, "0");
  const fx = n.fx || {};
  const f = fx.arp && fx.arp !== "none" ? "A" + (ARPS[fx.arp].o.slice(1).map((x) => HEX(Math.min(15, x))).join("")).padEnd(2, "0").slice(0, 2) : fx.vib ? "V" + fx.vib + fx.vibSpeed : fx.slide ? (fx.slide > 0 ? "S+" : "S-") + "" : fx.glide ? "G" + HEX(Math.min(15, fx.glide)) : fx.sweep && fx.sweep !== "none" ? "W" + fx.sweep[0].toUpperCase() : "---";
  return `${name}  ${inst} ${HEX(n.v ?? 12)} ${f.padEnd(3, "-")}`;
}
/** what's in each step of a pattern: { note at start, or inside a held note, or an off } */
export function trackerRows(pat, L) {
  const rows = Array.from({ length: L }, () => ({ n: null, inside: false, off: false }));
  if (!pat) return rows;
  const notes = [...pat.notes].sort((a, b) => a.s - b.s);
  notes.forEach((n, k) => {
    if (n.s < L) rows[n.s].n = n;
    for (let i = n.s + 1; i < Math.min(L, n.s + n.l); i++) rows[i].inside = true;
    const end = n.s + n.l, next = notes[k + 1];
    if (end < L && (!next || next.s > end)) rows[end].off = true;
  });
  return rows;
}
// computer keyboard as a piano, the classic tracker layout
export const TRACKER_KEYS = { z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11, q: 12, 2: 13, w: 14, 3: 15, e: 16, r: 17, 5: 18, t: 19, 6: 20, y: 21, 7: 22, u: 23, i: 24 };
