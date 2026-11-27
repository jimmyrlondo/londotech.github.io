// ENCORE. Cassette: drawing the J-card on a canvas. One drawing serves the on-screen
// preview (with fold and safe-area guides), the 300 dpi PNGs (no guides) and the print
// sheet (crop and fold marks outside the bleed). Sizes come from cassette-core.js.
import { jcardLayout, fmt, sideLength } from "./cassette-core.js";

export const PRINT_DPI = 300;

/** Words to lines that fit maxW (a very long word is cut to fit) */
export function wrap(ctx, text, maxW) {
  const out = [];
  for (const para of String(text || "").split(/\r?\n/)) {
    if (!para.trim()) { out.push(""); continue; }
    let line = "";
    for (const word of para.split(/\s+/)) {
      const tryLine = line ? line + " " + word : word;
      if (ctx.measureText(tryLine).width <= maxW) { line = tryLine; continue; }
      if (line) out.push(line);
      line = word;
      while (ctx.measureText(line).width > maxW && line.length > 1) {
        let k = line.length - 1;
        while (k > 1 && ctx.measureText(line.slice(0, k)).width > maxW) k--;
        out.push(line.slice(0, k)); line = line.slice(k);
      }
    }
    if (line) out.push(line);
  }
  return out;
}

/** Largest font size (px) from hi down to lo at which `text` fits width w */
function fitSize(ctx, text, font, w, hi, lo = 4) {
  let s = hi;
  for (; s > lo; s -= 0.5) { ctx.font = font(s); if (ctx.measureText(text).width <= w) break; }
  return s;
}

const fontOf = (family, weight = 700) => (px) => `${weight} ${px}px "${family}", "DM Sans", sans-serif`;

