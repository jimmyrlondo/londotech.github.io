// ENCORE. Songbook covers: album art for a folder or a song, kept in this browser's
// IndexedDB (pictures are too big for localStorage), shrunk to print size on the way in.
const DB = "encore.songbook.covers", STORE = "covers";
let dbp = null;
function open() {
  dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
const cache = new Map();
/** The cover for a folder or song id, as a data URL (or null) */
export async function getCover(id) {
  if (!id) return null;
  if (cache.has(id)) return cache.get(id);
  let v = null;
  try { v = (await tx("readonly", (s) => s.get(id))) || null; } catch {}
  cache.set(id, v);
  return v;
}
export async function setCover(id, dataUrl) {
  cache.set(id, dataUrl || null);
  try { await tx("readwrite", (s) => (dataUrl ? s.put(dataUrl, id) : s.delete(id))); } catch {}
}
/** Every cover, for backups */
export async function allCovers() {
  const out = {};
  try {
    const d = await open();
    await new Promise((res, rej) => {
      const t = d.transaction(STORE, "readonly"), r = t.objectStore(STORE).openCursor();
      r.onsuccess = () => { const c = r.result; if (c) { out[c.key] = c.value; c.continue(); } };
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
  } catch {}
  return out;
}
/** A picture file shrunk to at most `max` pixels on its long side, as a JPEG data URL (PNG kept for small art with transparency) */
export async function imageToCover(file, max = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That file isn't a picture this browser can open.")); i.src = url; });
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const g = c.getContext("2d");
    g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.88);
  } finally { URL.revokeObjectURL(url); }
}
