// ENCORE. Songbook's word engine, off the main thread. words.js talks to it.
//   in:  { id, type: "init", lang }                     out: progress { loaded, total, stage } ... then { id, ok }
//                                                       then, once phrases.txt is in: { type: "phrases", count }
//        { id, type: "rhymes", word, opts }              out: { id, ok, result }
//              opts.offset set: a page of the whole sorted list (see pageOf), the list kept for the next page
//        { id, type: "filter", list, opts }
//        { id, type: "thesaurus", word }
//        { id, type: "syllables", text }
//        { id, type: "lookup", word }
//   errors come back as { id, error }
import { buildLexicon, filterList, syllablesOf, thesaurusOf, relatedSet, lookupOf, shardKey, pageOf } from "./words-core.js";

let lex = null, lang = "en", phrasesIn = 0;
const shards = new Map();
// the last few full rhyme lists, so scrolling for more is just a slice
const lists = new Map();
function remember(key, list) { lists.set(key, list); while (lists.size > 8) lists.delete(lists.keys().next().value); }

async function fetchText(url, onBytes) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Couldn't load the word list (${res.status}).`);
  const total = +res.headers.get("content-length") || 0;
  if (!res.body || !onBytes) return res.text();
  const reader = res.body.getReader(), parts = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); loaded += value.length; onBytes(loaded, total);
  }
  const all = new Uint8Array(loaded); let o = 0;
  for (const p of parts) { all.set(p, o); o += p.length; }
  return new TextDecoder().decode(all);
}
// a thesaurus shard (two first letters), loaded once
async function entryFor(word) {
  const w = String(word).trim().toLowerCase(), k = shardKey(w);
  if (!shards.has(k)) {
    shards.set(k, fetch(new URL(`words/${lang}/th-${k}.json`, import.meta.url)).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  const shard = await shards.get(k);
  return shard[w] || null;
}
// the worker turns "relatedTo: word" into the set of words that mean something like it
async function withRelated(opts = {}) {
  if (!opts.relatedTo) return opts;
  const set = relatedSet(await entryFor(opts.relatedTo));
  return { ...opts, related: set };
}
const trim = (list, opts) => {
  const per = opts.limit ?? 150, n = new Map();
  return list.filter((r) => { const c = n.get(r.kind) || 0; n.set(r.kind, c + 1); return c < per; });
};

self.onmessage = async (e) => {
  const d = e.data, reply = (m) => self.postMessage({ id: d.id, ...m });
  try {
    if (d.type === "init") {
      lang = d.lang || "en";
      const text = await fetchText(new URL(`words/${lang}/lex.txt`, import.meta.url), (loaded, total) => self.postMessage({ type: "progress", loaded, total, stage: "Loading words" }));
      self.postMessage({ type: "progress", loaded: 1, total: 1, stage: "Getting ready" });
      lex = buildLexicon(text);
      reply({ ok: true, result: { words: lex.W.length } });
      // the phrases (talk show, to and fro) come after, so the first rhymes don't wait for them
      fetchText(new URL(`words/${lang}/phrases.txt`, import.meta.url))
        .then((t) => { phrasesIn = lex.addPhrases(t); lists.clear(); self.postMessage({ type: "phrases", count: phrasesIn }); })
        .catch((err) => self.postMessage({ type: "phrases", count: 0, error: err?.message || String(err) }));
      return;
    }
    if (!lex) throw new Error("The word list isn't loaded yet.");
    const t0 = performance.now();
    let result;
    if (d.type === "rhymes" && d.opts && d.opts.offset !== undefined && d.opts.offset !== null) {
      // paged: the whole sorted list (every filter but the syllables tab), then one page of it
      const { offset, limit, syllables, ...rest } = d.opts;
      const key = JSON.stringify([d.word, rest, phrasesIn]);
      let hit = lists.get(key);
      if (!hit) {
        const opts = await withRelated(rest), r = lex.rhymes(d.word, opts);
        hit = { r, list: filterList(lex, r.results, opts) };
        remember(key, hit);
      }
      const { results: _all, ...head } = hit.r;
      result = { ...head, ...pageOf(hit.list, { syllables, offset, limit }) };
    } else if (d.type === "rhymes") {
      const opts = await withRelated(d.opts || {});
      const r = lex.rhymes(d.word, opts);
      const filtered = filterList(lex, r.results, opts);
      const { totals, byKind } = pageOf(filtered, { limit: 0 });
      result = { ...r, total: filtered.length, totals, byKind, results: trim(filtered, opts) };
    } else if (d.type === "filter") {
      result = filterList(lex, d.list || [], await withRelated(d.opts || {}));
    } else if (d.type === "thesaurus") {
      result = thesaurusOf(lex, d.word, await entryFor(d.word));
    } else if (d.type === "syllables") {
      result = syllablesOf(lex, d.text);
    } else if (d.type === "lookup") {
      result = lookupOf(lex, d.word);
    } else throw new Error("Unknown request: " + d.type);
    if (result && typeof result === "object" && !Array.isArray(result)) result.ms = Math.round(performance.now() - t0);
    reply({ ok: true, result });
  } catch (err) {
    reply({ error: err?.message || String(err) });
  }
};
