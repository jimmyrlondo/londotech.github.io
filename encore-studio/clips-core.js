// ENCORE. Clips: the plain logic (no page, no DOM). Finding the hook in a song,
// the bars and waveform the videos move to, lyric lines and their timing, the
// video formats and where TikTok, Reels and Shorts put their buttons, colours
// from the cover art, and file names. Tested by test-clips.mjs.

// ---------- formats ----------
export const FORMATS = {
  vertical: { id: "vertical", label: "Vertical", where: "TikTok, Reels, Shorts", w: 1080, h: 1920, audio: true, safe: true, file: "Vertical 9x16" },
  square: { id: "square", label: "Square", where: "Instagram and Facebook feed", w: 1080, h: 1080, audio: true, safe: false, file: "Square" },
  landscape: { id: "landscape", label: "Landscape", where: "YouTube, X", w: 1920, h: 1080, audio: true, safe: false, file: "Landscape 16x9" },
  canvas: { id: "canvas", label: "Canvas", where: "Spotify Canvas (silent loop)", w: 1080, h: 1920, audio: false, safe: false, loop: true, file: "Spotify Canvas" },
};
export const FORMAT_ORDER = ["vertical", "square", "landscape", "canvas"];
export const CLIP_LENGTHS = [15, 30, 60];
export const CANVAS_MIN = 3, CANVAS_MAX = 8;   // Spotify asks for 3 to 8 seconds
export const MIN_CLIP = 3, MAX_CLIP = 60;

export const LOOKS = {
  spotlight: { id: "spotlight", label: "Spotlight", about: "Your cover big, bars that move to the music", canvas: false },
  lyrics: { id: "lyrics", label: "Big lyrics", about: "The words in time, large and easy to read", canvas: false },
  wave: { id: "wave", label: "Waveform", about: "A classic audiogram: cover, title and a moving waveform", canvas: false },
  card: { id: "card", label: "Title card", about: "Clean type on your cover's colour", canvas: false },
  drift: { id: "drift", label: "Drift", about: "Your cover fills the screen with a slow zoom and pan", canvas: true },
  float: { id: "float", label: "Float", about: "Your cover floats over a soft blur of itself", canvas: true },
  pulse: { id: "pulse", label: "Pulse", about: "Your cover breathes with a soft glow", canvas: true },
};
export const looksFor = (fmtId) => Object.values(LOOKS).filter((l) => l.canvas === (fmtId === "canvas"));

export const CTAS = ["", "Out now", "Pre-save now", "New single Friday", "Listen now, link in bio", "Stream it everywhere"];

/**
 * Where the apps' own buttons and captions sit on a 1080x1920 vertical video
 * (a bit generous, so text kept out of these areas is clear on all three).
 */
export const SAFE_ZONES = {
  tiktok: { label: "TikTok", top: 160, bottom: 470, right: 150, rightFrom: 760, rightTo: 1450 },
  reels: { label: "Reels", top: 220, bottom: 440, right: 140, rightFrom: 900, rightTo: 1480 },
  shorts: { label: "Shorts", top: 200, bottom: 400, right: 150, rightFrom: 820, rightTo: 1500 },
};
/** The covered areas as rectangles (x, y, w, h, label), for the preview overlay */
export function safeRects(which = "all", W = 1080, H = 1920) {
  const zs = which === "all" ? Object.values(SAFE_ZONES) : [SAFE_ZONES[which]];
  const top = Math.max(...zs.map((z) => z.top)), bottom = Math.max(...zs.map((z) => z.bottom)), right = Math.max(...zs.map((z) => z.right));
  const from = Math.min(...zs.map((z) => z.rightFrom)), to = Math.max(...zs.map((z) => z.rightTo));
  const k = H / 1920, kx = W / 1080;
  return [
    { x: 0, y: 0, w: W, h: top * k, label: "Top bar" },
    { x: 0, y: H - bottom * k, w: W, h: bottom * k, label: "Caption, name and sound" },
    { x: W - right * kx, y: from * k, w: right * kx, h: Math.min(to, 1920 - bottom) * k - from * k, label: "Like, comment, share" },
  ];
}
/** The area text should stay inside, per format (in that format's pixels) */
export function textSafe(fmtId) {
  const f = FORMATS[fmtId] || FORMATS.vertical;
  if (fmtId === "vertical") return { x: 80, y: 250, w: 1080 - 80 - 170, h: 1920 - 250 - 480 };
  if (fmtId === "canvas") return { x: 90, y: 300, w: 900, h: 1920 - 300 - 520 };   // Spotify's own title and buttons sit at the bottom
  const m = Math.round(Math.min(f.w, f.h) * 0.07);
  return { x: m, y: m, w: f.w - 2 * m, h: f.h - 2 * m };
}

