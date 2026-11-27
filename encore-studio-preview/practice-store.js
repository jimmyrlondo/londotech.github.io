// ENCORE. Practice: saving per song (loops, markers, speed, key) and the recent songs themselves, in
// this browser's IndexedDB. Every call is safe: if storage is blocked (private window, full disk)
// the tool keeps working and simply doesn't remember.
const DB = "encore-practice", VER = 1, MAX_FILES = 6;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
      r.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return dbp;
}
async function tx(store, mode, fn) {
  const db = await open();
  if (!db) return undefined;
  return new Promise((resolve) => {
    try {
      const t = db.transaction(store, mode), s = t.objectStore(store);
      let out;
      const req = fn(s);
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => resolve(out);
      t.onerror = t.onabort = () => resolve(undefined);
    } catch { resolve(undefined); }
  });
}

export const loadSong = (key) => tx("songs", "readonly", (s) => s.get(key));
export const saveSong = (key, data) => tx("songs", "readwrite", (s) => s.put({ ...data, at: Date.now() }, key));

/** Keep the song file itself so it can be opened again from "Recent". */
export async function rememberFile(key, file, dur) {
  await tx("files", "readwrite", (s) => s.put({ name: file.name, size: file.size, dur, blob: file, at: Date.now() }, key));
  const all = await recentFiles();
  for (const old of all.slice(MAX_FILES)) await tx("files", "readwrite", (s) => s.delete(old.key));
}
export async function recentFiles() {
  const db = await open();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const out = [], t = db.transaction("files", "readonly"), c = t.objectStore("files").openCursor();
      c.onsuccess = () => { const cur = c.result; if (cur) { const v = cur.value; out.push({ key: cur.key, name: v.name, size: v.size, dur: v.dur, at: v.at }); cur.continue(); } };
      t.oncomplete = () => resolve(out.sort((a, b) => b.at - a.at));
      t.onerror = () => resolve([]);
    } catch { resolve([]); }
  });
}
export async function getFile(key) {
  const v = await tx("files", "readonly", (s) => s.get(key));
  if (!v || !v.blob) return null;
  try { return new File([v.blob], v.name, { type: v.blob.type }); } catch { return v.blob; }
}
export const forgetFile = (key) => tx("files", "readwrite", (s) => s.delete(key));
