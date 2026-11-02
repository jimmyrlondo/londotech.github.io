// ENCORE. Songbook's word engine: rhymes, filters, syllables and the thesaurus
// lookups, with no page in it (the worker and Node tests use it). The data is
// built by web/tools/build-words.py into words/<lang>/:
//   lex.txt      word TAB phonemes (one character each, PHONES order) TAB flags
//                (flags: SCOWL commonness level 0-9 or z, then a character with the
//                part-of-speech bits n1 v2 a4 r8 and the explicit bit 16, plus 64)
//   th-xx.json   thesaurus shards by first two letters
//
// How rhymes are judged (ARPAbet phonemes from the CMU dictionary):
//   the rhyme part of a word runs from its last stressed vowel to the end.
//   perfect    the rhyme parts are the same sounds (desire / fire)
//   family     same stressed vowel and same shape, the consonants swapped only for
//              close cousins: m/n/ng, p/b, t/d, k/g, f/v, s/z (time / mine)
//   near       the stressed vowel matches or nearly matches and the rest is close (fire / mind)
//   consonant  different vowel, same ending consonants (love / give)
//   phrase     two common words that rhyme with the word's last two syllables (orange / door hinge)

export const CONS = "B CH D DH F G HH JH K L M N NG P R S SH T TH V W Y Z ZH".split(" ");
export const VOWELS = "AA AE AH AO AW AY EH ER EY IH IY OW OY UH UW".split(" ");
const NC = CONS.length; // 24: phone codes below this are consonants
// SCOWL sizes for the commonness levels 0-9 (10 = unknown)
export const LEVEL_SIZES = [10, 20, 35, 40, 50, 55, 60, 70, 80, 95];
export const POS = { n: 1, v: 2, a: 4, r: 8 };
const EXPLICIT = 16;