// ---------- file names ----------
const clean = (s) => String(s || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
/** "<Artist> - <Title> (<format>).mp4" */
export function fileName(artist, title, fmtId, ext = "mp4") {
  const a = clean(artist), t = clean(title), f = (FORMATS[fmtId] || { file: fmtId }).file;
  const base = a && t ? `${a} - ${t}` : t || a || "My clip";
  return `${base.slice(0, 150)} (${f}).${ext}`;
}

// ---------- time ----------
export function formatTime(s, tenths = false) {
  if (!Number.isFinite(s)) return "0:00";
  s = Math.max(0, s);
  const m = Math.floor(s / 60), r = s - m * 60;
  return tenths ? `${m}:${r < 10 ? "0" : ""}${r.toFixed(1)}` : `${m}:${String(Math.floor(r)).padStart(2, "0")}`;
}
/** "1:02.5", "62.5" or "1:02" to seconds (NaN when it can't be read) */
export function parseTime(text) {
  const t = String(text ?? "").trim();
  if (!t) return NaN;
  const m = t.match(/^(?:(\d+):)?(\d+(?:\.\d*)?)$/);
  if (!m) return NaN;
  const sec = parseFloat(m[2]);
  if (m[1] !== undefined && sec >= 60) return NaN;
  return (m[1] ? parseInt(m[1], 10) * 60 : 0) + sec;
}
/** Keep a clip inside the song, with a length between MIN and MAX */
export function clampClip(start, len, duration, min = MIN_CLIP, max = MAX_CLIP) {
  len = Math.min(Math.max(len, min), max, Math.max(duration, 0.01));
  start = Math.min(Math.max(0, start), Math.max(0, duration - len));
  return { start, end: start + len, len };
}
/** Volume at time t (seconds into a clip of length len): short fades at both ends */
export function fadeGain(t, len, fadeIn = 0.2, fadeOut = 0.9) {
  if (t <= 0 || t >= len) return 0;
  const fo = Math.min(fadeOut, len / 3), fi = Math.min(fadeIn, len / 4);
  const a = fi > 0 ? Math.min(1, t / fi) : 1, b = fo > 0 ? Math.min(1, (len - t) / fo) : 1;
  return Math.min(a, b) ** 2;
}

// ---------- lyrics ----------
const CHORD_RE = /\[(?:[A-G][#b♭♯]?(?:maj|min|dim|aug|sus|add|m|M|\d|\+|-|\(|\)|b|#|°|ø)*(?:\/[A-G][#b]?)?|N\.?C\.?)\]/g;
/** Section names like [Chorus] or (Verse 2) on their own line */
const SECTION_RE = /^\s*(?:\[[^\]]*\]|\((?:intro|verse|chorus|pre-?chorus|bridge|hook|outro|refrain|tag|interlude|instrumental)[^)]*\)|(?:intro|verse|chorus|pre-?chorus|bridge|hook|outro|refrain)(?:\s*\d+)?\s*:)\s*$/i;
/** Lines to show, from pasted lyrics or a Songbook song: chords like [G] and section names taken out */
export function lyricLines(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split("\n")
    .filter((l) => !/^\s*\{[^}]*\}\s*$/.test(l))
    .map((l) => l.replace(CHORD_RE, ""))
    .filter((l) => !SECTION_RE.test(l))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}
/** A song's words split into its parts (for picking which part goes on the clip) */
export function songParts(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text || "").replace(/\r\n?/g, "\n").split("\n")) {
    if (/^\s*\{[^}]*\}\s*$/.test(raw)) {
      const c = raw.match(/^\s*\{\s*(?:c|comment|start_of_chorus|soc)\s*:?\s*([^}]*)\}/i);
      if (c && /chorus|verse|bridge|hook|intro|outro/i.test(c[1] || "chorus")) { cur = { name: (c[1] || "Chorus").trim() || "Chorus", lines: [] }; out.push(cur); }
      continue;
    }
    const sec = raw.match(/^\s*\[([^\]]+)\]\s*$/);
    if (sec && !new RegExp("^" + CHORD_RE.source + "$").test(raw.trim())) { cur = { name: sec[1].trim(), lines: [] }; out.push(cur); continue; }
    const line = lyricLines(raw)[0];
    if (!line) continue;
    if (!cur) { cur = { name: "Words", lines: [] }; out.push(cur); }
    cur.lines.push(line);
  }
  return out.filter((p) => p.lines.length);
}
/** Without timing: lines spread evenly over the clip */
export function evenTimes(n, start, end) {
  const step = (end - start) / Math.max(1, n);
  return Array.from({ length: n }, (_, i) => +(start + i * step).toFixed(3));
}
/** Which line is showing at time t (-1 for none). times are song seconds; a line shows until the next starts. */
export function activeLine(times, t) {
  let k = -1;
  for (let i = 0; i < times.length; i++) if (Number.isFinite(times[i]) && times[i] <= t + 1e-6 && (k < 0 || times[i] >= times[k])) k = i;
  return k;
}
/** The times to use: tapped/typed ones when the artist has timed it, otherwise spread over the clip */
export function lineTimes(lines, timed, clip) {
  if (timed && timed.length === lines.length && timed.some(Number.isFinite)) return timed.map((t) => (Number.isFinite(t) ? t : NaN));
  return evenTimes(lines.length, clip.start, clip.end);
}
/** Break text into lines no wider than maxW, using measure(text) for widths */
export function wrapWords(text, maxW, measure, maxLines = 4) {
  const words = String(text || "").split(/\s+/).filter(Boolean), out = [];
  let line = "";
  for (const w of words) {
    const next = line ? line + " " + w : w;
    if (!line || measure(next) <= maxW) line = next;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  if (out.length > maxLines) { const kept = out.slice(0, maxLines); kept[maxLines - 1] += "…"; return kept; }
  return out;
}

// ---------- colours from the cover ----------
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslHex(h, s, l) {
  const f = (n) => { const k = (n + h / 30) % 12, a = s * Math.min(l, 1 - l); return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))).toString(16).padStart(2, "0"); };
  return "#" + f(0) + f(8) + f(4);
}
export function luminance(hex) {
  const n = parseInt(String(hex).slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
/** Black or white text on a colour */
export const inkOn = (hex) => (luminance(hex) > 0.36 ? "#0c0a09" : "#ffffff");
/**
 * Colours for a video from the cover's pixels (RGBA bytes): an accent that pops on dark,
 * a dark background in the cover's main colour, and a few swatches to choose from.
 */
export function paletteFrom(rgba) {
  const bins = Array.from({ length: 12 }, () => ({ n: 0, w: 0, h: 0, s: 0, l: 0 }));
  let grey = 0, total = 0, lsum = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 128) continue;
    const [h, s, l] = rgbToHsl(rgba[i], rgba[i + 1], rgba[i + 2]);
    total++; lsum += l;
    if (s < 0.18 || l < 0.08 || l > 0.94) { grey++; continue; }
    const b = bins[Math.floor(h / 30) % 12], wt = s * (1 - Math.abs(l - 0.5));
    b.n++; b.w += wt; b.h += h; b.s += s; b.l += l;
  }
  const colourful = bins.filter((b) => b.n > total * 0.015).map((b) => ({ n: b.n, w: b.w, h: b.h / b.n, s: b.s / b.n, l: b.l / b.n }));
  const byCount = [...colourful].sort((a, b) => b.n - a.n), main = byCount[0];
  // the accent: saturated, and the further its hue from the main colour the better (it should pop)
  const hueGap = (c) => (main ? Math.min(Math.abs(c.h - main.h), 360 - Math.abs(c.h - main.h)) / 180 : 0);
  const popScore = (c) => c.w * c.s * c.s * (1 + 2 * hueGap(c));
  const byPop = [...colourful].sort((a, b) => popScore(b) - popScore(a)), pop = byPop[0];
  const accentOf = (c) => hslHex(c.h, Math.max(0.62, Math.min(0.95, c.s)), 0.58);
  const accent = pop ? accentOf(pop) : "#ff3b00";
  const bg = main && main.n > total * 0.12 ? hslHex(main.h, Math.min(0.45, main.s), 0.11) : "#14110f";
  const swatches = [...new Set([accent, ...byPop.slice(1, 5).map(accentOf)])].slice(0, 5);
  return { accent, bg, swatches, bright: total ? lsum / total : 0.5, colourful: colourful.length > 0 && grey < total * 0.85 };
}

