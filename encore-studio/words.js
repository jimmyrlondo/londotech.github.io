// ENCORE. Songbook's word helper for pages: rhymes, filters, a thesaurus and
// syllable counts, all in a background worker (words-worker.js) so typing never
// stalls. Offline once loaded; the data is in words/<lang>/.
//
//   const W = await openWords("en", { ready: (p) => ... });   // p: { loaded, total, stage }
//   await W.rhymes("fire", { kinds: ["perfect", "near"], syllables: 1, limit: 100 })
//   await W.filter(list, { rhymesWith: "start", syllables: 1 })    // any list of words or results
//   await W.thesaurus("happy")
//   await W.syllables("Every line you write\nGets counted here")
//   await W.lookup("orange")
//
// Filters (on rhymes() and filter()): syllables (n or [min, max]), stressEnd ("1" ends stressed,
// "0" unstressed, "10" ...), rhymesWith (word, or { word, kind: "perfect" | "near" }, or a list of them),
// relatedTo (word: keep words that mean something like it), startsWith, endsWith, contains,
// pos ("n" | "v" | "a" | "r" or a list), common (SCOWL size: 10 most common words ... 95 everything),
// clean (true hides explicit words). rhymes() also takes kinds and limit (per kind, default 150).
const opened = new Map();

export function openWords(lang = "en", { ready } = {}) {
  if (opened.has(lang)) return opened.get(lang);
  const p = new Promise((resolve, reject) => {
    const worker = new Worker(new URL("words-worker.js", import.meta.url), { type: "module" });
    let next = 1;
    const waiting = new Map();
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { ready?.(m); return; }
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      m.error ? w.reject(new Error(m.error)) : w.resolve(m.result);
    };
    worker.onerror = (e) => { const err = new Error(e.message || "The word helper stopped."); for (const w of waiting.values()) w.reject(err); waiting.clear(); reject(err); };
    const call = (type, args) => new Promise((res, rej) => { const id = next++; waiting.set(id, { resolve: res, reject: rej }); worker.postMessage({ id, type, ...args }); });
    call("init", { lang }).then(() => resolve({
      lang,
      /** { word, known, guess, like, pron, syllables, stress, total, results: [{ w, syl, stress, kind, score, multi, level, pos, explicit, also? }], ms } */
      rhymes: (word, opts = {}) => call("rhymes", { word, opts }),
      /** the same result shape, filtered; a list of plain words works too */
      filter: (list, opts = {}) => call("filter", { list, opts }),
      /** { word, found, senses: [{ pos, def, example, synonyms, antonyms, broader, narrower, similar }], more, related, ms }; every word is { w, syl } */
      thesaurus: (word) => call("thesaurus", { word }),
      /** { lines: [{ text, syllables, words: [{ w, syllables, stress, guess }] }], total, ms } */
      syllables: (text) => call("syllables", { text }),
      /** { word, known, guess, like, prons: [{ arpabet, syllables, stress }], level, common, pos, explicit, ms } */
      lookup: (word) => call("lookup", { word }),
      close: () => { worker.terminate(); opened.delete(lang); },
    }), (err) => { opened.delete(lang); reject(err); });
  });
  opened.set(lang, p);
  return p;
}