// ---------- sound similarity ----------
// vowels: 1 the same, down to 0 nothing alike
const VSIM = (() => {
  const m = VOWELS.map(() => VOWELS.map(() => 0.12));
  const set = (a, b, v) => { const i = VOWELS.indexOf(a), j = VOWELS.indexOf(b); m[i][j] = m[j][i] = Math.max(m[i][j], v); };
  VOWELS.forEach((v) => set(v, v, 1));
  [["AA", "AO", 0.8], ["AA", "AH", 0.6], ["AO", "AH", 0.5], ["AH", "UH", 0.7], ["AH", "ER", 0.5], ["IH", "IY", 0.7], ["IH", "EH", 0.65], ["EH", "AE", 0.7],
   ["EY", "EH", 0.6], ["EY", "IY", 0.45], ["OW", "AO", 0.6], ["OW", "UW", 0.5], ["UW", "UH", 0.7], ["AY", "AA", 0.4], ["AY", "AE", 0.3], ["AW", "AA", 0.4],
   ["AW", "OW", 0.4], ["OY", "AO", 0.45], ["OY", "OW", 0.35], ["AE", "AA", 0.5], ["AE", "AH", 0.45], ["ER", "UH", 0.4], ["IH", "AH", 0.45], ["EH", "AH", 0.45],
   ["UH", "OW", 0.4], ["AY", "OY", 0.4], ["AY", "EY", 0.3]].forEach(([a, b, v]) => set(a, b, v));
  return m;
})();
// consonants: by family
const CSIM = (() => {
  const m = CONS.map(() => CONS.map(() => 0.1));
  const set = (a, b, v) => { const i = CONS.indexOf(a), j = CONS.indexOf(b); m[i][j] = m[j][i] = Math.max(m[i][j], v); };
  CONS.forEach((c) => set(c, c, 1));
  const group = (list, v) => { for (const a of list) for (const b of list) if (a !== b) set(a, b, v); };
  group(["M", "N", "NG"], 0.8);
  [["P", "B"], ["T", "D"], ["K", "G"], ["F", "V"], ["TH", "DH"], ["S", "Z"], ["SH", "ZH"], ["CH", "JH"]].forEach(([a, b]) => set(a, b, 0.8));
  group(["P", "T", "K"], 0.6); group(["B", "D", "G"], 0.6); group(["P", "T", "K", "B", "D", "G"], 0.4);
  [["F", "TH", 0.7], ["V", "DH", 0.6], ["S", "SH", 0.6], ["Z", "ZH", 0.6], ["CH", "SH", 0.6], ["JH", "ZH", 0.6], ["CH", "T", 0.45], ["JH", "D", 0.45],
   ["S", "TH", 0.5], ["Z", "DH", 0.45], ["L", "R", 0.5], ["W", "Y", 0.4], ["L", "W", 0.3], ["R", "W", 0.35], ["N", "L", 0.3], ["M", "B", 0.35], ["N", "D", 0.35], ["NG", "G", 0.35]]
    .forEach(([a, b, v]) => set(a, b, v));
  group(["F", "V", "TH", "DH", "S", "Z", "SH", "ZH"], 0.4);
  return m;
})();
const isV = (p) => p >= NC;
const base = (p) => (p < NC ? p : NC + (((p - NC) / 3) | 0));     // a vowel without its stress
const stressOf = (p) => (p < NC ? -1 : (p - NC) % 3);
function psim(a, b) {
  if (isV(a) !== isV(b)) return 0;
  if (!isV(a)) return CSIM[a][b];
  const s = VSIM[base(a) - NC][base(b) - NC];
  // two unstressed vowels are both "uh"-ish in singing
  return stressOf(a) === 0 && stressOf(b) === 0 ? Math.max(s, 0.6) : s;
}
// weighted edit distance as a similarity (0..1); a trailing unstressed vowel is cheap to drop ("fire" sung as one syllable)
let ROW_A = new Float32Array(64), ROW_B = new Float32Array(64);
function seqSim(a, b) {
  const n = a.length, m = b.length;
  if (!n && !m) return 1;
  const gap = (p) => (isV(p) ? (stressOf(p) === 0 ? 0.5 : 0.9) : 0.55);
  if (m + 1 > ROW_A.length) { ROW_A = new Float32Array(m + 1); ROW_B = new Float32Array(m + 1); }
  let prev = ROW_A, cur = ROW_B;
  prev[0] = 0;
  for (let j = 1; j <= m; j++) prev[j] = prev[j - 1] + gap(b[j - 1]);
  for (let i = 1; i <= n; i++) {
    cur[0] = prev[0] + gap(a[i - 1]);
    for (let j = 1; j <= m; j++) cur[j] = Math.min(prev[j - 1] + 1 - psim(a[i - 1], b[j - 1]), prev[j] + gap(a[i - 1]), cur[j - 1] + gap(b[j - 1]));
    [prev, cur] = [cur, prev];
  }
  return Math.max(0, 1 - prev[m] / Math.max(n, m));
}

// ---------- the lexicon ----------
/** Parse lex.txt. Returns the engine (everything else hangs off it). */
export function buildLexicon(text) {
  const W = [], P = [], LV = [], FL = [];
  let a = 0;
  while (a < text.length) {
    let b = text.indexOf("\n", a); if (b < 0) b = text.length;
    const t1 = text.indexOf("\t", a), t2 = text.indexOf("\t", t1 + 1);
    if (t1 > a && t2 > t1 && t2 < b) {
      W.push(text.slice(a, t1));
      const code = text.slice(t1 + 1, t2), ph = new Uint8Array(code.length);
      for (let i = 0; i < code.length; i++) ph[i] = code.charCodeAt(i) - 48;
      P.push(ph);
      const lc = text.charCodeAt(t2 + 1);
      LV.push(lc >= 48 && lc <= 57 ? lc - 48 : 10);
      FL.push(text.charCodeAt(t2 + 2) - 64);
    }
    a = b + 1;
  }
  return new Lexicon(W, P, LV, FL);
}