// ---------- the song's numbers: hook finding, bars, waveform ----------
/** In-place radix-2 FFT (re, im: Float32Array of a power-of-two length) */
export function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
}
const hannCache = new Map();
const hann = (n) => { if (!hannCache.has(n)) { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1)); hannCache.set(n, w); } return hannCache.get(n); };

/** All channels to one, at about 11 kHz (plenty for finding a hook and drawing bars) */
export function mixDown(chans, fs, target = 11025) {
  const k = Math.max(1, Math.round(fs / target)), n = Math.floor(chans[0].length / k), out = new Float32Array(n), nc = chans.length;
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let c = 0; c < nc; c++) { const ch = chans[c]; for (let j = i * k, e = j + k; j < e; j++) s += ch[j]; }
    out[i] = s / (k * nc);
  }
  return { mono: out, fs: fs / k };
}
/**
 * The waveform, rate times a second: the loudest sample (peaks) and a loudness level
 * scaled so the song's loudest moment is 1 (level: shows the shape even of a loud master)
 */
export function peaksOf(mono, fs, rate = 50) {
  const step = fs / rate, n = Math.ceil(mono.length / step), out = new Float32Array(n), level = new Float32Array(n);
  let top = 1e-9;
  for (let i = 0; i < n; i++) {
    let m = 0, s = 0, c = 0;
    for (let j = Math.floor(i * step), e = Math.min(mono.length, Math.floor((i + 1) * step)); j < e; j++) { const v = Math.abs(mono[j]); if (v > m) m = v; s += v * v; c++; }
    out[i] = m; level[i] = c ? Math.sqrt(s / c) : 0; if (level[i] > top) top = level[i];
  }
  // in decibels over a 36 dB range, so quiet verses and loud choruses both show
  for (let i = 0; i < n; i++) level[i] = Math.max(0, 1 + (20 * Math.log10(level[i] / top + 1e-9)) / 36);
  return { peaks: out, level, rate };
}
/** Bar heights (0..255) for `nb` bands, `fps` times a second, from 50 Hz to about 5 kHz */
export function bandsOf(mono, fs, fps = 30, nb = 32) {
  const N = 1024, w = hann(N), frames = Math.max(1, Math.ceil(mono.length / fs * fps)), out = new Uint8Array(frames * nb);
  const re = new Float32Array(N), im = new Float32Array(N), lo = 50, hi = Math.min(5000, fs / 2 * 0.95);
  const edges = Array.from({ length: nb + 1 }, (_, i) => Math.max(1, Math.round(lo * (hi / lo) ** (i / nb) / fs * N)));
  const db = new Float32Array(frames * nb);
  let top = -200;
  for (let f = 0; f < frames; f++) {
    const c = Math.round(f / fps * fs) - N / 2;
    for (let i = 0; i < N; i++) { const j = c + i; re[i] = j >= 0 && j < mono.length ? mono[j] * w[i] : 0; im[i] = 0; }
    fft(re, im);
    for (let b = 0; b < nb; b++) {
      let s = 0; const a = edges[b], e = Math.max(a + 1, edges[b + 1]);
      for (let k = a; k < e; k++) s += re[k] * re[k] + im[k] * im[k];
      const v = 10 * Math.log10(s / (e - a) + 1e-12) + b * 0.35;   // a little lift for the highs, like a real meter
      db[f * nb + b] = v; if (v > top) top = v;
    }
  }
  const floor = top - 54;
  for (let i = 0; i < db.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((db[i] - floor) / (top - floor) * 255)));
  return { bands: out, fps, nb, frames };
}

