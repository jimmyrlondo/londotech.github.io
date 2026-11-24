// ENCORE. Set List: keeps songs, sets and settings in this browser (IndexedDB). Nothing is uploaded.
// Every call is wrapped: when the browser won't store anything (a private window, storage off),
// the tool keeps working from memory for this visit and says so once.
const DB = "encore-setlist", VER = 1;
let dbp = null, broken = false;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB, VER); } catch (e) { rej(e); return; }
    r.onupgradeneeded = () => {
      const d = r.result;
      for (const name of ["songs", "sets"]) if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, { keyPath: "id" });
      if (!d.objectStoreNames.contains("prefs")) d.createObjectStore("prefs");
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error("blocked"));
  });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function run(name, mode, fn) {
  if (broken) return undefined;
  try {
    const st = (await open()).transaction(name, mode).objectStore(name);
    return await fn(st);
  } catch (e) { broken = true; onFail(e); return undefined; }
}
let onFail = () => {};
/** Called once if storage stops working */
export const whenStorageFails = (fn) => { onFail = fn; };
export const storageWorks = () => !broken;

export const loadAll = async (name) => (await run(name, "readonly", (s) => req(s.getAll()))) || [];
export const put = (name, obj) => run(name, "readwrite", (s) => req(s.put(obj)));
export const remove = (name, id) => run(name, "readwrite", (s) => req(s.delete(id)));
export const getPref = async (key, dflt = null) => { const v = await run("prefs", "readonly", (s) => req(s.get(key))); return v === undefined ? dflt : v; };
export const setPref = (key, value) => run("prefs", "readwrite", (s) => req(s.put(value, key)));
