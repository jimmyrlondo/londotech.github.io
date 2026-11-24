// ENCORE. Vocal Synth: keeps voicebank projects and every take in this browser (IndexedDB),
// so a session can stop and pick up later. Nothing is uploaded anywhere.
const DB = "encore-vocalsynth", VER = 1;
let dbp = null;
function open() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains("projects")) d.createObjectStore("projects", { keyPath: "id" });
      if (!d.objectStoreNames.contains("takes")) {
        const t = d.createObjectStore("takes", { keyPath: "id" });
        t.createIndex("project", "projectId");
      }
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
const req = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function store(name, mode = "readonly") { return (await open()).transaction(name, mode).objectStore(name); }

export const takeId = (projectId, midi, key) => `${projectId}|${midi}|${key}`;

export async function listProjects() { return (await req((await store("projects")).getAll())).sort((a, b) => (b.updated ?? 0) - (a.updated ?? 0)); }
export async function getProject(id) { return req((await store("projects")).get(id)); }
export async function saveProject(p) { p.updated = Date.now(); await req((await store("projects", "readwrite")).put(p)); return p; }
export async function deleteProject(id) {
  const ts = await listTakes(id);
  const s = await store("takes", "readwrite");
  for (const t of ts) s.delete(t.id);
  await req((await store("projects", "readwrite")).delete(id));
}
export async function listTakes(projectId) { return req((await store("takes")).index("project").getAll(projectId)); }
export async function saveTake(t) { t.id = takeId(t.projectId, t.midi, t.key); t.at = Date.now(); await req((await store("takes", "readwrite")).put(t)); return t; }
export async function deleteTake(id) { await req((await store("takes", "readwrite")).delete(id)); }
