// ENCORE. Green Room: file loading with visible progress, shared by every tool.
//
// Opening a file has two parts. Reading the bytes is usually instant, but a file in a cloud
// folder that downloads on open, or on a USB or network drive, can take minutes, so it gets a
// real percentage. Decoding is quick and shows a pulse. A small panel in the corner lists every
// file being opened; it only appears when a load takes longer than a blink, so fast loads stay
// quiet.
//
//   import { openAudio, loadFile } from "./load-progress.js";
//   const d = await openAudio(file);                        // same result as decodeAudio(file)
//   const buf = await loadFile(file, (ab) => ctx.decodeAudioData(ab));  // any work after reading
//   const bytes = new Uint8Array(await loadFile(file));      // just the bytes, with progress
import { decodeAudio } from "./audio-decode.js";

const SHOW_AFTER = 250;   // ms before the panel appears
const SLOW_RATE = 2 * 1048576; // bytes/s; slower than this after 5 s earns the hint
const MB = (b) => (b / 1048576).toFixed(b < 10485760 ? 1 : 0);

let panel = null, tick = 0;
const rows = new Set();

function ensurePanel() {
  if (panel?.isConnected) return panel;
  if (!document.getElementById("lpStyle")) {
    const st = document.createElement("style");
    st.id = "lpStyle";
    st.textContent = `
.lp { pointer-events: none; position: fixed; right: 16px; bottom: 16px; z-index: 900; width: min(340px, calc(100vw - 32px)); max-height: 50vh; overflow-y: auto;
  background: var(--panel, #1b1b1f); color: var(--text, #f2f2f2); border: 1px solid var(--divider-strong, rgb(255 255 255 / .16)); border-radius: 10px;
  box-shadow: 0 10px 30px rgb(0 0 0 / .45); padding: 8px 10px; font: 13px/1.35 var(--family-sans, system-ui, sans-serif); }
.lp:empty { display: none; }
.lpRow { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 3px 8px; padding: 6px 0; }
.lpRow + .lpRow { border-top: 1px solid var(--divider, rgb(255 255 255 / .08)); }
.lpName { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lpPct { font-family: var(--family-mono, ui-monospace, monospace); font-size: 12px; color: var(--soft, #cfcfcf); }
.lpBar { grid-column: 1 / 3; height: 4px; border-radius: 2px; background: rgb(255 255 255 / .08); overflow: hidden; }
.lpBar i { display: block; height: 100%; width: 0; background: #ff3b00; transition: width .2s; }
.lpRow.busy .lpBar i { width: 100% !important; animation: lpPulse 1s ease-in-out infinite alternate; }
.lpRow.ok .lpBar i { width: 100% !important; background: var(--green, #22c55e); }
.lpRow.bad .lpBar i { width: 100% !important; background: var(--red, #ef4444); }
.lpNote { grid-column: 1 / 3; font-size: 11px; color: var(--dim, #9a9a9a); }
.lpNote:empty { display: none; }
@keyframes lpPulse { from { opacity: .35; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lpRow.busy .lpBar i { animation: none; } }`;
    document.head.append(st);
  }
  panel = document.createElement("div");
  panel.className = "lp"; panel.setAttribute("role", "status"); panel.setAttribute("aria-live", "polite");
  panel.setAttribute("aria-label", "Opening files");
  document.body.append(panel);
  return panel;
}

function paint(r) {
  if (!r.el) return;
  const pct = r.size ? Math.min(100, Math.round((r.loaded / r.size) * 100)) : 0;
  const now = performance.now(), secs = Math.floor((now - r.t0) / 1000);
  r.el.className = "lpRow" + (r.stage === "work" ? " busy" : r.stage === "ok" ? " ok" : r.stage === "bad" ? " bad" : "");
  r.el.querySelector(".lpBar i").style.width = pct + "%";
  r.el.querySelector(".lpPct").textContent = r.stage === "read" ? pct + "%" : r.stage === "work" ? r.label.toLowerCase() : r.stage === "ok" ? "done" : r.stage === "bad" ? "failed" : "";
  let note = "";
  if (r.stage === "read") {
    note = `Reading ${MB(r.loaded)} of ${MB(r.size)} MB` + (secs >= 3 ? `, ${secs}s` : "");
    if (secs >= 5 && r.loaded / ((now - r.t0) / 1000) < SLOW_RATE) note += ". Reading slowly: if this file is in a cloud folder or on a USB or network drive, it's being copied over first.";
  } else if (r.stage === "work") {
    const ws = Math.floor((now - r.tw) / 1000);
    note = r.detail || (ws >= 3 ? `${r.label}, ${ws}s` : "");
  }
  r.el.querySelector(".lpNote").textContent = note;
}

