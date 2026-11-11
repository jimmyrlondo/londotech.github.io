// ENCORE. Clips: the looks. One drawFrame() paints a video frame for any format and
// look at a moment in the song, in that format's own pixels (the preview just scales
// the canvas). The same code makes the preview and the exported video.
import { FORMATS, textSafe, barsAt, thumpAt, activeLine, lineTimes, wrapWords, loopWave, easeOut, inkOn, hslHex } from "./clips-core.js";

const SANS = '"DM Sans", system-ui, -apple-system, "Segoe UI", sans-serif';
const MONO = '"Space Mono", ui-monospace, monospace';
const PAPER = "#f2efe8";
const font = (w, px, fam = SANS) => `${w} ${Math.round(px)}px ${fam}`;
const TAU = Math.PI * 2;

const mk = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const imgW = (img) => img.naturalWidth || img.videoWidth || img.width;
const imgH = (img) => img.naturalHeight || img.videoHeight || img.height;

function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
/** Draw an image filling a box, cropped from its middle */
function coverFit(ctx, img, x, y, w, h, zoom = 1, ox = 0, oy = 0) {
  const iw = imgW(img), ih = imgH(img), k = Math.max(w / iw, h / ih) * zoom, dw = iw * k, dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2 + ox, y + (h - dh) / 2 + oy, dw, dh);
}
/** The cover, square, with rounded corners and a soft shadow */
function art(ctx, img, cx, cy, size, { radius = 0.035, shadow = 0.55, scale = 1, rot = 0, glow = null, glowBlur = 0 } = {}) {
  const s = size * scale, r = s * radius;
  ctx.save();
  ctx.translate(cx, cy); if (rot) ctx.rotate(rot);
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = glowBlur; } else { ctx.shadowColor = `rgb(0 0 0 / ${shadow})`; ctx.shadowBlur = s * 0.09; ctx.shadowOffsetY = s * 0.035; }
  rr(ctx, -s / 2, -s / 2, s, s, r); ctx.fillStyle = "#000"; ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.clip(); coverFit(ctx, img, -s / 2, -s / 2, s, s);
  ctx.restore();
}
function setSpacing(ctx, px) { if ("letterSpacing" in ctx) ctx.letterSpacing = px + "px"; }
/** One line of text, shrunk to fit maxW (down to minPx), then cut with an ellipsis */
function fitLine(ctx, text, maxW, px, weight, minPx = px * 0.6, fam = SANS) {
  let size = px;
  ctx.font = font(weight, size, fam);
  while (size > minPx && ctx.measureText(text).width > maxW) { size -= 2; ctx.font = font(weight, size, fam); }
  let t = text;
  while (t.length > 1 && ctx.measureText(t).width > maxW) t = t.slice(0, -2) + "…";
  return { text: t, size };
}

