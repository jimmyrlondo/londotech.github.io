// Encore Restore: keeping projects on this device, so a release can be done a
// side at a time over days.
//   projects (IndexedDB "encore-restore"): the project itself, with its images
//     as Blobs and each part's fix settings (noise profiles and all)
//   reports (IndexedDB): each side's analysis, so reopening doesn't re-listen
//   audio (the browser's private file storage, OPFS, "encore-restore/"): the
//     side recordings made here, and copies of opened files when "keep a copy"
//     is on. Nothing leaves the device.
const DB = "encore-restore";
let dbp = null;
function db() {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("projects", { keyPath: "id" }); d.createObjectStore("reports"); d.createObjectStore("meta"); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const tx = async (store, mode, fn) => {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode), s = t.objectStore(store), req = fn(s);
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error("Saving was canceled (is the device out of space?)"));
  });
};

// what's kept: everything but the page's own runtime objects
const storable = (p) => ({ ...p, parts: p.parts.map((x) => ({ ...x, restored: x.restored ? { key: x.restored.key, clicks: x.restored.clicks && { total: x.restored.clicks.total, long: x.restored.clicks.long }, lufsIn: x.restored.lufsIn, lufsOut: x.restored.lufsOut } : null })) });
export const saveProject = (p) => tx("projects", "readwrite", (s) => s.put(storable({ ...p, updated: new Date().toISOString() })));
export const loadProject = (id) => tx("projects", "readonly", (s) => s.get(id));
export async function listProjects() {
  const all = (await tx("projects", "readonly", (s) => s.getAll())) || [];
  return all.sort((a, b) => (a.updated < b.updated ? 1 : -1));
}
export async function deleteProject(p) {
  for (const part of p.parts) { if (part.audio?.store) await removeAudio(part.audio.store); await tx("reports", "readwrite", (s) => s.delete(`${p.id}:${part.id}`)); }
  await tx("projects", "readwrite", (s) => s.delete(p.id));
}
export const saveReport = (key, report) => tx("reports", "readwrite", (s) => s.put(report, key)).catch(() => {});
export const loadReport = (key) => tx("reports", "readonly", (s) => s.get(key)).catch(() => null);
export const deleteReport = (key) => tx("reports", "readwrite", (s) => s.delete(key)).catch(() => {});
export const getMeta = (key) => tx("meta", "readonly", (s) => s.get(key)).catch(() => null);
export const setMeta = (key, v) => tx("meta", "readwrite", (s) => s.put(v, key)).catch(() => {});

// ---------- audio files ----------
async function dir() {
  try { return await (await navigator.storage.getDirectory()).getDirectoryHandle("encore-restore", { create: true }); } catch { return null; }
}
// Copy a File or Blob into the private storage, streamed (a 1 GB side never sits in memory)
export async function storeAudio(name, blob, onProgress) {
  const d = await dir();
  if (!d) throw new Error("This browser can't keep files on the device.");
  const fh = await d.getFileHandle(name, { create: true }), w = await fh.createWritable();
  try {
    if (blob.stream && onProgress) {
      let done = 0;
      const counter = new TransformStream({ transform(chunk, c) { done += chunk.byteLength; onProgress(done / blob.size); c.enqueue(chunk); } });
      await blob.stream().pipeThrough(counter).pipeTo(w);
    } else { await w.write(blob); await w.close(); }
  } catch (err) { try { await w.abort(); } catch {} try { await d.removeEntry(name); } catch {} throw err; }
  return fh.getFile();
}
export async function getAudio(name) {
  const d = await dir();
  if (!d || !name) return null;
  try { return await (await d.getFileHandle(name)).getFile(); } catch { return null; }
}
export async function removeAudio(name) { const d = await dir(); try { await d?.removeEntry(name); } catch {} }
export async function storageInfo() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0, persisted: await navigator.storage.persisted?.() }; } catch { return null; }
}
export async function askToPersist() { try { return await navigator.storage.persist?.(); } catch { return false; } }
export const blobToBytes = async (b) => new Uint8Array(await b.arrayBuffer());
