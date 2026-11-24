// ENCORE. Tabs: drawing, as SVG text (no DOM, so Node can test it). The instrument as it
// looks (kalimba tines hanging from the bridge, longest in the middle; a handpan's ding and
// fields; a tongue drum's ring of tongues) with notes lit up, and the tab sheet itself: number
// tab with octave dots, rhythm underlines and hold dashes, letter names, lyrics, bar lines.
// The same layout draws the editor strip and the printed pages.
import { numberOf, letterOf, durMarks, barsOf, makeInstrument, pcName } from "./tabs-core.js";

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const f1 = (x) => Math.round(x * 10) / 10;
const ACCENT = "#ff3b00";

// ---------- the instrument ----------
/** Where each pitch-ordered note sits around a circle: lowest at the bottom, then alternating sides up to the top */
export function ringAngles(n) {
  const step = 360 / Math.max(1, n), out = [];
  for (let k = 0; k < n; k++) out.push(90 + (k % 2 ? 1 : -1) * step * Math.ceil(k / 2));
  return out;
}
/**
 * The instrument diagram: { viewBox, body, w, h } (body is SVG content; svg() wraps it).
 * opts: { lit: Map(midi -> "now" | "sel" | "hit"), labels: "number" | "letter" | "both", theme: "dark" | "light" }
 * Each key is <g class="key" data-midi="..."> so the page can click it.
 */