const pct = (arr) => {   // each value as its rank in the song, 0..1
  const idx = Array.from(arr, (_, i) => i).sort((a, b) => arr[a] - arr[b]), out = new Float32Array(arr.length);
  idx.forEach((i, r) => { out[i] = arr.length > 1 ? r / (arr.length - 1) : 0.5; });
  return out;
};
/**
 * Loudness and harmony (chroma: how much of each of the 12 notes) every hop, plus
 * how often each moment comes back later or earlier in the song (from a chroma
 * self-similarity matrix smoothed along its diagonals).
 */
export function analyzeHooks(mono, fs) {
  const duration = mono.length / fs, N = 4096;
  let hop = 2048;
  while (mono.length / hop > 1500) hop *= 2;   // long songs: fewer, wider steps
  const nF = Math.max(1, Math.floor((mono.length - N) / hop) + 1), w = hann(N);
  const re = new Float32Array(N), im = new Float32Array(N), energy = new Float32Array(nF), chroma = new Float32Array(nF * 12);
  const pcOfBin = new Int8Array(N / 2).fill(-1);
  for (let k = 1; k < N / 2; k++) { const f = k * fs / N; if (f >= 60 && f <= 2100) pcOfBin[k] = ((Math.round(12 * Math.log2(f / 440)) % 12) + 12 + 9) % 12; }
  for (let f = 0; f < nF; f++) {
    const o = f * hop; let e = 0;
    for (let i = 0; i < N; i++) { const v = mono[o + i] || 0; e += v * v; re[i] = v * w[i]; im[i] = 0; }
    energy[f] = 10 * Math.log10(e / N + 1e-10);
    fft(re, im);
    const c = chroma.subarray(f * 12, f * 12 + 12);
    for (let k = 1; k < N / 2; k++) if (pcOfBin[k] >= 0) c[pcOfBin[k]] += Math.sqrt(re[k] * re[k] + im[k] * im[k]);
  }
  // smooth the harmony a little over time, then make each frame's notes a unit vector
  const sm = new Float32Array(nF * 12);
  for (let f = 0; f < nF; f++) for (let p = 0; p < 12; p++) { let s = 0, n = 0; for (let d = -2; d <= 2; d++) { const g = f + d; if (g >= 0 && g < nF) { s += chroma[g * 12 + p]; n++; } } sm[f * 12 + p] = s / n; }
  const quiet = Math.max(...energy) - 45;
  for (let f = 0; f < nF; f++) {
    let n = 0; for (let p = 0; p < 12; p++) n += sm[f * 12 + p] ** 2;
    n = Math.sqrt(n);
    for (let p = 0; p < 12; p++) sm[f * 12 + p] = n > 0 && energy[f] > quiet ? sm[f * 12 + p] / n : 0;
  }
  const hopS = hop / fs, W = Math.max(4, Math.round(6 / hopS)), minLag = W;
  // diagonal-smoothed similarity: D[i][j] = how alike the 6 s starting at i and at j are
  const S = (i, j) => { let s = 0; for (let p = 0; p < 12; p++) s += sm[i * 12 + p] * sm[j * 12 + p]; return s; };
  const D = new Float32Array(nF * nF);
  for (let lag = minLag; lag < nF; lag++) {
    let run = 0;
    const len = nF - lag;
    const vals = new Float32Array(len);
    for (let i = 0; i < len; i++) vals[i] = S(i, i + lag);
    for (let i = 0; i < len; i++) {
      run += vals[i];
      if (i >= W) run -= vals[i - W];
      const start = i - W + 1;
      if (start >= 0) { const v = run / W; D[start * nF + start + lag] = v; D[(start + lag) * nF + start] = v; }
    }
  }
  // how strongly each start comes back: the best match plus the next best somewhere else
  const rep = new Float32Array(nF), repeats = new Uint8Array(nF);
  let all = [];
  for (let i = 0; i < nF; i += 3) for (let j = i + minLag; j < nF; j += 3) all.push(D[i * nF + j]);
  all.sort((a, b) => a - b);
  const thr = all.length ? all[Math.floor(all.length * 0.9)] : 1;
  all = null;
  for (let i = 0; i < nF; i++) {
    const row = D.subarray(i * nF, i * nF + nF);
    let b1 = 0, j1 = -1;
    for (let j = 0; j < nF; j++) if (Math.abs(j - i) >= minLag && row[j] > b1) { b1 = row[j]; j1 = j; }
    let b2 = 0;
    for (let j = 0; j < nF; j++) if (Math.abs(j - i) >= minLag && Math.abs(j - j1) >= W && row[j] > b2) b2 = row[j];
    rep[i] = 0.6 * b1 + 0.4 * b2;
    // count the separate places it comes back
    let n = 1;
    for (let j = 0; j < nF;) { if (Math.abs(j - i) >= 2 * W && row[j] >= thr && row[j] > 0.5) { n++; j += 2 * W; } else j++; }
    repeats[i] = Math.min(255, n);
  }
  // change points: where the loudness jumps up or the harmony changes (good places to start)
  const nov = new Float32Array(nF), win = Math.max(2, Math.round(2 / hopS));
  for (let f = win; f < nF - win; f++) {
    let eb = 0, ea = 0; const cb = new Float32Array(12), ca = new Float32Array(12);
    for (let d = 1; d <= win; d++) { eb += energy[f - d]; ea += energy[f + d - 1]; for (let p = 0; p < 12; p++) { cb[p] += sm[(f - d) * 12 + p]; ca[p] += sm[(f + d - 1) * 12 + p]; } }
    let dot = 0, na = 0, nb = 0; for (let p = 0; p < 12; p++) { dot += ca[p] * cb[p]; na += ca[p] ** 2; nb += cb[p] ** 2; }
    const cos = na && nb ? dot / Math.sqrt(na * nb) : 1;
    nov[f] = Math.max(0, (ea - eb) / win) / 6 + (1 - cos) * 2;
  }
  return { hopS, nF, W, duration, energy, energyP: pct(energy), rep, repP: pct(rep), repeats, nov, novP: pct(nov) };
}