class Lexicon {
  constructor(W, P, LV, FL) {
    this.W = W; this.P = P; this.LV = Uint8Array.from(LV); this.FL = Uint8Array.from(FL);
    const n = W.length;
    this.byWord = new Map();
    this.rs = new Int16Array(n);     // where the rhyme part starts
    this.syl = new Uint8Array(n);
    this.sv = new Uint8Array(n);     // the stressed vowel (base)
    this.perfect = new Map();        // rhyme part (stress removed) -> ids
    this.byVowel = new Map();        // stressed vowel base -> ids
    this.byCoda = new Map();         // final consonants -> ids
    this.key = new Array(n);         // each word's rhyme part, as a string
    for (let i = 0; i < n; i++) {
      const w = W[i];
      if (!this.byWord.has(w)) this.byWord.set(w, []);
      this.byWord.get(w).push(i);
      const ph = P[i];
      let last1 = -1, last2 = -1, lastV = -1, syl = 0;
      for (let k = 0; k < ph.length; k++) if (isV(ph[k])) { syl++; lastV = k; const s = stressOf(ph[k]); if (s === 1) last1 = k; else if (s === 2) last2 = k; }
      const rs = last1 >= 0 ? last1 : last2 >= 0 ? last2 : lastV >= 0 ? lastV : 0;
      this.rs[i] = rs; this.syl[i] = syl; this.sv[i] = isV(ph[rs]) ? base(ph[rs]) : 0;
      const key = this.keyOf(ph, rs);
      this.key[i] = key;
      push(this.perfect, key, i); push(this.byVowel, this.sv[i], i);
      let c = ph.length; while (c > 0 && !isV(ph[c - 1])) c--;
      push(this.byCoda, Array.from(ph.subarray(c), base).join(","), i);
    }
    this._monos = null; this._suffix = null;
  }
  keyOf(ph, rs) { let k = ""; for (let j = rs; j < ph.length; j++) k += String.fromCharCode(48 + base(ph[j])); return k; }
  /** Everything we know about a word: its pronunciations, or a guess when it isn't in the dictionary */
  entries(word) {
    const w = norm(word);
    const ids = this.byWord.get(w);
    if (ids) return ids.map((i) => ({ id: i, ph: this.P[i], rs: this.rs[i], syl: this.syl[i], key: this.key[i], guess: false }));
    const g = this.guess(w);
    return g ? [g] : [];
  }
  info(i) { return { w: this.W[i], syl: this.syl[i], stress: stressString(this.P[i]), level: this.LV[i], pos: posList(this.FL[i]), explicit: !!(this.FL[i] & EXPLICIT) }; }