// ---------- shared pieces ----------
/** A blurred, darkened copy of the cover filling the frame (made once per format, then reused) */
export function blurredBackdrop(scene) {
  const f = FORMATS[scene.fmt], key = scene.fmt + "|" + scene.coverId + "|" + scene.colors.bg;
  scene.cache ||= {};
  if (scene.cache.backdropKey === key) return scene.cache.backdrop;
  const c = mk(f.w / 6, f.h / 6), g = c.getContext("2d");
  g.fillStyle = scene.colors.bg; g.fillRect(0, 0, c.width, c.height);
  if (!scene.placeholder) {   // the stand-in cover has words on it, which blur into smudges
    g.filter = `blur(${Math.round(c.width / 22)}px) saturate(1.25)`;
    coverFit(g, scene.cover, -c.width * 0.15, -c.height * 0.15, c.width * 1.3, c.height * 1.3);
    g.filter = "none";
  } else {
    const r = g.createRadialGradient(c.width * 0.7, c.height * 0.25, 0, c.width * 0.7, c.height * 0.25, c.height * 0.8);
    r.addColorStop(0, "rgb(255 59 0 / 0.22)"); r.addColorStop(1, "rgb(255 59 0 / 0)");
    g.fillStyle = r; g.fillRect(0, 0, c.width, c.height);
  }
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, "rgb(8 6 5 / 0.35)"); grad.addColorStop(0.55, "rgb(8 6 5 / 0.5)"); grad.addColorStop(1, "rgb(8 6 5 / 0.82)");
  g.fillStyle = grad; g.fillRect(0, 0, c.width, c.height);
  scene.cache.backdropKey = key; scene.cache.backdrop = c;
  return c;
}
function backdrop(ctx, scene, W, H, zoom = 1, ox = 0, oy = 0) {
  const b = blurredBackdrop(scene);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(b, (W - W * zoom) / 2 + ox, (H - H * zoom) / 2 + oy, W * zoom, H * zoom);
}
function flatBackdrop(ctx, scene, W, H) {
  ctx.fillStyle = scene.colors.bg; ctx.fillRect(0, 0, W, H);
  const g = ctx.createRadialGradient(W * 0.3, H * 0.15, 0, W * 0.3, H * 0.15, Math.max(W, H) * 0.9);
  g.addColorStop(0, "rgb(255 255 255 / 0.07)"); g.addColorStop(1, "rgb(0 0 0 / 0.35)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
const scratch = new Float32Array(64);
/** Bars mirrored around a middle line, in the accent colour */
function bars(ctx, scene, t, x, y, w, h, n = 32) {
  const an = scene.an, v = an ? barsAt(an, t, scratch) : null, gap = w / n * 0.32, bw = w / n - gap;
  ctx.fillStyle = scene.colors.accent;
  for (let i = 0; i < n; i++) {
    const idle = 0.12 + 0.1 * Math.sin(t * 3 + i * 0.6);
    const raw = v ? v[Math.min(an.nb - 1, Math.floor(i * an.nb / n))] : idle;
    const a = Math.max(0.04, raw ** 1.6), bh = Math.max(bw, a * h);
    rr(ctx, x + i * (bw + gap) + gap / 2, y + (h - bh) / 2, bw, bh, bw / 2); ctx.fill();
  }
}
/** A strip of waveform around time t: played part in the accent, the rest faint, a playhead in the middle */
function waveStrip(ctx, scene, t, x, y, w, h, secs = 6) {
  const an = scene.an, step = 0.05, n = Math.floor(secs / step), bw = w / n;
  for (let i = 0; i < n; i++) {
    const tt = t - secs / 2 + i * step;
    let v = 0;
    if (an && tt >= 0 && tt < an.duration) { const a = Math.floor(tt * an.rate), b = Math.floor((tt + step) * an.rate); for (let k = a; k <= b && k < an.level.length; k++) v = Math.max(v, an.level[k]); v = v ** 1.6; }
    else if (!an) v = 0.25 + 0.2 * Math.sin(tt * 2.2 + Math.sin(tt * 7));
    const bh = Math.max(3, v * h);
    ctx.fillStyle = tt <= t ? scene.colors.accent : "rgb(242 239 232 / 0.32)";
    rr(ctx, x + i * bw + bw * 0.18, y + (h - bh) / 2, bw * 0.64, bh, bw * 0.3); ctx.fill();
  }
  ctx.fillStyle = PAPER; ctx.fillRect(x + w / 2 - 2, y - 10, 4, h + 20);
}
function pill(ctx, scene, text, cx, y, px, align = "center") {
  if (!text) return 0;
  ctx.font = font(800, px); setSpacing(ctx, px * 0.04);
  const tw = ctx.measureText(text.toUpperCase()).width, padX = px * 0.9, h = px * 2.1, w = tw + padX * 2;
  const x = align === "left" ? cx : cx - w / 2;
  ctx.fillStyle = scene.colors.accent; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = inkOn(scene.colors.accent); ctx.textBaseline = "middle"; ctx.textAlign = "center";
  ctx.fillText(text.toUpperCase(), x + w / 2, y + h / 2 + 1);
  setSpacing(ctx, 0);
  return h;
}
/** Title, artist, call to action and date as a block. Returns the height used (measure: true draws nothing) */
function titleBlock(ctx, scene, x, y, w, { align = "center", title = 64, measure = false, gap = 0.3 } = {}) {
  const s = scene.show, cx = align === "center" ? x + w / 2 : x;
  let h = 0;
  ctx.textAlign = align; ctx.textBaseline = "top";
  if (s.title && scene.title) {
    const f = fitLine(ctx, scene.title, w, title, 800);
    if (!measure) { ctx.font = font(800, f.size); ctx.fillStyle = PAPER; ctx.fillText(f.text, cx, y + h); }
    h += f.size * 1.12;
  }
  if (s.title && scene.artist) {
    const f = fitLine(ctx, scene.artist, w, title * 0.62, 600);
    if (!measure) { ctx.font = font(600, f.size); ctx.fillStyle = "rgb(242 239 232 / 0.78)"; ctx.textAlign = align; ctx.textBaseline = "top"; ctx.fillText(f.text, cx, y + h); }
    h += f.size * 1.3;
  }
  const cta = s.cta && scene.cta, date = s.date && scene.date;
  if (cta) { h += title * gap; if (!measure) pill(ctx, scene, scene.cta, align === "center" ? cx : x, y + h, title * 0.36, align); h += title * 0.36 * 2.1; }
  if (date) {
    h += title * 0.22;
    if (!measure) { ctx.font = font(700, title * 0.34, MONO); ctx.fillStyle = "rgb(242 239 232 / 0.85)"; ctx.textAlign = align; ctx.textBaseline = "top"; ctx.fillText(scene.date.toUpperCase(), cx, y + h); }
    h += title * 0.34 * 1.3;
  }
  return h;
}
/** The lyric line showing at time t, with a quick fade in when it changes */
function currentLyric(scene, t) {
  const L = scene.lyrics;
  if (!scene.show.lyrics || !L?.lines?.length) return null;
  const times = lineTimes(L.lines, L.timed, scene.clip), i = activeLine(times, t);
  if (i < 0) return null;
  const age = t - Math.max(times[i], scene.clip.start);
  return { text: L.lines[i], next: L.lines[i + 1] || "", age, i };
}
function lyricCaption(ctx, scene, t, cx, y, w, px, maxLines = 2, measure = false) {
  const cur = currentLyric(scene, t);
  if (!scene.show.lyrics || !scene.lyrics?.lines?.length) return 0;
  const h = px * 1.22 * maxLines;
  if (measure || !cur) return h;
  ctx.font = font(700, px); ctx.textAlign = "center"; ctx.textBaseline = "top";
  const lines = wrapWords(cur.text, w, (s) => ctx.measureText(s).width, maxLines), a = easeOut(cur.age / 0.25);
  ctx.globalAlpha = a; ctx.fillStyle = PAPER;
  ctx.shadowColor = "rgb(0 0 0 / 0.5)"; ctx.shadowBlur = px * 0.4;
  const top = y + (h - lines.length * px * 1.22) / 2 + (1 - a) * px * 0.3;
  lines.forEach((l, k) => ctx.fillText(l, cx, top + k * px * 1.22));
  ctx.shadowColor = "transparent"; ctx.globalAlpha = 1;
  return h;
}
function progressLine(ctx, scene, p, x, y, w, h = 6) {
  ctx.fillStyle = "rgb(242 239 232 / 0.18)"; rr(ctx, x, y, w, h, h / 2); ctx.fill();
  ctx.fillStyle = scene.colors.accent; rr(ctx, x, y, Math.max(h, w * Math.max(0, Math.min(1, p))), h, h / 2); ctx.fill();
}
/** Centre column of a vertical frame: centred on the frame, narrow enough to stay off the buttons */
function column(fmt) {
  const f = FORMATS[fmt], S = textSafe(fmt);
  if (fmt === "vertical" || fmt === "canvas") { const half = Math.min(f.w / 2 - S.x, S.x + S.w - f.w / 2); return { x: f.w / 2 - half, w: half * 2, y: S.y, h: S.h }; }
  return S;
}

// ---------- the looks ----------
function spotlight(ctx, scene, t, W, H) {
  backdrop(ctx, scene, W, H, 1.04 + 0.02 * Math.sin(t * 0.4));
  const thump = scene.an ? thumpAt(scene.an, t) : 0;
  if (scene.fmt === "landscape") {
    const S = textSafe("landscape"), size = Math.min(H - S.y * 2 - 40, 720), ax = S.x + 70 + size / 2;
    art(ctx, scene.cover, ax, H / 2, size, { scale: 1 + 0.022 * thump });
    const x = ax + size / 2 + 100, w = W - S.x - 60 - x;
    const tb = titleBlock(ctx, scene, x, 0, w, { align: "left", title: 86, measure: true });
    const lyr = lyricCaption(ctx, scene, t, 0, 0, w, 50, 2, true);
    const total = tb + 60 + 150 + (lyr ? lyr + 30 : 0);
    let y = (H - total) / 2;
    titleBlock(ctx, scene, x, y, w, { align: "left", title: 86 }); y += tb + 60;
    bars(ctx, scene, t, x, y, w, 150, 40); y += 150 + 30;
    if (lyr) lyricCaption(ctx, scene, t, x + w / 2, y, w, 50, 2);
    return;
  }
  const C = column(scene.fmt), sq = scene.fmt === "square";
  const tsize = sq ? 58 : 80, barH = sq ? 90 : 120, lpx = sq ? 40 : 54;
  const tb = titleBlock(ctx, scene, C.x, 0, C.w, { title: tsize, measure: true }), lyr = lyricCaption(ctx, scene, t, 0, 0, C.w, lpx, 2, true);
  const fixed = barH + tb + (lyr ? lyr + 24 : 0) + 40 + 34;
  const size = Math.max(sq ? 300 : 420, Math.min(C.w * (sq ? 0.62 : 0.9), C.h - fixed));
  const total = size + fixed;
  let y = C.y + Math.max(0, (C.h - total) / 2);
  art(ctx, scene.cover, W / 2, y + size / 2, size, { scale: 1 + 0.022 * thump }); y += size + 40;
  bars(ctx, scene, t, W / 2 - size / 2, y, size, barH); y += barH + 34;
  if (lyr) { lyricCaption(ctx, scene, t, W / 2, y, C.w, lpx, 2); y += lyr + 24; }
  titleBlock(ctx, scene, C.x, y, C.w, { title: tsize });
}

function bigLyrics(ctx, scene, t, W, H) {
  backdrop(ctx, scene, W, H, 1.1 + 0.03 * Math.sin(t * 0.3), Math.sin(t * 0.2) * W * 0.02);
  ctx.fillStyle = "rgb(8 6 5 / 0.28)"; ctx.fillRect(0, 0, W, H);
  const land = scene.fmt === "landscape", sq = scene.fmt === "square";
  const C = land || sq ? textSafe(scene.fmt) : column(scene.fmt);
  const s = scene.show;
  // top: small cover with title and artist
  const thumb = land ? 150 : sq ? 130 : 150;
  let topH = 0;
  if (s.title && (scene.title || scene.artist)) {
    art(ctx, scene.cover, C.x + thumb / 2, C.y + thumb / 2, thumb, { radius: 0.06, shadow: 0.4 });
    const x = C.x + thumb + 28, w = C.x + C.w - x;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    const f1 = fitLine(ctx, scene.title || scene.artist, w, land ? 52 : 46, 800);
    ctx.font = font(800, f1.size); ctx.fillStyle = PAPER; ctx.fillText(f1.text, x, C.y + thumb / 2 - f1.size * 1.05);
    if (scene.title && scene.artist) { const f2 = fitLine(ctx, scene.artist, w, land ? 36 : 32, 600); ctx.font = font(600, f2.size); ctx.fillStyle = "rgb(242 239 232 / 0.75)"; ctx.fillText(f2.text, x, C.y + thumb / 2 + 6); }
    topH = thumb;
  }
  // bottom: call to action, date, progress
  const p = (t - scene.clip.start) / Math.max(0.1, scene.clip.end - scene.clip.start);
  const bottom = C.y + C.h;
  progressLine(ctx, scene, p, C.x, bottom - 8, C.w, 8);
  let bh = 8 + 28;
  const ctaPx = land ? 30 : 32;
  if (s.cta && scene.cta) { pill(ctx, scene, scene.cta, land ? C.x : W / 2, bottom - bh - ctaPx * 2.1, ctaPx, land ? "left" : "center"); bh += ctaPx * 2.1 + 20; }
  if (s.date && scene.date) { ctx.font = font(700, 30, MONO); ctx.fillStyle = "rgb(242 239 232 / 0.85)"; ctx.textAlign = land ? "right" : "center"; ctx.textBaseline = "alphabetic"; ctx.fillText(scene.date.toUpperCase(), land ? C.x + C.w : W / 2, land ? bottom - 44 : bottom - bh - 6); if (!land) bh += 50; }
  // middle: the words
  const midTop = C.y + topH + 40, midH = bottom - bh - 40 - midTop, cx = C.x + C.w / 2;
  const cur = currentLyric(scene, t);
  const px = land ? 92 : sq ? 76 : 96;
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  if (cur) {
    ctx.font = font(800, px);
    const lines = wrapWords(cur.text, C.w, (x) => ctx.measureText(x).width, 4), a = easeOut(cur.age / 0.3);
    const lh = px * 1.12, block = lines.length * lh;
    const nextPx = px * 0.5;
    let y = midTop + (midH - block - (cur.next ? nextPx * 2 : 0)) / 2 + (1 - a) * px * 0.4;
    ctx.globalAlpha = a; ctx.fillStyle = PAPER; ctx.shadowColor = "rgb(0 0 0 / 0.45)"; ctx.shadowBlur = px * 0.35;
    lines.forEach((l, k) => ctx.fillText(l, cx, y + k * lh));
    ctx.shadowColor = "transparent";
    // the accent underline grows through the line
    const L = scene.lyrics, times = lineTimes(L.lines, L.timed, scene.clip);
    const end = Number.isFinite(times[cur.i + 1]) ? times[cur.i + 1] : scene.clip.end, lp = (t - Math.max(times[cur.i], scene.clip.start)) / Math.max(0.2, end - Math.max(times[cur.i], scene.clip.start));
    ctx.fillStyle = scene.colors.accent; rr(ctx, cx - 60, y + block + 14, 120 * Math.max(0.05, Math.min(1, lp)), 8, 4); ctx.fill();
    ctx.globalAlpha = 1;
    if (cur.next) {
      ctx.font = font(700, nextPx); ctx.fillStyle = "rgb(242 239 232 / 0.42)";
      const nl = wrapWords(cur.next, C.w, (x) => ctx.measureText(x).width, 1)[0];
      ctx.fillText(nl, cx, y + block + 46);
    }
  } else if (!scene.lyrics?.lines?.length || !s.lyrics) {
    // no words: the title takes the middle
    const f = fitLine(ctx, scene.title || "Your song", C.w, px * 1.1, 800);
    ctx.font = font(800, f.size); ctx.fillStyle = PAPER; ctx.fillText(f.text, cx, midTop + midH / 2 - f.size * 0.6);
    bars(ctx, scene, t, cx - C.w * 0.35, midTop + midH / 2 + f.size * 0.7, C.w * 0.7, 90, 28);
  }
}

function audiogram(ctx, scene, t, W, H) {
  flatBackdrop(ctx, scene, W, H);
  const thump = scene.an ? thumpAt(scene.an, t) : 0;
  if (scene.fmt === "landscape") {
    const S = textSafe("landscape"), size = 620, ax = S.x + 60 + size / 2;
    art(ctx, scene.cover, ax, H / 2, size, { radius: 0.04, scale: 1 + 0.012 * thump });
    const x = ax + size / 2 + 90, w = W - S.x - 40 - x;
    const tb = titleBlock(ctx, scene, x, 0, w, { align: "left", title: 80, measure: true }), lyr = lyricCaption(ctx, scene, t, 0, 0, w, 46, 2, true);
    const total = tb + 50 + 200 + (lyr ? lyr + 20 : 0);
    let y = (H - total) / 2;
    titleBlock(ctx, scene, x, y, w, { align: "left", title: 80 }); y += tb + 50;
    waveStrip(ctx, scene, t, x, y, w, 200); y += 220;
    if (lyr) lyricCaption(ctx, scene, t, x + w / 2, y, w, 46, 2);
    return;
  }
  const C = column(scene.fmt), sq = scene.fmt === "square";
  const waveH = sq ? 150 : 220, tsize = sq ? 56 : 78, lpx = sq ? 38 : 52;
  const tb = titleBlock(ctx, scene, C.x, 0, C.w, { title: tsize, measure: true }), lyr = lyricCaption(ctx, scene, t, 0, 0, C.w, lpx, 2, true);
  const fixed = 36 + tb + 40 + waveH + (lyr ? lyr + 20 : 0);
  const size = Math.max(sq ? 260 : 400, Math.min(C.w * (sq ? 0.5 : 0.82), C.h - fixed));
  let y = C.y + Math.max(0, (C.h - size - fixed) / 2);
  art(ctx, scene.cover, W / 2, y + size / 2, size, { radius: 0.04, scale: 1 + 0.012 * thump }); y += size + 36;
  titleBlock(ctx, scene, C.x, y, C.w, { title: tsize }); y += tb + 40;
  waveStrip(ctx, scene, t, sq ? C.x : 0, y, sq ? C.w : W, waveH, sq ? 5 : 6); y += waveH + 20;
  if (lyr) lyricCaption(ctx, scene, t, W / 2, y, C.w, lpx, 2);
}

function titleCard(ctx, scene, t, W, H) {
  ctx.fillStyle = scene.colors.bg; ctx.fillRect(0, 0, W, H);
  // one big soft block of the accent drifting behind
  const g = ctx.createRadialGradient(W * 0.85, H * 0.2, 0, W * 0.85, H * 0.2, Math.max(W, H) * 0.7);
  g.addColorStop(0, hexA(scene.colors.accent, 0.28 + 0.06 * Math.sin(t * 0.8))); g.addColorStop(1, hexA(scene.colors.accent, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const land = scene.fmt === "landscape", sq = scene.fmt === "square", S = textSafe(scene.fmt);
  const lt = t - scene.clip.start, s = scene.show;
  const appear = (delay) => easeOut((lt - delay) / 0.7);
  const thumb = land ? 380 : sq ? 300 : 360;
  const x = S.x + (land ? 20 : 10), w = land ? S.w - thumb - 120 : S.w - 20;
  // cover in the corner
  ctx.globalAlpha = appear(0);
  art(ctx, scene.cover, land ? S.x + S.w - thumb / 2 - 10 : x + thumb / 2, land ? H / 2 : S.y + thumb / 2 + 10, thumb, { radius: 0.03, shadow: 0.45 });
  ctx.globalAlpha = 1;
  // title, huge, left aligned, with the ENCORE. square after it
  const px = land ? 130 : sq ? 108 : 132;
  ctx.font = font(800, px); setSpacing(ctx, -px * 0.02);
  const lines = wrapWords(scene.title || "Your song", w - px * 0.5, (q) => ctx.measureText(q).width, 3), lh = px * 1.0;
  const artistPx = px * 0.42, block = lines.length * lh + artistPx * 1.6 + (s.lyrics && currentLyric(scene, t) ? 110 : 0);
  let y = land ? (H - block) / 2 : S.y + thumb + 70 + Math.max(0, (S.h - thumb - 70 - block - 180) / 2);
  ctx.textAlign = "left"; ctx.textBaseline = "top";
  lines.forEach((l, k) => {
    const a = appear(0.12 + k * 0.1);
    const ly = y + k * lh + (1 - a) * 40;
    ctx.globalAlpha = a; ctx.fillStyle = PAPER; ctx.fillText(l, x, ly);
    if (k === lines.length - 1) { const ew = ctx.measureText(l).width; ctx.fillStyle = scene.colors.accent; ctx.fillRect(x + ew + px * 0.1, ly + px * 0.56, px * 0.2, px * 0.2); }
  });
  setSpacing(ctx, 0); ctx.globalAlpha = 1;
  y += lines.length * lh + 18;
  if (scene.artist && s.title) { const a = appear(0.4); ctx.globalAlpha = a; const f = fitLine(ctx, scene.artist, w, artistPx, 700); ctx.font = font(700, f.size); ctx.fillStyle = scene.colors.accent; ctx.fillText(f.text, x, y); y += artistPx * 1.6; ctx.globalAlpha = 1; }
  const cur = currentLyric(scene, t);
  if (cur) {
    ctx.font = font(600, land ? 44 : 46); ctx.fillStyle = "rgb(242 239 232 / 0.85)"; ctx.globalAlpha = easeOut(cur.age / 0.25);
    wrapWords("“" + cur.text + "”", w, (q) => ctx.measureText(q).width, 2).forEach((l, k) => ctx.fillText(l, x, y + 10 + k * 54));
    ctx.globalAlpha = 1;
  }
  // bottom: CTA and date in mono, progress line
  const bottom = S.y + S.h;
  const p = lt / Math.max(0.1, scene.clip.end - scene.clip.start);
  progressLine(ctx, scene, p, x, bottom - 6, land ? S.w - 20 : w, 6);
  let by = bottom - 40;
  if (s.date && scene.date) { ctx.font = font(700, 32, MONO); ctx.fillStyle = "rgb(242 239 232 / 0.8)"; ctx.textBaseline = "alphabetic"; ctx.fillText(scene.date.toUpperCase(), x, by); by -= 60; }
  if (s.cta && scene.cta) { ctx.globalAlpha = appear(0.6); pill(ctx, scene, scene.cta, x, by - 70, 33, "left"); ctx.globalAlpha = 1; }
}

// ---------- Spotify Canvas: silent loops, no text unless asked ----------
function canvasText(ctx, scene, W) {
  if (!scene.canvasText || !(scene.title || scene.artist)) return;
  const C = column("canvas");
  ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.shadowColor = "rgb(0 0 0 / 0.6)"; ctx.shadowBlur = 24;
  const f = fitLine(ctx, scene.title || scene.artist, C.w, 60, 800); ctx.font = font(800, f.size); ctx.fillStyle = PAPER; ctx.fillText(f.text, W / 2, C.y);
  if (scene.title && scene.artist) { const g = fitLine(ctx, scene.artist, C.w, 40, 600); ctx.font = font(600, g.size); ctx.fillStyle = "rgb(242 239 232 / 0.85)"; ctx.fillText(g.text, W / 2, C.y + f.size * 1.2); }
  ctx.shadowColor = "transparent";
}
function vignette(ctx, W, H, a = 0.55) {
  const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
  g.addColorStop(0, "rgb(0 0 0 / 0)"); g.addColorStop(1, `rgb(0 0 0 / ${a})`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}
function drift(ctx, scene, t, W, H) {
  const T = scene.canvasLen, a = TAU * t / T;
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
  coverFit(ctx, scene.cover, 0, 0, W, H, 1.1 + 0.07 * loopWave(t, T), Math.sin(a) * W * 0.035, Math.cos(a) * H * 0.018);
  vignette(ctx, W, H, 0.45);
  canvasText(ctx, scene, W);
}
function float(ctx, scene, t, W, H) {
  const T = scene.canvasLen, a = TAU * t / T;
  backdrop(ctx, scene, W, H, 1.12 + 0.04 * loopWave(t, T), Math.sin(a) * 30, 0);
  const size = W * 0.78;
  art(ctx, scene.cover, W / 2, H * 0.46 + Math.sin(a) * 26, size, { radius: 0.03, shadow: 0.6, rot: Math.sin(a + 1) * 0.012, scale: 1 + 0.015 * Math.cos(a) });
  canvasText(ctx, scene, W);
}
function pulse(ctx, scene, t, W, H) {
  const T = scene.canvasLen, beats = Math.max(2, Math.round(T));   // about one pulse a second, a whole number per loop
  flatBackdrop(ctx, scene, W, H);
  const ph = (t / T * beats) % 1, k = Math.exp(-ph * 4);
  const cx = W / 2, cy = H * 0.46, size = W * 0.72;
  // rings going out from the cover, in step with the loop
  for (let r = 0; r < 3; r++) {
    const q = ((t / T * beats / 2) + r / 3) % 1;
    ctx.strokeStyle = hexA(scene.colors.accent, 0.35 * (1 - q)); ctx.lineWidth = 6;
    const s = size * (1.02 + q * 0.55);
    rr(ctx, cx - s / 2, cy - s / 2, s, s, s * 0.06); ctx.stroke();
  }
  art(ctx, scene.cover, cx, cy, size, { radius: 0.035, scale: 1 + 0.03 * k, glow: hexA(scene.colors.accent, 0.55 + 0.35 * k), glowBlur: 60 + 70 * k });
  canvasText(ctx, scene, W);
}
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgb(${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255} / ${Math.max(0, Math.min(1, a)).toFixed(3)})`; }

const LOOK_FN = { spotlight, lyrics: bigLyrics, wave: audiogram, card: titleCard, drift, float, pulse };

/**
 * Paint one frame. ctx is already scaled so the format's pixels map onto the canvas.
 * t: song seconds for videos, seconds into the loop for a Canvas.
 */
export function drawFrame(ctx, scene, t) {
  const f = FORMATS[scene.fmt], W = f.w, H = f.h, look = scene.fmt === "canvas" ? scene.canvasLook : scene.look;
  ctx.save();
  ctx.textAlign = "left"; ctx.textBaseline = "top"; ctx.globalAlpha = 1; ctx.filter = "none";
  (LOOK_FN[look] || spotlight)(ctx, scene, t, W, H);
  ctx.restore();
}

/** Cover art stand-in when there's none yet: dark, with the ENCORE. square */
export function placeholderCover(title = "", accent = "#ff3b00") {
  const c = mk(1000, 1000), g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 1000, 1000);
  grad.addColorStop(0, "#2c2723"); grad.addColorStop(1, "#0c0a09");
  g.fillStyle = grad; g.fillRect(0, 0, 1000, 1000);
  g.fillStyle = accent; g.fillRect(760, 760, 140, 140);
  g.fillStyle = PAPER; g.font = font(800, 120); g.textBaseline = "top";
  const lines = wrapWords(title || "Your cover here", 760, (s) => g.measureText(s).width, 4);
  lines.forEach((l, i) => g.fillText(l, 100, 100 + i * 128));
  return c;
}
export { hslHex };