function show(r) {
  if (r.el || r.closed) return;
  const p = ensurePanel();
  r.el = document.createElement("div");
  r.el.innerHTML = `<span class="lpName"></span><span class="lpPct"></span><span class="lpBar"><i></i></span><span class="lpNote"></span>`;
  r.el.querySelector(".lpName").textContent = r.name;
  p.append(r.el);
  paint(r);
  if (!tick) tick = setInterval(() => { for (const x of rows) paint(x); if (!rows.size) { clearInterval(tick); tick = 0; } }, 500);
}

function close(r, stage) {
  r.stage = stage; r.closed = true; rows.delete(r);
  clearTimeout(r.timer);
  if (!r.el) return;
  paint(r);
  const el = r.el;
  setTimeout(() => el.remove(), stage === "ok" ? 700 : 2500);
}

/** Read a File's bytes with progress (r gets .loaded updated). */
async function readBytes(file, r) {
  if (!file.stream || !(file.size > 0)) { const b = await file.arrayBuffer(); r.loaded = r.size; return b; }
  const out = new Uint8Array(file.size);
  const reader = file.stream().getReader();
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (r.loaded + value.length > out.length) throw new Error("The file changed while it was being read.");
    out.set(value, r.loaded); r.loaded += value.length;
    const now = performance.now();
    if (now - last > 100) { last = now; paint(r); }
  }
  return r.loaded === out.length ? out.buffer : out.slice(0, r.loaded).buffer;
}

const frame = () => new Promise((res) => (typeof requestAnimationFrame === "function" ? requestAnimationFrame(() => setTimeout(res, 0)) : setTimeout(res, 0)));

/**
 * Read `file` with progress, then run `work(arrayBuffer, status)` (decoding, parsing...) while
 * the row pulses. Resolves with work's result (or the ArrayBuffer when no work is given).
 * status(text) puts a line of detail under the row (for long decodes with their own progress).
 * Options: label (the word shown while working, default "Decoding"), name (shown instead of file.name).
 */
export async function loadFile(file, work = null, { label = "Decoding", name } = {}) {
  const r = { name: name || file?.name || "File", size: file?.size || 0, loaded: 0, stage: "read", label, t0: performance.now(), el: null, closed: false, detail: "" };
  rows.add(r);
  r.timer = setTimeout(() => show(r), SHOW_AFTER);
  try {
    const buf = await readBytes(file, r);
    if (!work) { close(r, "ok"); return buf; }
    r.stage = "work"; r.tw = performance.now(); paint(r);
    if (r.el) await frame(); // let the pulse paint before work that can hold the page a moment
    const out = await work(buf, (text) => { r.detail = text || ""; paint(r); });
    close(r, "ok");
    return out;
  } catch (e) {
    close(r, "bad");
    throw e;
  }
}

/** decodeAudio(file, info, onStatus) with a progress row. Same result: { chans, fs, info }. */
export function openAudio(file, info = null, onStatus = () => {}) {
  return loadFile(file, (buf, status) =>
    decodeAudio({ name: file.name, size: file.size, type: file.type, arrayBuffer: async () => buf }, info, (m) => { status(m); onStatus(m); }));
}

/** For tests: what the panel shows right now. */
export const loadingNow = () => [...rows].map((r) => ({ name: r.name, stage: r.stage, pct: r.size ? Math.round((r.loaded / r.size) * 100) : 0, shown: !!r.el }));