/**
 * The top `count` places for a clip of `len` seconds: loud, coming back more than
 * once (the chorus), starting where a part begins. Returns [{ start, end, score, repeats, why }].
 */
export function suggestClips(h, len, count = 3) {
  const L = Math.max(1, Math.round(len / h.hopS)), nF = h.nF, last = Math.max(0, nF - L);
  if (h.duration <= len + 0.5) return [{ start: 0, end: Math.min(len, h.duration), score: 1, repeats: 1, why: "The whole song fits" }];
  const cumE = new Float64Array(nF + 1), cumR = new Float64Array(nF + 1);
  for (let i = 0; i < nF; i++) { cumE[i + 1] = cumE[i] + h.energyP[i]; cumR[i + 1] = cumR[i] + h.repP[i]; }
  const span = Math.max(1, L - h.W + 1);
  const scores = new Float32Array(last + 1);
  for (let s = 0; s <= last; s++) {
    const E = (cumE[s + L] - cumE[s]) / L;
    const R = (cumR[Math.min(nF, s + span)] - cumR[s]) / Math.max(1, Math.min(nF, s + span) - s);
    const quietStart = h.energyP[s] < 0.25 ? 0.08 : 0;
    const open = (cumR[Math.min(nF, s + h.W)] - cumR[s]) / Math.max(1, Math.min(nF, s + h.W) - s);   // does it open on the part that comes back
    scores[s] = 0.4 * E + 0.45 * R + 0.15 * open + 0.12 * h.novP[s] - quietStart;
  }
  const order = Array.from(scores, (_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const picked = [];
  for (const s of order) {
    if (picked.length >= count) break;
    if (picked.some((p) => Math.abs(p - s) < L * 0.8)) continue;
    picked.push(s);
  }
  return picked.map((s, k) => {
    const start = Math.max(0, s * h.hopS - 0.15), end = Math.min(h.duration, start + len);
    const reps = h.repeats[s], loud = (cumE[s + L] - cumE[s]) / L;
    const bits = [];
    if (reps >= 5) bits.push("the part that keeps coming back");
    else if (reps >= 2) bits.push(`comes back ${reps} times`);
    if (loud > 0.7) bits.push("one of the biggest parts");
    else if (loud > 0.5) bits.push("full and loud");
    if (!bits.length) bits.push(k === 0 ? "the strongest moment we found" : "another strong moment");
    const why = bits.join(", ");
    return { start: +start.toFixed(2), end: +end.toFixed(2), score: +scores[s].toFixed(3), repeats: reps, why: why[0].toUpperCase() + why.slice(1) };
  });
}

/** Everything the page needs from a decoded song, in one go */
export function analyzeSong(chans, fs) {
  const { mono, fs: fsd } = mixDown(chans, fs);
  const hooks = analyzeHooks(mono, fsd);
  return { duration: chans[0].length / fs, hooks, ...peaksOf(mono, fsd, 50), ...bandsOf(mono, fsd, 30, 32) };
}
/** Bar heights (0..1) at song time t, eased between frames */
export function barsAt(an, t, out) {
  const nb = an.nb, f = Math.max(0, Math.min(an.frames - 1, t * an.fps)), a = Math.floor(f), b = Math.min(an.frames - 1, a + 1), k = f - a;
  out ||= new Float32Array(nb);
  for (let i = 0; i < nb; i++) out[i] = (an.bands[a * nb + i] * (1 - k) + an.bands[b * nb + i] * k) / 255;
  return out;
}
/** A 0..1 thump at time t from the lowest bars (for pulsing art) */
export function thumpAt(an, t) {
  const f = Math.max(0, Math.min(an.frames - 1, Math.round(t * an.fps))), nb = an.nb;
  let s = 0; for (let i = 0; i < 4; i++) s += an.bands[f * nb + i];
  const p = Math.max(0, f - 3); let q = 0; for (let i = 0; i < 4; i++) q += an.bands[p * nb + i];
  return Math.max(0, Math.min(1, (s / 4 / 255 - 0.45) * 2 + Math.max(0, s - q) / 255 / 4 * 3));
}
/** Smooth loop motion: 0..1..0 over a loop of T seconds, the same at t=0 and t=T */
export const loopWave = (t, T, phase = 0) => 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / T + phase));
export const easeOut = (x) => 1 - (1 - Math.max(0, Math.min(1, x))) ** 3;