  // ---------- made-up words: borrow the ending of the closest real word ----------
  guess(w) {
    if (!/^[a-z']+$/.test(w)) return null;
    const syl = syllableGuess(w);
    // no vowel letters ("skrrt", "brr", "hmm"): an r makes it "er", otherwise "uh"
    if (!/[aeiouy]/.test(w)) {
      const m = /(r+)([^r]*)$/.exec(w);
      const ph = m ? [vowelCode("ER", 1), ...lettersToCons(m[2])] : [vowelCode("AH", 1), ...lettersToCons(w.replace(/^[^m]*/, "").replace(/m+/, "m"))];
      return { id: -1, ph: Uint8Array.from(ph), rs: 0, syl: 1, guess: true };
    }
    if (!this._suffix) {
      // the most common real word for each ending of 2 to 5 letters
      this._suffix = new Map();
      for (let i = 0; i < this.W.length; i++) {
        const x = this.W[i];
        if (this.LV[i] > 7 || !/^[a-z]+$/.test(x)) continue;
        for (let k = 2; k <= 5 && k <= x.length; k++) { const s = x.slice(-k), cur = this._suffix.get(s); if (cur === undefined || this.LV[i] < this.LV[cur]) this._suffix.set(s, i); }
      }
    }
    // the ending must reach back past the last vowel letters, so the rhyme is borrowed whole
    const lastVowel = /[aeiouy]+[^aeiouy]*$/.exec(w), need = lastVowel ? lastVowel[0].length : 2;
    for (let k = Math.min(5, w.length); k >= Math.max(2, Math.min(need, 5)); k--) {
      const id = this._suffix.get(w.slice(-k));
      if (id === undefined) continue;
      const ph = this.P[id], rs = this.rs[id], tail = ph.subarray(rs);
      // the guessed word: as many syllables as its spelling suggests, rhyming like the real one
      const tailSyl = countV(tail), pre = Math.max(0, syl - tailSyl);
      const out = []; for (let s = 0; s < pre; s++) out.push(vowelCode("AH", 0));
      return { id: -1, ph: Uint8Array.from([...out, ...tail]), rs: pre, syl: pre + tailSyl, guess: true, like: this.W[id] };
    }
    return null;
  }

  // ---------- scoring two pronunciations ----------
  /** How well b rhymes with a (both from entries()): { score 0..1, kind, multi } or null */
  judge(a, b) {
    const ra = a.ph.subarray(a.rs), rb = b.ph.subarray(b.rs);
    if (!ra.length || !rb.length) return null;
    const sameOnset = a.rs > 0 && b.rs > 0 && base(a.ph[a.rs - 1]) === base(b.ph[b.rs - 1]);
    const ka = a.key ?? (a.key = this.keyOf(a.ph, a.rs)), kb = b.key ?? this.keyOf(b.ph, b.rs);
    let score, kind;
    if (ka === kb) {
      if (a.ph.length === b.ph.length && this.keyOf(a.ph, 0) === this.keyOf(b.ph, 0)) return null; // the same sound (a homophone)
      score = sameOnset ? 0.9 : 1; kind = "perfect";
    } else {
      const v = VSIM[base(ra[0]) - NC][base(rb[0]) - NC], rest = seqSim(ra.subarray(1), rb.subarray(1));
      if (v === 1 && ra.length === rb.length && familyOnly(ra, rb)) { score = 0.86 + 0.08 * rest; kind = "family"; }
      // near: the same (or a close) stressed vowel carries it; the closer the rest, the higher it ranks
      else if (v >= 0.6) { score = 0.6 * v + 0.32 * rest; kind = "near"; }
      else {
        // a consonant rhyme: the endings match, the vowels don't
        const ca = coda(ra), cb = coda(rb);
        if (!ca.length || ca.length !== cb.length || ca.some((p, i) => base(p) !== base(cb[i]))) return null;
        score = 0.42 + 0.1 * rest; kind = "consonant";
      }
    }
    // more syllables matching before the rhyme part: a multi-syllable rhyme
    let multi = countV(ra), i = a.rs - 1, j = b.rs - 1, bonus = 0;
    while (i >= 0 && j >= 0 && multi < 4) {
      while (i >= 0 && !isV(a.ph[i])) i--;
      while (j >= 0 && !isV(b.ph[j])) j--;
      if (i < 0 || j < 0) break;
      const s = VSIM[base(a.ph[i]) - NC][base(b.ph[j]) - NC];
      if (s < 0.6) break;
      multi++; bonus += 0.04 * s; i--; j--;
    }
    return { score: Math.min(1.15, score + bonus), kind, multi };
  }

  /** Every rhyme for a word. opts.kinds: which kinds to include (all by default) */
  rhymes(word, opts = {}) {
    const kinds = new Set(opts.kinds || ["perfect", "family", "near", "consonant", "phrase"]);
    const es = this.entries(word);
    if (!es.length) return { word, known: false, guess: false, results: [] };
    const best = new Map(), w0 = norm(word);
    const consider = (a, i) => {
      const x = this.W[i];
      if (x === w0 || /[^a-z' .-]/.test(x)) return;
      const j = this.judge(a, { ph: this.P[i], rs: this.rs[i], key: this.key[i] });
      if (!j || !kinds.has(j.kind) || (j.kind === "near" && j.score < 0.62)) return;
      const cur = best.get(x);
      if (!cur || cur.score < j.score) best.set(x, { w: x, id: i, ...j });
    };
    for (const a of es) {
      const key = this.keyOf(a.ph, a.rs);
      for (const i of this.perfect.get(key) || []) consider(a, i);
      if (kinds.has("family") || kinds.has("near")) {
        const v = base(a.ph[a.rs]) - NC;
        for (let u = 0; u < VOWELS.length; u++) if (VSIM[v][u] >= 0.6) for (const i of this.byVowel.get(NC + u) || []) consider(a, i);
      }
      if (kinds.has("consonant")) {
        const c = coda(a.ph.subarray(a.rs));
        if (c.length) for (const i of this.byCoda.get(Array.from(c, base).join(",")) || []) consider(a, i);
      }
    }
    let results = [...best.values()].map((r) => ({ ...this.info(r.id), kind: r.kind, score: round(r.score), multi: r.multi }));
    if (kinds.has("phrase")) results.push(...this.phrases(es[0], w0));
    results.sort(rank);
    const first = es[0];
    return { word: w0, known: !first.guess, guess: first.guess, like: first.like || "", pron: arpabet(first.ph), syllables: first.syl, stress: stressString(first.ph), results };
  }

  // two common short words that rhyme with the last two syllables: "orange" / "door hinge", "fire" / "buy her"
  phrases(a, w0) {
    const ph = a.ph, vs = []; for (let k = 0; k < ph.length; k++) if (isV(ph[k])) vs.push(k);
    if (vs.length < 2) return [];
    const va = vs[vs.length - 2], vb = vs[vs.length - 1];
    const mid = ph.subarray(va + 1, vb), tail = ph.subarray(vb);
    if (!this._monos) {
      this._monos = new Map();
      for (let i = 0; i < this.W.length; i++) if (this.syl[i] === 1 && this.LV[i] <= 4 && /^[a-z]+$/.test(this.W[i]) && !(this.FL[i] & EXPLICIT)) push(this._monos, this.sv[i], i);
    }
    const near = (v, min) => { const out = []; for (let u = 0; u < VOWELS.length; u++) if (VSIM[base(v) - NC][u] >= min) out.push(...(this._monos.get(NC + u) || [])); return out; };
    // the first word: one of the most common short words, its sounds after the vowel worked out once
    const As = near(ph[va], 0.7).filter((i) => this.LV[i] <= 1).sort((x, y) => this.LV[x] - this.LV[y] || this.W[x].length - this.W[y].length).slice(0, 160).map((i) => {
      const p = this.P[i]; let v = 0; while (!isV(p[v])) v++;
      return { i, v: p[v], after: Array.from(p.subarray(v + 1)), vs: VSIM[base(ph[va]) - NC][base(p[v]) - NC] };
    });
    const Bs = [];
    for (const i of near(ph[vb], stressOf(ph[vb]) === 0 ? 0.45 : 0.7)) {
      const p = this.P[i]; let v = 0; while (!isV(p[v])) v++;
      if (stressOf(p[v]) !== 1 || FUNCTION.has(this.W[i]) || this.W[i].length < 3) continue;
      // the rhyming word's vowel takes the stress, so an unstressed "uh" can be any short vowel
      const t2 = stressOf(ph[vb]) === 0 ? Uint8Array.from([p[v], ...tail.subarray(1)]) : tail;
      // an unstressed "uh" is sung loosely: any short vowel near it fits (or-ange / door hinge)
      const vv = VSIM[base(ph[vb]) - NC][base(p[v]) - NC], vfit = stressOf(ph[vb]) === 0 && vv >= 0.45 ? Math.max(vv, 0.85) : vv;
      const s = 0.25 * vfit + 0.75 * seqSim(t2, p.subarray(v));
      if (s >= 0.72) Bs.push({ i, s, onset: p.subarray(0, v) });
    }
    Bs.sort((x, y) => y.s - x.s);
    const out = [];
    const join = new Uint8Array(16);
    for (const b of Bs.slice(0, 30)) for (const A of As) {
      const ai = A.i;
      // the sounds between the two vowels: every extra or wrong one costs (buy her, not bind her)
      const jl = Math.min(16, A.after.length + b.onset.length);
      join.set(A.after.slice(0, 16)); join.set(b.onset.subarray(0, jl - Math.min(A.after.length, 16)), Math.min(A.after.length, 16));
      const jv = join.subarray(0, jl), bridge = 1 / (1 + Math.max(0, (1 - seqSim(mid, jv)) * Math.max(mid.length, jl, 1)));
      const vs2 = A.vs;
      const score = 0.45 * b.s + 0.3 * vs2 + 0.25 * bridge;
      if (score < 0.8) continue;
      const little = FUNCTION.has(this.W[ai]) ? 0.03 : 0;
      const w = this.W[ai] + " " + this.W[b.i];
      if (w === w0) continue;
      out.push({ w, syl: 2, stress: "11", level: Math.max(this.LV[ai], this.LV[b.i]), pos: [], explicit: false, kind: "phrase", score: round(score * 0.9 - little), multi: 2 });
    }
    // a real word before a little one ("fly her" before "i her"), and no one word in every pair
    out.sort((x, y) => y.score - x.score || x.level - y.level);
    const seen = new Set(), perA = new Map(), perB = new Map(), keep = [];
    for (const r of out) {
      const [a, b] = r.w.split(" ");
      if (seen.has(r.w) || (perA.get(a) || 0) >= 2 || (perB.get(b) || 0) >= 5) continue;
      seen.add(r.w); perA.set(a, (perA.get(a) || 0) + 1); perB.set(b, (perB.get(b) || 0) + 1); keep.push(r);
      if (keep.length >= 30) break;
    }
    return keep;
  }

  /** Does `word` rhyme with `other`? (for the "also rhymes with" filter) */
  rhymesWith(word, other, kind = "near") {
    const A = this.entries(other), B = this.entries(word);
    for (const a of A) for (const b of B) {
      const j = this.judge(a, b);
      if (!j) continue;
      if (kind === "perfect" ? j.kind === "perfect" : j.score >= 0.62 || j.kind === "family" || j.kind === "consonant" && kind === "any") return j;
    }
    return null;
  }

  /** Syllables and stress for one word (a phrase adds up its words) */
  wordInfo(word) {
    const parts = norm(word).split(/[\s-]+/).filter(Boolean);
    let syl = 0, lo = 0, hi = 0, stress = "", guess = false;
    for (const p of parts) {
      const es = this.entries(p), e = es[0];
      if (e) {
        syl += e.syl; stress += e.guess ? "?".repeat(e.syl) : stressString(e.ph); guess ||= e.guess;
        // "every" is ev-ry or ev-er-y: both are right, so say so
        lo += Math.min(...es.map((x) => x.syl)); hi += Math.max(...es.map((x) => x.syl));
      } else { const s = syllableGuess(p); syl += s; lo += s; hi += s; stress += "?".repeat(s); guess = true; }
    }
    return { w: word, syl, min: lo, max: hi, stress, guess };
  }
}

// ---------- filters: any list of words or rhyme results ----------
/**
 * opts: { syllables: n | [min, max], stressEnd: "1" | "0" | "10" ..., rhymesWith: word | { word, kind: "perfect"|"near" },
 *         related: Set of words (the worker fills it from relatedTo), startsWith, contains, endsWith,
 *         pos: "n"|"v"|"a"|"r" or a list, common: SCOWL size (10 most common ... 95), clean: true }
 */
export function filterList(lex, list, opts = {}) {
  const want = (x) => (typeof x === "string" ? { ...lex.wordInfo(x), ...firstInfo(lex, x) } : x);
  let out = list.map(want);
  const o = opts;
  if (o.syllables !== undefined && o.syllables !== null && o.syllables !== "") {
    const [lo, hi] = Array.isArray(o.syllables) ? o.syllables : [o.syllables, o.syllables];
    out = out.filter((r) => r.syl >= (lo ?? 0) && r.syl <= (hi ?? 99));
  }
  if (o.stressEnd) out = out.filter((r) => r.stress && r.stress.replace(/2/g, "1").endsWith(o.stressEnd));
  if (o.startsWith) out = out.filter((r) => r.w.startsWith(o.startsWith.toLowerCase()));
  if (o.endsWith) out = out.filter((r) => r.w.endsWith(o.endsWith.toLowerCase()));
  if (o.contains) out = out.filter((r) => r.w.includes(o.contains.toLowerCase()));
  if (o.pos) { const ps = [].concat(o.pos); out = out.filter((r) => r.pos && r.pos.some((p) => ps.includes(p))); }
  if (o.common) { const lv = LEVEL_SIZES.findIndex((s) => s >= o.common); out = out.filter((r) => r.level !== undefined && r.level <= (lv < 0 ? 9 : lv)); }
  if (o.clean) out = out.filter((r) => !r.explicit && !r.w.split(" ").some((p) => lex.byWord.has(p) && (lex.FL[lex.byWord.get(p)[0]] & EXPLICIT)));
  if (o.related) out = out.filter((r) => o.related.has(r.w));
  for (const rw of [].concat(o.rhymesWith || [])) {
    const { word, kind } = typeof rw === "string" ? { word: rw, kind: "near" } : rw;
    out = out.filter((r) => { const j = lex.rhymesWith(r.w, word, kind); if (j) r.also = { word, kind: j.kind, score: round(j.score) }; return !!j; });
  }
  return out;
}
function firstInfo(lex, w) {
  const ids = lex.byWord.get(norm(w));
  return ids ? { level: lex.LV[ids[0]], pos: posList(lex.FL[ids[0]]), explicit: !!(lex.FL[ids[0]] & EXPLICIT) } : { level: 10, pos: [], explicit: false };
}

// ---------- syllables for whole lines (lyric meter) ----------
export function syllablesOf(lex, text) {
  const lines = String(text ?? "").split(/\r?\n/).map((line) => {
    const words = (line.match(/[A-Za-zÀ-ɏ']+(?:-[A-Za-z']+)*/g) || []).map((t) => {
      const i = lex.wordInfo(t.replace(/^'+|'+$/g, "").toLowerCase());
      return { w: t, syllables: i.syl, min: i.min, max: i.max, stress: i.stress, guess: i.guess };
    });
    const sum = (k) => words.reduce((a, x) => a + x[k], 0);
    return { text: line, syllables: sum("syllables"), min: sum("min"), max: sum("max"), words };
  });
  return { lines, total: lines.reduce((a, l) => a + l.syllables, 0) };
}

// ---------- the thesaurus (a shard entry from th-xx.json) ----------
const POSNAME = { n: "noun", v: "verb", a: "adjective", r: "adverb" };
export function shardKey(word) {
  const w = norm(word);
  const a = w[0] >= "a" && w[0] <= "z" ? w[0] : "_", b = w[1] >= "a" && w[1] <= "z" ? w[1] : "_";
  return a + b;
}
/** A thesaurus answer from the word's shard entry (or null), with syllables for every word */
export function thesaurusOf(lex, word, entry) {
  const w = norm(word);
  if (!entry) return { word: w, found: false, senses: [], more: [], related: [] };
  const tag = (list) => list.map((x) => { const i = lex.wordInfo(x); return { w: x, syl: i.syl }; });
  const senses = (entry.s || []).map(([pos, def, ex, syn, ant, up, down, sim]) => ({
    pos: POSNAME[pos] || pos, def, example: ex, synonyms: tag(syn), antonyms: tag(ant), broader: tag(up), narrower: tag(down), similar: tag(sim) }));
  const more = tag(entry.m || []);
  // close synonyms first (everyday ones leading), then the broad list in its own order, then broader and narrower words
  const seen = new Set([w]), related = [];
  const add = (list) => { for (const x of list) { const k = x.w.toLowerCase(); if (!seen.has(k)) { seen.add(k); related.push(x); } } };
  const lv = (x) => (x.w.includes(" ") ? 11 : firstInfo(lex, x.w).level);
  add(senses.flatMap((s) => [...s.synonyms, ...s.similar]).sort((x, y) => lv(x) - lv(y)));
  add(more);
  add(senses.flatMap((s) => [...s.broader, ...s.narrower]));
  return { word: w, found: true, senses, more, related };
}
/** Every word that means something like `word` (for the "related to" filter), lowercased */
export function relatedSet(entry) {
  const s = new Set();
  if (!entry) return s;
  for (const sense of entry.s || []) for (const list of [sense[3], sense[5], sense[6], sense[7]]) for (const x of list) s.add(x.toLowerCase());
  for (const x of entry.m || []) s.add(x.toLowerCase());
  return s;
}

/** A word's pronunciation in plain ARPAbet, its syllables, stress and how common it is */
export function lookupOf(lex, word) {
  const es = lex.entries(word), w = norm(word);
  const ids = lex.byWord.get(w);
  return { word: w, known: !!ids, guess: !!(es[0]?.guess), like: es[0]?.like || "",
    prons: es.map((e) => ({ arpabet: arpabet(e.ph), syllables: e.syl, stress: e.guess ? "?".repeat(e.syl) : stressString(e.ph) })),
    level: ids ? lex.LV[ids[0]] : 10, common: ids ? LEVEL_SIZES[lex.LV[ids[0]]] ?? null : null, pos: ids ? posList(lex.FL[ids[0]]) : [], explicit: ids ? !!(lex.FL[ids[0]] & EXPLICIT) : false };
}

// ---------- small helpers ----------
const norm = (w) => String(w ?? "").trim().toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ");
const round = (x) => Math.round(x * 1000) / 1000;
function push(map, k, v) { const a = map.get(k); if (a) a.push(v); else map.set(k, [v]); }
const countV = (ph) => { let n = 0; for (const p of ph) if (isV(p)) n++; return n; };
function coda(ph) { let c = ph.length; while (c > 0 && !isV(ph[c - 1])) c--; return Array.from(ph.subarray(c)); }
function familyOnly(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (isV(a[i]) !== isV(b[i])) return false;
    if (isV(a[i]) ? base(a[i]) !== base(b[i]) : CSIM[a[i]][b[i]] < 0.6) return false;
  }
  return true;
}
export function stressString(ph) { let s = ""; for (const p of ph) if (isV(p)) s += stressOf(p); return s; }
const PH_NAMES = [...CONS, ...VOWELS.flatMap((v) => [v + "0", v + "1", v + "2"])];
export function arpabet(ph) { return Array.from(ph, (p) => PH_NAMES[p]).join(" "); }
function posList(f) { return Object.entries(POS).filter(([, b]) => f & b).map(([k]) => k); }
function rank(x, y) {
  const tier = (r) => (r.kind === "perfect" ? 0 : r.kind === "family" ? 1 : r.kind === "phrase" ? 3 : r.kind === "consonant" ? 4 : 2);
  // perfect rhymes first, common words before rare ones; near rhymes by how close they are
  if (tier(x) !== tier(y)) return tier(x) - tier(y);
  if (x.kind === "near" || x.kind === "phrase") { const d = y.score - x.score; if (Math.abs(d) > 0.06) return d; }
  if (x.level !== y.level) return x.level - y.level;
  if (y.multi !== x.multi) return y.multi - x.multi;
  return y.score - x.score || x.w.length - y.w.length || (x.w < y.w ? -1 : 1);
}
// short words that carry no rhyme of their own ("i are", "bore an")
const FUNCTION = new Set("a an the of to in on at by for from with and or but nor so as is are was were be been am it its it's this that these those he she we they i my our your his their do does did has have had will would shall should can could may might must not no yes if then than there here what when where who whom which why how all any each".split(" "));
const vowelCode = (v, s) => NC + VOWELS.indexOf(v) * 3 + s;
// spelling to consonant sounds, for the endings of made-up words
function lettersToCons(s) {
  const out = [], m = { b: "B", c: "K", d: "D", f: "F", g: "G", h: "HH", j: "JH", k: "K", l: "L", m: "M", n: "N", p: "P", q: "K", r: "R", s: "S", t: "T", v: "V", w: "W", x: "K", z: "Z" };
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2);
    if (two === "sh") { out.push(CONS.indexOf("SH")); i++; continue; }
    if (two === "ch") { out.push(CONS.indexOf("CH")); i++; continue; }
    if (two === "th") { out.push(CONS.indexOf("TH")); i++; continue; }
    if (two === "ng") { out.push(CONS.indexOf("NG")); i++; continue; }
    if (two === "ck") { out.push(CONS.indexOf("K")); i++; continue; }
    const c = m[s[i]];
    if (c && (out.length === 0 || CONS[out[out.length - 1]] !== c)) out.push(CONS.indexOf(c));
    if (s[i] === "x") out.push(CONS.indexOf("S"));
  }
  return out;
}
/** Syllables from spelling, for words the dictionary doesn't have */
export function syllableGuess(w) {
  w = String(w).toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (!/[aeiouy]/.test(w)) return 1;
  let n = (w.match(/[aeiouy]+/g) || []).length;
  if (/[^aeiouy]e$/.test(w) && !/[^aeiouy]le$/.test(w) && n > 1) n--;          // silent e (but "table")
  if (/[^aeiouytd]ed$/.test(w) && n > 1) n--;                                    // "jumped", not "wanted"
  if (/[^aeiouy]es$/.test(w) && !/(s|x|z|ch|sh|ge|ce)es$/.test(w) && n > 1) n--; // "makes", not "boxes"
  n += (w.replace(/(t|s|c|g|x)i(a|o|u)/g, "").match(/(ia|io|ua|eo|iu)/g) || []).length;  // "lion", "piano", not "nation"
  return Math.max(1, n);
}
