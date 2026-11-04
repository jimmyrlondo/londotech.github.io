// Encore Beatpad: what's kept on this device (IndexedDB): your sample library (the audio bytes in one store, what
// they are in another, so listing the library doesn't load every sound), your kits, and the built-in Acoustic kit's
// files once they've been fetched (so it works offline after the first time). Nothing leaves the browser.

const DB = 'encore-beatpad', VERSION = 1;
let opening = null;

function open() {
  if (!opening) opening = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('This browser can\'t keep files (no IndexedDB), so the library and kits can\'t be saved.')); return; }
    const req = indexedDB.open(DB, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('samples')) db.createObjectStore('samples', { keyPath: 'id' });   // what each sample is
      if (!db.objectStoreNames.contains('audio')) db.createObjectStore('audio', { keyPath: 'id' });       // its bytes
      if (!db.objectStoreNames.contains('kits')) db.createObjectStore('kits', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('The browser wouldn\'t open Beatpad\'s storage.'));
    req.onblocked = () => reject(new Error('Beatpad is open in another tab that\'s holding its storage. Close it and reload.'));
  });
  return opening;
}

/** One request in one store, as a promise */
async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode), req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error || new Error('Saving failed.'));
    tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('This device is out of room for Beatpad. Delete some samples or kits.') : tx.error || new Error('Saving was cancelled.'));
  });
}

export const getAll = store => run(store, 'readonly', s => s.getAll());
export const get = (store, id) => run(store, 'readonly', s => s.get(id));
export const put = (store, value) => run(store, 'readwrite', s => s.put(value));
export const remove = (store, id) => run(store, 'readwrite', s => s.delete(id));

/** A sample: what it is, and its bytes, together (one transaction, so you never get one without the other) */
export async function putSample(meta, bytes) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['samples', 'audio'], 'readwrite');
    tx.objectStore('samples').put(meta);
    tx.objectStore('audio').put({ id: meta.id, bytes });
    tx.oncomplete = () => resolve(meta);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error?.name === 'QuotaExceededError' ? new Error('This device is out of room for Beatpad. Delete some samples or kits.') : tx.error || new Error('Saving was cancelled.'));
  });
}
export async function removeSample(id) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['samples', 'audio'], 'readwrite');
    tx.objectStore('samples').delete(id);
    tx.objectStore('audio').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export const sampleBytes = async id => (await get('audio', id))?.bytes || null;

/** A new id for a sample or kit */
export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Asks the browser to keep Beatpad's files even when the device runs low (some browsers ask you; some just decide) */
export async function keepFiles() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) return await navigator.storage.persist(); return true; } catch { return false; }
}
export async function usage() {
  try { const e = await navigator.storage.estimate(); return { used: e.usage || 0, quota: e.quota || 0 }; } catch { return null; }
}