/** Darken or lighten a #rrggbb colour by amt (-1..1) */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt);
  return `rgb(${f(n >> 16)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
}
/** Black or white text over a colour */
function onColor(hex) {
  const n = parseInt(hex.slice(1), 16), l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 150 ? "#111111" : "#ffffff";
}

/**
 * Draw one face. canvas is resized to the card's full (bleed) size at dpi.
 * card: { title, artist, label, cat, year, font, panels, fit, textPos, spineDir, bg, fg, accent, notes, listFlap }
 * cover: an ImageBitmap/HTMLImageElement or null. sides: { A: [{title, duration}], B: [...] }.
 * opts: { face: "outside" | "inside", dpi, guides }
 */
export function drawCard(canvas, card, cover, sides, { face = "outside", dpi = PRINT_DPI, guides = false } = {}) {
  const L = jcardLayout({ panels: +card.panels || 3, face, dpi });
  const k = dpi / 25.4; // px per mm
  canvas.width = L.pixels.width; canvas.height = L.pixels.height;
  const ctx = canvas.getContext("2d");
  const ox = L.bleed * k, oy = L.bleed * k, H = L.height * k, safe = L.safe * k;
  const P = Object.fromEntries(L.panels.map((p) => [p.name, { x: ox + p.x * k, w: p.w * k }]));
  const fam = card.font || "DM Sans", bold = fontOf(fam, 700), reg = fontOf(fam, fam === "DM Sans" ? 400 : 500);
  const fg = card.fg || "#f2ede4", bg = card.bg || "#141210", acc = card.accent || "#ff3b00";
  ctx.save();
  ctx.fillStyle = bg; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "alphabetic";

  const title = card.title || "Untitled", artist = card.artist || "";
  // the panel a box covers, stretched into the bleed when it's on an outer edge
  const bleedBox = (p) => {
    const first = p.x <= ox + 1, last = p.x + p.w >= ox + L.width * k - 1;
    const x0 = first ? 0 : p.x, x1 = last ? canvas.width : p.x + p.w;
    return { x: x0, y: 0, w: x1 - x0, h: canvas.height };
  };
  const drawCover = (box, mode) => {
    if (!cover) return false;
    const iw = cover.width, ih = cover.height;
    ctx.save(); ctx.beginPath(); ctx.rect(box.x, box.y, box.w, box.h); ctx.clip();
    if (mode === "fit") {
      const s = Math.min((box.w - 2 * safe) / iw, (box.h - 2 * safe) / ih), w = iw * s, h = ih * s;
      ctx.drawImage(cover, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    } else {
      const s = Math.max(box.w / iw, box.h / ih), w = iw * s, h = ih * s;
      ctx.drawImage(cover, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
    }
    ctx.restore();
    return true;
  };

  if (face === "outside") {
    const front = P.front, spine = P.spine, flap = P.flap;
    // cover image
    const fb = bleedBox(front);
    const wrapBox = card.fit === "wrap" ? { x: spine.x, y: 0, w: fb.x + fb.w - spine.x, h: canvas.height } : fb;
    const hasCover = drawCover(wrapBox, card.fit === "fit" ? "fit" : "fill");
    // title and artist on the front
    if (card.textPos !== "none") {
      const w = front.w - 2 * safe - 2 * k;
      const ts = fitSize(ctx, title, bold, w, 9 * k, 3 * k), as = fitSize(ctx, artist, reg, w, 5.2 * k, 2.4 * k);
      const block = ts * 1.1 + (artist ? as * 1.3 : 0);
      const top = card.textPos === "top" ? oy + safe + 2 * k : oy + H - safe - 2 * k - block;
      if (hasCover) { // a soft band so words read over any picture
        const g = ctx.createLinearGradient(0, card.textPos === "top" ? 0 : top - 6 * k, 0, card.textPos === "top" ? top + block + 6 * k : canvas.height);
        const c0 = "rgba(0,0,0,0)", c1 = "rgba(0,0,0,0.55)";
        if (card.textPos === "top") { g.addColorStop(0, c1); g.addColorStop(1, c0); } else { g.addColorStop(0, c0); g.addColorStop(1, c1); }
        ctx.fillStyle = g;
        const b = bleedBox(front);
        ctx.fillRect(b.x, card.textPos === "top" ? 0 : top - 6 * k, b.w, card.textPos === "top" ? top + block + 6 * k : canvas.height - top + 6 * k);
      }
      ctx.fillStyle = hasCover ? "#ffffff" : fg;
      ctx.textAlign = "left";
      ctx.font = bold(ts); ctx.fillText(title, front.x + safe + k, top + ts);
      if (artist) { ctx.font = reg(as); ctx.fillStyle = hasCover ? "rgba(255,255,255,.88)" : acc; ctx.fillText(artist, front.x + safe + k, top + ts * 1.1 + as * 1.1); }
    }
    if (!hasCover) { // a simple tape-label motif so a card without a picture still looks finished
      ctx.strokeStyle = acc; ctx.lineWidth = 0.6 * k;
      const cx = front.x + front.w / 2, cy = oy + H * 0.45;
      for (const dx of [-11, 11]) { ctx.beginPath(); ctx.arc(cx + dx * k, cy, 6 * k, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(cx + dx * k, cy, 2.2 * k, 0, Math.PI * 2); ctx.stroke(); }
      ctx.strokeRect(cx - 24 * k, cy - 11 * k, 48 * k, 22 * k);
    }
    // spine: a solid band with artist, title and catalog number turned sideways
    if (card.fit !== "wrap" || !cover) { ctx.fillStyle = acc; ctx.fillRect(spine.x, 0, spine.w, canvas.height); }
    const sp = [artist, title].filter(Boolean).join("  ·  "), cat = card.cat || "";
    ctx.save();
    ctx.translate(spine.x + spine.w / 2, oy + H / 2);
    ctx.rotate(card.spineDir === "up" ? -Math.PI / 2 : Math.PI / 2);
    const len = H - 2 * safe - 2 * k, catW = cat ? (ctx.font = reg(3 * k), ctx.measureText(cat).width + 4 * k) : 0;
    const ss = fitSize(ctx, sp, bold, len - catW, Math.min(5.2 * k, spine.w * 0.5), 2 * k);
    ctx.fillStyle = card.fit === "wrap" && cover ? "#ffffff" : onColor(acc);
    ctx.textAlign = "left"; ctx.font = bold(ss);
    ctx.fillText(sp, -len / 2, ss * 0.36);
    if (cat) { ctx.font = reg(3 * k); ctx.textAlign = "right"; ctx.fillText(cat, len / 2, 3 * k * 0.36); }
    ctx.restore();
    // back flap: label, catalog, year, and the songs if asked
    ctx.fillStyle = fg; ctx.textAlign = "left";
    const fx = flap.x + safe * 0.8, fw = flap.w - safe * 1.6 - (flap.x <= ox + 1 ? safe * 0.2 : 0);
    let y = oy + safe + 3.6 * k;
    const small = fontOf(fam, 500);
    if (card.listFlap && (sides.A.length || sides.B.length)) {
      let n = 1;
      const rows = [];
      for (const [nm, list] of [["A", sides.A], ["B", sides.B]]) { if (!list.length) continue; rows.push({ head: "Side " + nm }); for (const s of list) rows.push({ t: `${n++}. ${s.title}` }); }
      const avail = H - 2 * safe - 10 * k;
      let fs = 2.6 * k;
      while (fs > 1.3 * k && rows.length * fs * 1.28 > avail) fs -= 0.1 * k;
      for (const r of rows) {
        ctx.font = r.head ? bold(fs) : small(fs); ctx.fillStyle = r.head ? acc : fg;
        let t = r.head || r.t;
        while (ctx.measureText(t).width > fw && t.length > 2) t = t.slice(0, -2) + "…";
        ctx.fillText(t, fx, y); y += fs * 1.28;
      }
    } else {
      ctx.font = bold(3.4 * k);
      for (const line of wrap(ctx, title, fw).slice(0, 3)) { ctx.fillText(line, fx, y); y += 4.2 * k; }
      if (artist) { ctx.font = small(2.8 * k); ctx.fillStyle = acc; for (const line of wrap(ctx, artist, fw).slice(0, 2)) { ctx.fillText(line, fx, y); y += 3.6 * k; } }
      ctx.fillStyle = fg; ctx.font = small(2.4 * k); y += 2 * k;
      const total = (s) => s.reduce((a, x) => a + x.duration, 0);
      if (sides.A.length) { ctx.fillText(`Side A  ${sides.A.length} songs`, fx, y); y += 3.2 * k; }
      if (sides.B.length) { ctx.fillText(`Side B  ${sides.B.length} songs`, fx, y); y += 3.2 * k; }
      if (sides.A.length || sides.B.length) { ctx.fillText(`Total ${fmt(total(sides.A) + total(sides.B))}`, fx, y); }
    }
    ctx.font = small(2.4 * k); ctx.fillStyle = fg;
    const foot = [card.label, card.cat, card.year].filter(Boolean);
    let fy = oy + H - safe - 1 * k;
    for (const line of foot.reverse()) { let t = line; while (ctx.measureText(t).width > fw && t.length > 2) t = t.slice(0, -2) + "…"; ctx.fillText(t, fx, fy); fy -= 3.1 * k; }
    // fold-out panels on the outside carry the notes' title line
    for (const p of L.panels.filter((q) => q.name.startsWith("panel"))) {
      const pp = P[p.name];
      ctx.fillStyle = acc; ctx.font = bold(4 * k); ctx.fillText(title, pp.x + safe, oy + safe + 5 * k);
      ctx.fillStyle = fg; ctx.font = small(2.6 * k); if (artist) ctx.fillText(artist, pp.x + safe, oy + safe + 9 * k);
    }
  } else {
    // inside: track list on the back of the front, notes on the flap (and fold-outs)
    const front = P.front, flap = P.flap;
    const rows = [];
    let n = 1;
    for (const [nm, list] of [["A", sides.A], ["B", sides.B]]) {
      if (!list.length) continue;
      rows.push({ head: `Side ${nm}`, dur: fmt(sideLength(list.map((s) => s.duration), card.gap ?? 2)) });
      for (const s of list) rows.push({ t: s.title, num: n++, dur: fmt(s.duration) });
      rows.push({ gap: true });
    }
    const x0 = front.x + safe + k, x1 = front.x + front.w - safe - k, top = oy + safe + 2 * k;
    ctx.fillStyle = acc; ctx.textAlign = "left";
    ctx.font = bold(4.4 * k); ctx.fillText(title, x0, top + 4 * k);
    let fs = 3.1 * k;
    const avail = H - 2 * safe - 12 * k;
    while (fs > 1.4 * k && rows.reduce((a, r) => a + (r.gap ? 0.6 : 1.35), 0) * fs > avail) fs -= 0.1 * k;
    let y = top + 10 * k;
    const small = fontOf(fam, 500);
    for (const r of rows) {
      if (r.gap) { y += fs * 0.6; continue; }
      ctx.textAlign = "left";
      if (r.head) { ctx.fillStyle = acc; ctx.font = bold(fs); ctx.fillText(r.head, x0, y); ctx.textAlign = "right"; ctx.fillText(r.dur, x1, y); }
      else {
        ctx.fillStyle = fg; ctx.font = small(fs);
        const dw = ctx.measureText(r.dur).width + 2 * k, nw = ctx.measureText("00 ").width;
        let t = r.t;
        while (ctx.measureText(t).width > x1 - x0 - dw - nw && t.length > 2) t = t.slice(0, -2) + "…";
        ctx.globalAlpha = 0.6; ctx.fillText(String(r.num).padStart(2, "0"), x0, y); ctx.globalAlpha = 1;
        ctx.fillText(t, x0 + nw, y);
        ctx.textAlign = "right"; ctx.fillText(r.dur, x1, y);
      }
      y += fs * 1.35;
    }
    if (!rows.length) { ctx.fillStyle = fg; ctx.globalAlpha = 0.5; ctx.font = small(2.8 * k); ctx.fillText("Your songs appear here.", x0, y); ctx.globalAlpha = 1; }
    // notes flow across the flap, then any fold-outs, shrinking until they fit
    const boxes = [flap, ...L.panels.filter((q) => q.name.startsWith("panel")).map((q) => P[q.name])];
    const text = card.notes || "";
    ctx.fillStyle = fg; ctx.textAlign = "left";
    const flow = (nfs, draw) => {
      ctx.font = small(nfs);
      let rest = text;
      for (const b of boxes) {
        const per = Math.floor((H - 2 * safe - 2 * k) / (nfs * 1.3));
        const all = wrap(ctx, rest, b.w - 2 * safe);
        if (draw) { let ly = oy + safe + 2 * k + nfs; for (const line of all.slice(0, per)) { ctx.fillText(line, b.x + safe, ly); ly += nfs * 1.3; } }
        rest = all.slice(per).join("\n");
        if (!rest) return true;
      }
      return !rest;
    };
    let nfs = 2.5 * k;
    while (nfs > 1.5 * k && !flow(nfs, false)) nfs -= 0.1 * k;
    flow(nfs, true);
  }
  ctx.restore();

  if (guides) {
    ctx.save();
    // bleed: shaded beyond the trim
    ctx.fillStyle = "rgba(0,0,0,.45)";
    ctx.fillRect(0, 0, canvas.width, oy); ctx.fillRect(0, oy + H, canvas.width, canvas.height - oy - H);
    ctx.fillRect(0, oy, ox, H); ctx.fillRect(ox + L.width * k, oy, canvas.width - ox - L.width * k, H);
    ctx.lineWidth = Math.max(1, 0.25 * k);
    ctx.strokeStyle = "rgba(255,255,255,.85)"; ctx.setLineDash([]);
    ctx.strokeRect(ox, oy, L.width * k, H);
    ctx.strokeStyle = "rgba(0,200,255,.9)"; ctx.setLineDash([2 * k, 1.5 * k]);
    for (const p of L.panels.slice(1)) { const x = ox + p.x * k; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,59,0,.8)"; ctx.setLineDash([0.8 * k, 0.8 * k]);
    for (const p of L.panels) ctx.strokeRect(ox + p.x * k + safe, oy + safe, p.w * k - 2 * safe, H - 2 * safe);
    // panel names
    ctx.setLineDash([]); ctx.fillStyle = "rgba(0,200,255,.95)"; ctx.font = `700 ${2.2 * k}px "DM Sans", sans-serif`; ctx.textAlign = "center";
    const names = { flap: "BACK FLAP", spine: "SPINE", front: "FRONT" };
    for (const p of L.panels) ctx.fillText(names[p.name] || "FOLD-OUT", ox + (p.x + p.w / 2) * k, canvas.height - 0.8 * k);
    ctx.restore();
  }
  return L;
}

/**
 * The print sheet for one face: the card at full bleed, a margin around it with crop marks
 * at the trim corners and short ticks where it folds. Returns { canvas, widthMm, heightMm }.
 */
export function printFace(card, cover, sides, face) {
  const inner = document.createElement("canvas");
  const L = drawCard(inner, card, cover, sides, { face, dpi: PRINT_DPI, guides: false });
  const k = PRINT_DPI / 25.4, m = 8; // mm of margin for the marks
  const c = document.createElement("canvas");
  c.width = inner.width + Math.round(2 * m * k); c.height = inner.height + Math.round(2 * m * k);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  const ix = Math.round(m * k), iy = Math.round(m * k);
  ctx.drawImage(inner, ix, iy);
  ctx.strokeStyle = "#000000"; ctx.lineWidth = Math.max(1, 0.12 * k);
  const tx0 = ix + L.bleed * k, ty0 = iy + L.bleed * k, tx1 = tx0 + L.width * k, ty1 = ty0 + L.height * k;
  const gap = L.bleed * k + 1 * k, len = 5 * k;
  const line = (x0, y0, x1, y1) => { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); };
  for (const x of [tx0, tx1]) { line(x, ty0 - gap, x, ty0 - gap - len); line(x, ty1 + gap, x, ty1 + gap + len); }
  for (const y of [ty0, ty1]) { line(tx0 - gap, y, tx0 - gap - len, y); line(tx1 + gap, y, tx1 + gap + len, y); }
  ctx.setLineDash([1 * k, 0.8 * k]);
  for (const p of L.panels.slice(1)) { const x = tx0 + p.x * k; line(x, ty0 - gap, x, ty0 - gap - len); line(x, ty1 + gap, x, ty1 + gap + len); }
  return { canvas: c, widthMm: c.width / k, heightMm: c.height / k, layout: L };
}