/** Settings worth remembering between visits (never the audio, art or words) */
export const REMEMBER = ["artist", "cta", "ctaCustom", "fmt", "look", "canvasLook", "len", "canvasLen", "showTitle", "showCta", "showDate", "showLyrics", "canvasText", "safe", "safeWhich", "showMark"];
export function pickSettings(state) { const o = {}; for (const k of REMEMBER) if (state[k] !== undefined) o[k] = state[k]; return o; }
export function mergeSettings(state, saved) {
  if (!saved || typeof saved !== "object") return state;
  for (const k of REMEMBER) if (saved[k] !== undefined && typeof saved[k] === typeof state[k]) state[k] = saved[k];
  if (!FORMATS[state.fmt]) state.fmt = "vertical";
  if (!LOOKS[state.look] || LOOKS[state.look].canvas) state.look = "spotlight";
  if (!LOOKS[state.canvasLook] || !LOOKS[state.canvasLook].canvas) state.canvasLook = "drift";
  if (!CLIP_LENGTHS.includes(state.len) && !(state.len >= MIN_CLIP && state.len <= MAX_CLIP)) state.len = 30;
  if (!(state.canvasLen >= CANVAS_MIN && state.canvasLen <= CANVAS_MAX)) state.canvasLen = 6;
  else state.canvasLen = Math.round(state.canvasLen * 2) / 2;
  return state;
}

/** Colours to pick from beside the cover's own: bright accents, then dark backgrounds */
export const ACCENTS = ["#ff3b00", "#ff8a00", "#facc15", "#a3e635", "#22c55e", "#14b8a6", "#22d3ee", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#e11d48", "#f2efe8"];
export const BACKGROUNDS = ["#0b0908", "#1c1917", "#2a1a12", "#2b0f12", "#2a0f24", "#1a1433", "#0f1a33", "#0b2027", "#0d2418", "#26230c"];

/** Which recording formats to ask the browser for, best first */
export function mimeCandidates(audio) {
  const v = ["avc1.640028", "avc1.4D4028", "avc1.42E028", "avc1.42E01F", "avc1"];
  const mp4 = audio ? v.map((c) => `video/mp4;codecs=${c},mp4a.40.2`) : v.map((c) => `video/mp4;codecs=${c}`);
  const webm = audio ? ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus"] : ["video/webm;codecs=vp9", "video/webm;codecs=vp8"];
  return [...mp4, "video/mp4", ...webm, "video/webm"];
}
export const extFor = (mime) => (/mp4/.test(mime) ? "mp4" : "webm");