export function drawInstrument(inst, opts = {}) {
  const lit = opts.lit || new Map(), labels = opts.labels || "both", light = opts.theme === "light";
  const ink = light ? "#1c1917" : "#f5f5f4", soft = light ? "#57534e" : "#a8a29e";
  if (inst.kind === "kalimba") return kalimba(inst, lit, labels, ink, soft, light);
  return round(inst, lit, labels, ink, soft, light);
}
function label(inst, midi, x, y, labels, color, size, letterColor, letterDy) {
  const n = numberOf(inst, midi), out = [];
  if (labels !== "letter") {
    out.push(`<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-size="${size}" font-weight="800" fill="${color}" font-family="DM Sans, system-ui, sans-serif">${esc(n.text)}</text>`);
    out.push(octDots(x, y, n.oct, size, color));
  }
  if (labels !== "number") {
    const ly = labels === "letter" ? y : y + letterDy;
    out.push(`<text x="${f1(x)}" y="${f1(ly)}" text-anchor="middle" font-size="${labels === "letter" ? size * 0.8 : size * 0.6}" font-weight="${labels === "letter" ? 800 : 600}" fill="${labels === "letter" ? color : letterColor}" font-family="DM Sans, system-ui, sans-serif">${esc(letterOf(inst, midi))}</text>`);
  }
  return out.join("");
}
/** Octave dots: above the digit for each octave up, below for each octave down */
export function octDots(x, y, oct, size, color) {
  if (!oct) return "";
  const r = Math.max(1.6, size * 0.09), out = [];
  for (let k = 0; k < Math.abs(oct); k++) {
    const cy = oct > 0 ? y - size * 0.86 - k * r * 2.6 : y + size * 0.3 + k * r * 2.6;
    out.push(`<circle cx="${f1(x)}" cy="${f1(cy)}" r="${f1(r)}" fill="${color}"/>`);
  }
  return out.join("");
}
function kalimba(inst, lit, labels, ink, soft, light) {
  const n = inst.notes.length, W = 760, H = 300;
  const order = [...inst.notes].map((m, i) => ({ m, i })).sort((a, b) => a.m - b.m);
  const rank = new Map(order.map((o, r) => [o.i, r]));
  const span = Math.min(W - 90, n * 40), x0 = (W - span) / 2, sp = span / n, tw = Math.min(30, sp * 0.74);
  const Lmax = 214, Lmin = 112, top = 34;
  const out = [];
  out.push(`<defs><linearGradient id="kWood" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${light ? "#b07a4a" : "#7a4f2c"}"/><stop offset="1" stop-color="${light ? "#8a5a30" : "#4e311b"}"/></linearGradient>
<linearGradient id="kTine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9aa1aa"/><stop offset=".45" stop-color="#eef1f4"/><stop offset="1" stop-color="#8b929b"/></linearGradient></defs>`);
  out.push(`<path d="M${x0 - 34},14 Q${W / 2},4 ${x0 + span + 34},14 L${x0 + span + 22},${H - 18} Q${W / 2},${H + 4} ${x0 - 22},${H - 18} Z" fill="url(#kWood)" stroke="${light ? "#6b4423" : "#2b1a0e"}" stroke-width="2"/>`);
  out.push(`<ellipse cx="${W / 2}" cy="${H - 58}" rx="26" ry="20" fill="${light ? "#4a2e17" : "#1d1209"}" opacity=".85"/>`);
  for (let i = 0; i < n; i++) {
    const m = inst.notes[i], r = rank.get(i), L = Lmax - ((Lmax - Lmin) * r) / Math.max(1, n - 1);
    const cx = x0 + sp * (i + 0.5), x = cx - tw / 2, state = lit.get(m);
    const fill = state === "now" ? ACCENT : state === "hit" ? "#ffb199" : "url(#kTine)";
    const pc = ((m - inst.key) % 12 + 12) % 12, painted = pc === 0 || pc === 4;
    out.push(`<g class="key" data-midi="${m}" role="button" tabindex="-1" aria-label="${esc(letterOf(inst, m))}, ${esc(numberOf(inst, m).text)}">`);
    out.push(`<rect x="${f1(x - 3)}" y="${top - 6}" width="${f1(tw + 6)}" height="${f1(L + 40)}" fill="transparent"/>`);
    out.push(`<rect x="${f1(x)}" y="${top}" width="${f1(tw)}" height="${f1(L)}" rx="${f1(tw / 2)}" fill="${fill}" stroke="${state === "sel" ? ACCENT : "#3f3f46"}" stroke-width="${state === "sel" ? 3 : 1}"/>`);
    if (painted && !state) out.push(`<circle cx="${f1(cx)}" cy="${f1(top + 22)}" r="${f1(tw * 0.17)}" fill="#52525b"/>`);
    out.push(label(inst, m, cx, top + L - 14, labels === "letter" ? "number" : "number", state === "now" ? "#fff" : "#18181b", Math.min(17, tw * 0.62), soft, 0));
    if (labels !== "number") out.push(`<text x="${f1(cx)}" y="${f1(top + L + 16)}" text-anchor="middle" font-size="${f1(Math.min(12, sp * 0.36))}" font-weight="700" fill="${state === "now" ? ACCENT : light ? "#fde7d3" : "#f3e1cf"}" font-family="DM Sans, system-ui, sans-serif">${esc(letterOf(inst, m))}</text>`);
    out.push(`</g>`);
  }
  // the bridge over the tines
  out.push(`<rect x="${f1(x0 - 10)}" y="${top - 12}" width="${f1(span + 20)}" height="16" rx="5" fill="${light ? "#3f3f46" : "#27272a"}"/>`);
  out.push(`<rect x="${f1(x0 - 10)}" y="${top - 6}" width="${f1(span + 20)}" height="4" fill="#71717a"/>`);
  return { viewBox: `0 0 ${W} ${H}`, w: W, h: H, body: out.join("") };
}
function round(inst, lit, labels, ink, soft, light) {
  const W = 760, H = 300, cx = W / 2, cy = H / 2, R = 142;
  const out = [], hp = inst.kind === "handpan";
  out.push(`<defs><radialGradient id="rShell" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="${hp ? "#6b5a45" : "#5b6470"}"/><stop offset=".75" stop-color="${hp ? "#3a3026" : "#2c3138"}"/><stop offset="1" stop-color="${hp ? "#211b15" : "#1a1d21"}"/></radialGradient>
<radialGradient id="rField" cx=".45" cy=".4" r=".7"><stop offset="0" stop-color="${hp ? "#8a7458" : "#7c8794"}"/><stop offset="1" stop-color="${hp ? "#4a3d2f" : "#3c434c"}"/></radialGradient></defs>`);
  out.push(`<circle cx="${cx}" cy="${cy}" r="${R}" fill="url(#rShell)" stroke="${hp ? "#14100c" : "#0f1114"}" stroke-width="3"/>`);
  const keys = hp ? inst.notes.slice(1) : inst.notes;
  const order = keys.map((m, i) => ({ m, i })).sort((a, b) => a.m - b.m);
  const ang = ringAngles(order.length);
  const lo = order.length ? order[0].m : 60, hi = order.length ? order[order.length - 1].m : 72;
  const sizeOf = (m) => 1 - (hi > lo ? (m - lo) / (hi - lo) : 0) * 0.35;
  const n = order.length, ringR = hp ? 98 : 92;
  order.forEach((o, k) => {
    const a = (ang[k] * Math.PI) / 180, x = cx + Math.cos(a) * ringR, y = cy + Math.sin(a) * ringR, s = sizeOf(o.m), state = lit.get(o.m);
    const fill = state === "now" ? ACCENT : state === "hit" ? "#ffb199" : "url(#rField)";
    const stroke = state === "sel" ? ACCENT : hp ? "#17120d" : "#101317";
    out.push(`<g class="key" data-midi="${o.m}" role="button" tabindex="-1" aria-label="${esc(letterOf(inst, o.m))}, ${esc(numberOf(inst, o.m).text)}">`);
    if (hp) {
      const rx = Math.min(36, (Math.PI * ringR / n) * 0.82) * s + 6, ry = rx * 0.78;
      out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(ang[k] + 90)} ${f1(x)} ${f1(y)})" fill="${fill}" stroke="${stroke}" stroke-width="${state === "sel" ? 3 : 1.5}"/>`);
      out.push(`<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx * 0.42)}" ry="${f1(ry * 0.4)}" transform="rotate(${f1(ang[k] + 90)} ${f1(x)} ${f1(y)})" fill="none" stroke="${state === "now" ? "#fff" : "#00000055"}" stroke-width="1.2"/>`);
    } else {
      // a tongue: a rounded slot pointing at the middle, longer for lower notes
      const wTongue = Math.min(34, ((2 * Math.PI * ringR) / n) * 0.62), len = 46 + 26 * s, rIn = ringR - len / 2;
      const ux = Math.cos(a), uy = Math.sin(a), px = -uy, py = ux, hw = wTongue / 2;
      const ix = cx + ux * rIn, iy = cy + uy * rIn, ox = cx + ux * (rIn + len), oy = cy + uy * (rIn + len);
      const d = `M${f1(ox + px * hw)},${f1(oy + py * hw)} L${f1(ix + px * hw)},${f1(iy + py * hw)} A${f1(hw)},${f1(hw)} 0 0 1 ${f1(ix - px * hw)},${f1(iy - py * hw)} L${f1(ox - px * hw)},${f1(oy - py * hw)} Z`;
      out.push(`<path d="${d}" fill="${fill}" stroke="${stroke}" stroke-width="${state === "sel" ? 3 : 2}"/>`);
    }
    const tc = state === "now" ? "#fff" : "#fafaf9";
    out.push(label(inst, o.m, x, y + (labels === "both" ? 1 : 6), labels, tc, hp ? 17 : 15, state === "now" ? "#fff" : "#e7e5e4", 14));
    out.push(`</g>`);
  });
  if (hp) {
    const m = inst.notes[0], state = lit.get(m);
    out.push(`<g class="key" data-midi="${m}" role="button" tabindex="-1" aria-label="${esc(letterOf(inst, m))}, ding">`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="40" fill="${state === "now" ? ACCENT : state === "hit" ? "#ffb199" : "url(#rField)"}" stroke="${state === "sel" ? ACCENT : "#17120d"}" stroke-width="${state === "sel" ? 3 : 2}"/>`);
    out.push(`<circle cx="${cx}" cy="${cy}" r="17" fill="none" stroke="${state === "now" ? "#fff" : "#00000055"}" stroke-width="1.3"/>`);
    out.push(label(inst, m, cx, cy + (labels === "both" ? 1 : 6), labels, "#fafaf9", 18, "#e7e5e4", 14));
    out.push(`</g>`);
  } else {
    out.push(`<circle cx="${cx}" cy="${cy}" r="20" fill="${light ? "#1f2328" : "#15181c"}" stroke="#0b0d0f" stroke-width="2"/>`);
  }
  return { viewBox: `0 0 ${W} ${H}`, w: W, h: H, body: out.join("") };
}
/** A whole <svg> from drawInstrument output */
export const svg = (d, attrs = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${d.viewBox}" ${attrs}>${d.body}</svg>`;

// ---------- the tab sheet ----------
const NUM_FS = 22, LET_FS = 12, LYR_FS = 13;
const textW = (s, fs, k = 0.6) => String(s).length * fs * k;
/**
 * Lay the tune out in lines: { systems: [{ y, h, items: [{ kind: "note"|"hold"|"bar", i, x, w }] }], height, rowH }.
 * opts: { width, view: "number" | "letter" | "both", lyrics (true), top (0), left (16) }
 */
export function layoutTab(tune, inst, opts = {}) {
  const width = opts.width || 760, view = opts.view || "both", left = opts.left ?? 16, right = width - (opts.right ?? 16);
  const showNum = view !== "letter", showLet = view !== "number";
  const hasLyrics = opts.lyrics !== false && tune.notes.some((n) => n.l);
  const maxChord = Math.max(1, ...tune.notes.map((n) => n.m.length));
  const numH = showNum ? 30 + (maxChord - 1) * 24 : 0, letH = showLet ? (showNum ? 18 : 24) * (showNum ? 1 : maxChord) : 0;
  const rowH = 16 + numH + letH + (hasLyrics ? 22 : 0) + 8;
  const widthOf = (n) => {
    const nums = n.m.length ? n.m.map((m) => numberOf(inst, m).text + (numberOf(inst, m).missing ? "?" : "")) : ["0"];
    const lets = n.m.map((m) => letterOf(inst, m));
    const k = durMarks(n.d);
    let w = 18;
    if (showNum) w = Math.max(w, Math.max(...nums.map((s) => textW(s, NUM_FS, 0.62))) + (k.dot ? 10 : 0) + 14);
    if (showLet) w = Math.max(w, Math.max(0, ...lets.map((s) => textW(s, showNum ? LET_FS : 18, 0.62))) + 12);
    if (hasLyrics && n.l) w = Math.max(w, textW(n.l + (n.h ? "-" : ""), LYR_FS, 0.55) + 10);
    return w;
  };
  const bars = barsOf(tune), systems = [];
  let cur = { items: [] }, x = left;
  const newLine = () => { if (cur.items.length) systems.push(cur); cur = { items: [] }; x = left; };
  const place = (it) => { it.x = x; cur.items.push(it); x += it.w; };
  bars.forEach((bar, bi) => {
    const items = [];
    for (let i = bar.start; i < bar.end; i++) {
      const n = tune.notes[i], k = durMarks(n.d);
      items.push({ kind: "note", i, w: widthOf(n) });
      for (let h = 0; h < k.holds + (k.extraHold || 0); h++) items.push({ kind: "hold", i, w: 24 });
    }
    const full = bar.beats >= tune.beats - 1e-6;
    if (full || bi < bars.length - 1) items.push({ kind: "bar", i: bar.end - 1, w: 16, end: bi === bars.length - 1 });
    const bw = items.reduce((a, it) => a + it.w, 0);
    if (x + bw > right && cur.items.length) newLine();
    for (const it of items) { if (x + it.w > right && cur.items.length && it.kind !== "bar") newLine(); place(it); }
  });
  newLine();
  if (!systems.length) systems.push({ items: [] });
  const top = opts.top ?? 0;
  systems.forEach((s, k) => { s.y = top + k * rowH; s.h = rowH; s.endX = s.items.length ? s.items[s.items.length - 1].x + s.items[s.items.length - 1].w : left; });
  return { systems, height: top + systems.length * rowH, rowH, numH, letH, hasLyrics, showNum, showLet, left, right };
}
/**
 * The tab as SVG content for a block of systems: opts { sel (note index), now (note index playing),
 * cursor (insertion index; tune.notes.length = the end), theme }.
 */
export function drawTab(tune, inst, lay, opts = {}, systems = lay.systems, dy = 0) {
  const light = opts.theme === "light";
  const ink = light ? "#111" : "#f5f5f4", soft = light ? "#555" : "#a8a29e", faint = light ? "#bbb" : "#44403c", red = "#ef4444";
  const out = [];
  for (const s of systems) {
    const y0 = s.y + dy, numTop = y0 + 12;
    const numBase = numTop + 24, letBase = lay.showNum ? numTop + lay.numH + 12 : numTop + 18, lyrBase = numTop + lay.numH + lay.letH + 14;
    s.items.forEach((it, j) => {
      const n = tune.notes[it.i];
      if (it.kind === "bar") {
        const bx = it.x + it.w / 2;
        out.push(`<line x1="${f1(bx)}" y1="${f1(numTop - 2)}" x2="${f1(bx)}" y2="${f1(numTop + lay.numH + lay.letH - 4)}" stroke="${soft}" stroke-width="${it.end ? 3 : 1.2}"/>`);
        if (it.end) out.push(`<line x1="${f1(bx - 4)}" y1="${f1(numTop - 2)}" x2="${f1(bx - 4)}" y2="${f1(numTop + lay.numH + lay.letH - 4)}" stroke="${soft}" stroke-width="1.2"/>`);
        return;
      }
      const cx = it.x + it.w / 2;
      if (it.kind === "hold") { out.push(`<line x1="${f1(cx - 7)}" y1="${f1(numBase - 8)}" x2="${f1(cx + 7)}" y2="${f1(numBase - 8)}" stroke="${ink}" stroke-width="2.2"/>`); return; }
      const isSel = opts.sel === it.i, isNow = opts.now === it.i;
      out.push(`<g class="tn" data-i="${it.i}">`);
      out.push(`<rect x="${f1(it.x + 1)}" y="${f1(y0 + 2)}" width="${f1(it.w - 2)}" height="${f1(s.h - 6)}" rx="6" fill="${isSel ? (light ? "#ffe3d8" : "#3a1a10") : "transparent"}" ${isSel ? `stroke="${ACCENT}" stroke-width="1.5"` : ""}/>`);
      const col = isNow ? ACCENT : ink, k = durMarks(n.d);
      const ms = [...n.m].sort((a, b) => b - a); // highest on top
      if (lay.showNum) {
        if (!ms.length) out.push(`<text x="${f1(cx)}" y="${f1(numBase)}" text-anchor="middle" font-size="${NUM_FS}" font-weight="800" fill="${isNow ? ACCENT : soft}" font-family="DM Sans, system-ui, sans-serif">0</text>`);
        ms.forEach((m, r) => {
          const nb = numberOf(inst, m), by = numBase + r * 24, c = nb.missing ? red : col;
          out.push(`<text x="${f1(cx)}" y="${f1(by)}" text-anchor="middle" font-size="${NUM_FS}" font-weight="800" fill="${c}" font-family="DM Sans, system-ui, sans-serif">${esc(nb.text)}${nb.missing ? "?" : ""}</text>`);
          // octave dots go above the top note and below the bottom one of a chord, beside the others
          if (nb.oct > 0 && r === 0) out.push(octDots(cx, by, nb.oct, NUM_FS, c));
          else if (nb.oct < 0 && r === ms.length - 1) out.push(octDots(cx, by + k.under * 4, nb.oct, NUM_FS, c));
          else if (nb.oct) out.push(`<text x="${f1(cx + textW(nb.text, NUM_FS, 0.62) / 2 + 4)}" y="${f1(by - 8)}" font-size="10" fill="${c}">${nb.oct > 0 ? "°".repeat(nb.oct) : ",".repeat(-nb.oct)}</text>`);
        });
        const lastY = numBase + Math.max(0, ms.length - 1) * 24;
        if (k.dot) out.push(`<circle cx="${f1(cx + Math.max(8, textW(numberOf(inst, ms[0] ?? 60).text, NUM_FS, 0.62) / 2 + 5))}" cy="${f1(numBase - 7)}" r="2.6" fill="${col}"/>`);
        // rhythm underlines; joined to the next note when it's just as short (a beamed group)
        for (let u = 0; u < k.under; u++) {
          const ly = lastY + 6 + u * 4, nx = s.items[j + 1], join = nx && nx.kind === "note" && durMarks(tune.notes[nx.i].d).under > u;
          out.push(`<line x1="${f1(it.x + 4)}" y1="${f1(ly)}" x2="${f1(join ? it.x + it.w + 4 : it.x + it.w - 4)}" y2="${f1(ly)}" stroke="${col}" stroke-width="1.8"/>`);
        }
      }
      if (lay.showLet) {
        const lfs = lay.showNum ? LET_FS : 18;
        if (lay.showNum) { if (ms.length) out.push(`<text x="${f1(cx)}" y="${f1(letBase)}" text-anchor="middle" font-size="${lfs}" font-weight="600" fill="${isNow ? ACCENT : soft}" font-family="DM Sans, system-ui, sans-serif">${esc(ms.map((m) => letterOf(inst, m)).join(" "))}</text>`); }
        else {
          if (!ms.length) out.push(`<text x="${f1(cx)}" y="${f1(letBase)}" text-anchor="middle" font-size="${lfs}" font-weight="800" fill="${soft}" font-family="DM Sans, system-ui, sans-serif">0</text>`);
          ms.forEach((m, r) => out.push(`<text x="${f1(cx)}" y="${f1(letBase + r * 24)}" text-anchor="middle" font-size="${lfs}" font-weight="800" fill="${numberOf(inst, m).missing ? red : col}" font-family="DM Sans, system-ui, sans-serif">${esc(letterOf(inst, m))}</text>`));
          for (let u = 0; u < k.under; u++) out.push(`<line x1="${f1(it.x + 4)}" y1="${f1(letBase + (ms.length - 1) * 24 + 6 + u * 4)}" x2="${f1(it.x + it.w - 4)}" y2="${f1(letBase + (ms.length - 1) * 24 + 6 + u * 4)}" stroke="${col}" stroke-width="1.8"/>`);
          if (k.dot) out.push(`<circle cx="${f1(cx + 16)}" cy="${f1(letBase - 6)}" r="2.6" fill="${col}"/>`);
        }
      }
      if (lay.hasLyrics && n.l) out.push(`<text x="${f1(cx)}" y="${f1(lyrBase)}" text-anchor="middle" font-size="${LYR_FS}" font-style="italic" fill="${isNow ? ACCENT : ink}" font-family="DM Sans, system-ui, sans-serif">${esc(n.l)}${n.h ? "-" : ""}</text>`);
      out.push(`</g>`);
    });
    if (s.items.length) out.push(`<line x1="${f1(lay.left)}" y1="${f1(y0 + s.h - 2)}" x2="${f1(lay.right)}" y2="${f1(y0 + s.h - 2)}" stroke="${faint}" stroke-width=".6" stroke-dasharray="2 5"/>`);
  }
  // the insertion point: after the last note when the cursor is at the end
  if (opts.cursor !== undefined && opts.cursor >= tune.notes.length) {
    const last = lay.systems[lay.systems.length - 1];
    const x = last.items.length ? last.endX + 4 : lay.left + 4, y = last.y + dy;
    out.push(`<rect class="caret" x="${f1(x)}" y="${f1(y + 8)}" width="3" height="${f1(Math.max(30, lay.numH + lay.letH))}" rx="1.5" fill="${ACCENT}"/>`);
  }
  return out.join("");
}
/** The editor strip: one SVG at the given width; returns { svg, height, layout } */
export function renderStrip(tune, inst, opts = {}) {
  const lay = layoutTab(tune, inst, { width: opts.width || 760, view: opts.view });
  const cursorRoom = 6;
  const h = Math.max(lay.height + cursorRoom, 80);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" class="strip" viewBox="0 0 ${lay.right + (opts.right ?? 16)} ${h}" width="100%" height="${h}" preserveAspectRatio="xMinYMin meet" role="img" aria-label="The tab">${drawTab(tune, inst, lay, opts)}</svg>`, height: h, layout: lay };
}

// ---------- printed pages ----------
export const PAGE = { w: 816, h: 1056, margin: 48 };
/**
 * The printable sheet as pages of SVG (US Letter at 96 dpi): a header with title, instrument and tempo, the instrument
 * drawn with its labels, the legend, then the tab. opts: { view, diagram (true) }. -> [svg string]
 */
export function sheetPages(tune, inst = makeInstrument(tune.inst), opts = {}) {
  const { w, h, margin } = PAGE, inner = w - margin * 2;
  const lay = layoutTab(tune, inst, { width: inner + 32, view: opts.view || "both", left: 16, right: 16 });
  const pages = [];
  const header = [];
  let y = margin;
  header.push(`<text x="${margin}" y="${y + 26}" font-size="28" font-weight="800" fill="#111" font-family="DM Sans, system-ui, sans-serif">${esc(tune.title || "Untitled tune")}</text>`);
  y += 34;
  if (tune.by) { header.push(`<text x="${margin}" y="${y + 16}" font-size="14" fill="#444" font-family="DM Sans, system-ui, sans-serif">${esc(tune.by)}</text>`); y += 22; }
  header.push(`<text x="${margin}" y="${y + 16}" font-size="13" fill="#444" font-family="DM Sans, system-ui, sans-serif">${esc(inst.label)} · ${tune.tempo} beats a minute · ${tune.beats} beats a bar</text>`);
  y += 26;
  if (opts.diagram !== false) {
    const d = drawInstrument(inst, { labels: "both", theme: "light" }), dh = 170, dw = (d.w / d.h) * dh;
    header.push(`<svg x="${f1(margin + (inner - dw) / 2)}" y="${y}" width="${f1(dw)}" height="${dh}" viewBox="${d.viewBox}">${d.body}</svg>`);
    y += dh + 10;
  }
  const legend = wrap(sheetLegend(inst), 118);
  legend.forEach((line, k) => header.push(`<text x="${margin}" y="${y + 12 + k * 15}" font-size="11" fill="#555" font-family="DM Sans, system-ui, sans-serif">${esc(line)}</text>`));
  y += legend.length * 15 + 14;
  let page = { parts: [...header], y };
  const footY = h - margin + 20;
  const flush = () => { pages.push(page); page = { parts: [], y: margin }; };
  for (const s of lay.systems) {
    if (page.y + s.h > footY - 16) flush();
    page.parts.push(`<g transform="translate(${margin - 16},0)">${drawTab(tune, inst, lay, { theme: "light" }, [s], page.y - s.y)}</g>`);
    page.y += s.h;
  }
  pages.push(page);
  return pages.map((p, k) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${p.parts.join("")}<text x="${margin}" y="${footY}" font-size="10" fill="#888" font-family="DM Sans, system-ui, sans-serif">Made with ENCORE. Tabs</text>${pages.length > 1 ? `<text x="${w - margin}" y="${footY}" text-anchor="end" font-size="10" fill="#888" font-family="DM Sans, system-ui, sans-serif">Page ${k + 1} of ${pages.length}</text>` : ""}</svg>`);
}
/** The printed sheet's legend (dots and lines, not the plain-text marks) */
export function sheetLegend(inst) {
  const how = inst.kind === "handpan" ? "D = the ding (the middle), 1 2 3... = the fields from low to high, as numbered on the drawing."
    : `1-7 = notes of the ${pcName(inst.key, inst.flats)} scale (1 = ${letterOf(inst, inst.ref)}). A dot above = one octave up, a dot below = one octave down.`;
  return `How to read: ${how} Stacked numbers = play together. 0 = rest. A dash = hold one more beat. A line under = half as long (two lines, a quarter). A dot after = one and a half times as long. A red ? = not on this instrument.`;
}
function wrap(text, n) {
  const words = text.split(" "), out = []; let line = "";
  for (const wd of words) { if ((line + " " + wd).trim().length > n) { out.push(line.trim()); line = wd; } else line += " " + wd; }
  if (line.trim()) out.push(line.trim());
  return out;
}
