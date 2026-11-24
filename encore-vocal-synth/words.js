// ENCORE. Songbook's word helper for pages: rhymes, filters, a thesaurus and
// syllable counts, all in a background worker (words-worker.js) so typing never
// stalls. Offline once loaded; the data is in words/<lang>/.
//
//   const W = await openWords("en", { ready: (p) => ..., phrases: (n) => ... });   // p: { loaded, total, stage }
//   await W.rhymes("fire", { kinds: ["perfect", "near"], syllables: 1, limit: 100 })
//   await W.rhymes("know", { kinds: ["perfect", "phrase"], offset: 0, limit: 100, syllables: 2 })   // paged, see below
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
//
// Paged rhymes (for tabs and infinite scroll): pass offset (0 for the first page). Then limit is the
// page size (default 100) over the whole sorted list, syllables picks the tab (n, or [5, 99] for 5+),
// and the answer adds { total (in this tab), totals: { all, 1, 2, 3, 4, "5+" } (every tab, before the
// syllables filter), byKind: { perfect: n, ... }, offset, limit, more }. The next page is the same call
// with offset + limit; the worker keeps the list, so it's instant. There is no cap: "know" has 6000+.
//
// Every result: { w, syl, stress, level (0 most common ... 9, 10 unknown), pos, explicit, kind, score, multi,
//   tag: "common" | "rare" | "name" | "phrase", flags: ["common" | "rare", "name"?, "phrase"?, "idiom"?,
//   "homophone"?, "end"?, "made"?], homophone (know / no), end (only the last syllable rhymes: know / shadow) }
// Sorted: perfect (common words, common phrases, rare words, names, rare phrases; stressed rhymes before
// end rhymes in each), family, near, made-up phrases, consonant.
//
// Multi-word phrases (talk show, to and fro) load after the words: until then results carry phrases: false.
// W.phrasesReady resolves with the count once they're in (or 0 if they couldn't load); asking again then
// gives the fuller list.
const opened = new Map();

export function openWords(lang = "en", { ready, phrases } = {}) {
  if (opened.has(lang)) return opened.get(lang);
  const p = new Promise((resolve, reject) => {
    const worker = new Worker(new URL("words-worker.js", import.meta.url), { type: "module" });
    let next = 1, phrasesDone;
    const waiting = new Map(), phrasesReady = new Promise((r) => (phrasesDone = r));
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === "progress") { ready?.(m); return; }
      if (m.type === "phrases") { phrasesDone(m.count); phrases?.(m.count); return; }
      const w = waiting.get(m.id);
      if (!w) return;
      waiting.delete(m.id);
      m.error ? w.reject(new Error(m.error)) : w.resolve(m.result);
    };
    worker.onerror = (e) => { const err = new Error(e.message || "The word helper stopped."); for (const w of waiting.values()) w.reject(err); waiting.clear(); reject(err); };
    const call = (type, args) => new Promise((res, rej) => { const id = next++; waiting.set(id, { resolve: res, reject: rej }); worker.postMessage({ id, type, ...args }); });
    call("init", { lang }).then(() => resolve({
      lang,
      phrasesReady,
      /** { word, known, guess, like, pron, syllables, stress, phrases, total, totals, byKind, results: [{ w, syl, stress, kind, score, multi, level, pos, explicit,
       *    tag, flags, homophone, end, also? }], ms }; paged (offset set) adds offset, limit, more */
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
