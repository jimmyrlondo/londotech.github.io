// ENCORE. Voicebank: the recording lists (what to sing, one clip per line).
// Each entry: { key, kana, hint }. key is the romaji file name and the main alias;
// kana is the hiragana alias OpenUtau's Japanese lyrics use. Plain ES module.

const row = (cons, kana, keys) => keys.map((k, i) => ({ key: k, kana: kana[i], group: cons }));

const BASIC = [
  ...row("vowels", ["あ", "い", "う", "え", "お"], ["a", "i", "u", "e", "o"]),
  ...row("k", ["か", "き", "く", "け", "こ"], ["ka", "ki", "ku", "ke", "ko"]),
  ...row("s", ["さ", "し", "す", "せ", "そ"], ["sa", "shi", "su", "se", "so"]),
  ...row("t", ["た", "ち", "つ", "て", "と"], ["ta", "chi", "tsu", "te", "to"]),
  ...row("n", ["な", "に", "ぬ", "ね", "の"], ["na", "ni", "nu", "ne", "no"]),
  ...row("h", ["は", "ひ", "ふ", "へ", "ほ"], ["ha", "hi", "fu", "he", "ho"]),
  ...row("m", ["ま", "み", "む", "め", "も"], ["ma", "mi", "mu", "me", "mo"]),
  ...row("y", ["や", "ゆ", "よ"], ["ya", "yu", "yo"]),
  ...row("r", ["ら", "り", "る", "れ", "ろ"], ["ra", "ri", "ru", "re", "ro"]),
  ...row("w", ["わ", "を", "ん"], ["wa", "wo", "n"]),
  ...row("g", ["が", "ぎ", "ぐ", "げ", "ご"], ["ga", "gi", "gu", "ge", "go"]),
  ...row("z", ["ざ", "じ", "ず", "ぜ", "ぞ"], ["za", "ji", "zu", "ze", "zo"]),
  ...row("d", ["だ", "で", "ど"], ["da", "de", "do"]),
  ...row("b", ["ば", "び", "ぶ", "べ", "ぼ"], ["ba", "bi", "bu", "be", "bo"]),
  ...row("p", ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"], ["pa", "pi", "pu", "pe", "po"]),
  ...row("ky", ["きゃ", "きゅ", "きょ"], ["kya", "kyu", "kyo"]),
  ...row("sh", ["しゃ", "しゅ", "しょ"], ["sha", "shu", "sho"]),
  ...row("ch", ["ちゃ", "ちゅ", "ちょ"], ["cha", "chu", "cho"]),
  ...row("ny", ["にゃ", "にゅ", "にょ"], ["nya", "nyu", "nyo"]),
  ...row("hy", ["ひゃ", "ひゅ", "ひょ"], ["hya", "hyu", "hyo"]),
  ...row("my", ["みゃ", "みゅ", "みょ"], ["mya", "myu", "myo"]),
  ...row("ry", ["りゃ", "りゅ", "りょ"], ["rya", "ryu", "ryo"]),
  ...row("gy", ["ぎゃ", "ぎゅ", "ぎょ"], ["gya", "gyu", "gyo"]),
  ...row("j", ["じゃ", "じゅ", "じょ"], ["ja", "ju", "jo"]),
  ...row("by", ["びゃ", "びゅ", "びょ"], ["bya", "byu", "byo"]),
  ...row("py", ["ぴゃ", "ぴゅ", "ぴょ"], ["pya", "pyu", "pyo"]),
];

// Sounds Japanese doesn't have natively; they let the voice sing English and other languages better.
const EXTENDED = [
  ...row("foreign", ["てぃ", "とぅ", "でぃ", "どぅ", "すぃ", "ずぃ"], ["ti", "tu", "di", "du", "si", "zi"]),
  ...row("f", ["ふぁ", "ふぃ", "ふぇ", "ふぉ"], ["fa", "fi", "fe", "fo"]),
  ...row("v", ["ゔぁ", "ゔぃ", "ゔ", "ゔぇ", "ゔぉ"], ["va", "vi", "vu", "ve", "vo"]),
  ...row("w2", ["うぃ", "うぇ", "いぇ"], ["wi", "we", "ye"]),
  ...row("breath", ["息"], ["br"]),
];

// ---- English (ARPAsing) ----
// OpenUtau's English mode builds words from diphones: the join between two sounds ("b aa", "aa b"),
// plus a sound starting from silence ("- b") or ending into it ("b -"). Each line here is a short
// phrase sung one syllable per beat; the recorder cuts it into every join it contains.
export const EN_VOWELS = ["aa", "ae", "ah", "ao", "aw", "ay", "eh", "er", "ey", "ih", "iy", "ow", "oy", "uh", "uw"];
export const EN_CONSONANTS = ["b", "ch", "d", "dh", "f", "g", "hh", "jh", "k", "l", "m", "n", "ng", "p", "r", "s", "sh", "t", "th", "v", "w", "y", "z", "zh"];
export const isVowel = (p) => EN_VOWELS.includes(p);
const V_SPELL = { aa: "ah", ae: "a", ah: "uh", ao: "aw", aw: "ow", ay: "eye", eh: "eh", er: "er", ey: "ay", ih: "i", iy: "ee", ow: "oh", oy: "oy", uh: "u", uw: "oo" };
const V_WORD = { aa: "father", ae: "cat", ah: "cup", ao: "law", aw: "cow", ay: "buy", eh: "bed", er: "her", ey: "say", ih: "sit", iy: "see", ow: "go", oy: "boy", uh: "book", uw: "food" };
const C_SPELL = { hh: "h", jh: "j" };
const C_WORD = { dh: 'the "th" in this (buzzing)', th: 'the "th" in thin (no buzz)', zh: 'the "s" in vision', ng: 'the "ng" in sing', jh: 'the "j" in jam', ch: 'the "ch" in chip', sh: 'the "sh" in ship', hh: 'the "h" in hat', r: 'an American "r"', y: 'the "y" in yes' };
const spell = (p) => (isVowel(p) ? V_SPELL[p] : C_SPELL[p] ?? p);
// consonant pairs that can start an English syllable (sung together at the start of the next beat)
const ONSETS = new Set(["s t", "s p", "s k", "s m", "s n", "s l", "s w", "p l", "b l", "k l", "g l", "f l", "p r", "b r", "t r", "d r", "k r", "g r", "f r", "th r", "sh r", "k w", "t w"]);
const CLUSTERS = [...ONSETS, "n t", "n d", "n s", "n z", "m p", "m z", "ng k", "ng z", "l d", "l t", "l z", "l f", "l k", "r t", "r d", "r s", "r z", "r k", "r m", "r n", "r l", "k s", "t s", "d z", "p s", "k t", "f t", "p t"];

/** Splits a phone list into sung syllables, one per beat: [{ phones, text }]. */
export function syllables(phones) {
  const vi = phones.map((p, i) => (isVowel(p) ? i : -1)).filter((i) => i >= 0);
  const out = vi.map(() => []);
  phones.forEach((p, i) => {
    const next = vi.findIndex((v) => v >= i);
    if (next < 0) { out[vi.length - 1].push(p); return; } // after the last vowel: its ending
    if (vi[next] === i || next === 0) { out[next].push(p); return; } // the vowel itself, or before the first vowel
    // between two vowels: a pair that can't start a syllable splits across the beat
    const prevV = vi[next - 1], cons = phones.slice(prevV + 1, vi[next]);
    if (cons.length === 2 && !ONSETS.has(cons.join(" ")) && i === prevV + 1) { out[next - 1].push(p); return; }
    if (p === "ng" && cons.length === 1) { out[next - 1].push(p); return; } // "ahng oo", never "ah ngoo"
    out[next].push(p);
  });
  return out.map((ph) => ({ phones: ph, text: ph.map(spell).join("") }));
}

function enEntry(n, group, phones) {
  const syl = syllables(phones);
  const short = group === "en-c" ? spell(phones.find((p) => !isVowel(p))) : group === "en-cc" ? phones.filter((p) => !isVowel(p)).slice(0, 2).map(spell).join("") : phones.slice(0, 2).map(spell).join(" ");
  return { key: "en" + String(n).padStart(3, "0"), kana: syl.map((s) => s.text).join(" "), group, lang: "en", phones, short };
}
// every ordered pair of different vowels, chained so each line flows into the next (an Euler circuit)
function vowelChain() {
  const left = new Map(EN_VOWELS.map((v) => [v, EN_VOWELS.filter((w) => w !== v)]));
  const stack = [EN_VOWELS[0]], path = [];
  while (stack.length) {
    const v = stack[stack.length - 1], nxt = left.get(v);
    if (nxt.length) stack.push(nxt.shift()); else path.push(stack.pop());
  }
  return path.reverse();
}
function buildEnglish() {
  const out = [];
  let n = 1;
  const triples = [["aa", "uw", "iy"], ["ae", "ow", "ih"], ["ah", "ey", "eh"], ["ao", "ay", "er"], ["aw", "oy", "uh"]];
  for (const c of EN_CONSONANTS) {
    for (const [a, b, d] of triples) {
      let ph;
      if (c === "ng") ph = [a, c, b, c, d, c]; // nothing in English starts with ng
      else if (c === "hh" || c === "w" || c === "y") ph = [c, a, c, b, c, d]; // or ends with h, w, y
      else ph = [c, a, c, b, c, d, c];
      out.push(enEntry(n++, "en-c", ph));
    }
  }
  const chain = vowelChain();
  for (let i = 0; i + 1 < chain.length; i += 5) out.push(enEntry(n++, "en-vv", chain.slice(i, i + 6)));
  // vowels that never start or end a glide line yet get a one-vowel line ("- aa" and "aa -")
  const vv = out.filter((e) => e.group === "en-vv");
  for (const v of EN_VOWELS) if (!vv.some((e) => e.phones[0] === v) || !vv.some((e) => e.phones[e.phones.length - 1] === v)) out.push(enEntry(n++, "en-vv", [v]));
  const vs = ["aa", "iy", "uw", "ae", "ow", "eh", "ah", "ey"];
  for (let i = 0; i < CLUSTERS.length; i += 3) {
    const ph = [vs[(i / 3) % vs.length]];
    CLUSTERS.slice(i, i + 3).forEach((cl, j) => ph.push(...cl.split(" "), vs[(i / 3 + j + 1) % vs.length]));
    out.push(enEntry(n++, "en-cc", ph));
  }
  return out;
}
const ENGLISH = buildEnglish();

/** Every join (diphone) a line produces, in order, with "-" for silence. */
export function diphonesOf(phones) {
  const s = ["-", ...phones, "-"], out = [];
  for (let i = 0; i + 1 < s.length; i++) out.push(s[i] + " " + s[i + 1]);
  return out;
}

export const LISTS = {
  basic: { name: "Japanese CV, basic", note: "The classic starter voicebank: every Japanese syllable once. About 15 to 20 minutes per note.", entries: BASIC },
  extended: { name: "Japanese CV, extended", note: "Basic plus sounds that help with English lyrics (ti, fa, va, wi...) and a breath. About 20 to 25 minutes per note.", entries: [...BASIC, ...EXTENDED] },
  english: { name: "English (ARPAsing)", note: `For OpenUtau's English mode. ${ENGLISH.length} short phrases, sung one syllable per beat; each one is cut into the joins between its sounds. About an hour per note.`, entries: ENGLISH },
};
/** Every entry of every list, by key (for exporting a bank recorded with more than one list). */
export const ALL_ENTRIES = new Map(Object.values(LISTS).flatMap((l) => l.entries).map((e) => [e.key, e]));

/** How to sing a line, in plain words. */
export function hintFor(entry) {
  if (entry.lang === "en") {
    const syl = syllables(entry.phones), last = syl[syl.length - 1].phones, endC = !isVowel(last[last.length - 1]);
    if (entry.group === "en-vv") return syl.length === 1 ? `Sing "${syl[0].text}" on the note and hold it.` : `Glide from vowel to vowel, one per beat, without stopping your voice: ${syl.map((x) => x.text).join(", ")}.`;
    return `Sing one syllable per beat, smoothly, all on the note: ${syl.map((x) => x.text).join(", ")}. Hold each vowel until the next beat${endC ? `, then finish with the "${spell(last[last.length - 1])}"` : ""}.`;
  }
  if (entry.key === "br") return "Take one natural breath in, through the mouth. No voice.";
  if (entry.custom) return "Anything you like: a shout, a laugh, a honk. Keep it the same length each time you redo it.";
  if (entry.key === "n") return "Hum \"nn\" on the note with your mouth closed, then hold it.";
  if (entry.group === "vowels") return `Sing a clean "${entry.key}" on the note and hold it steady. No slide into the note.`;
  return `Sing "${entry.key}" once, right on the beat, and hold the vowel steady until the light goes off.`;
}

// How each sound is said, for English speakers. Vowels are always pure and short (no glide at the end).
const VOWEL_SAY = { a: "ah", i: "ee", u: "oo", e: "eh", o: "oh" };
const CONS_SAY = { k: "k", s: "s", t: "t", n: "n", h: "h", m: "m", y: "y", r: "r", w: "w", g: "g", z: "z", d: "d", b: "b", p: "p", f: "f", v: "v", j: "j", sh: "sh", ch: "ch", ts: "ts" };
const SPECIAL = {
  a: "\"ah\" as in father", i: "\"ee\" as in see", u: "\"oo\" as in food, with relaxed lips (not pushed forward)", e: "\"eh\" as in bed", o: "\"oh\" as in go, but short: don't let it turn into \"oh-w\"",
  n: "a hum through the nose, mouth closed, like \"mm\" but with the tongue up",
  shi: "\"she\"", chi: "\"chee\" as in cheese", tsu: "\"tsoo\": the \"ts\" from the end of cats, then \"oo\"", fu: "\"foo\", but blow softly through barely open lips; teeth don't touch the lip",
  ji: "\"jee\" as in jeep", zu: "\"dzoo\", a soft z with a tiny d in front", wo: "\"oh\" (the w is almost silent)",
  hi: "\"hee\", with a little breathy hiss like the h in huge", ti: "\"tee\"", tu: "\"too\"", di: "\"dee\"", du: "\"doo\"", si: "\"see\"", zi: "\"zee\"", ye: "\"yeh\"", wi: "\"wee\"", we: "\"weh\"",
};
/** Plain-English pronunciation guide for one sound. */
export function sayFor(entry) {
  if (entry.lang === "en") {
    const vs = [...new Set(entry.phones.filter(isVowel))], cs = [...new Set(entry.phones.filter((p) => C_WORD[p]))];
    return [...vs.map((v) => `"${V_SPELL[v]}" as in ${V_WORD[v]}`), ...cs.map((c) => `"${spell(c)}" is ${C_WORD[c]}`)].join("; ") + ".";
  }
  if (entry.custom || entry.key === "br") return "";
  if (SPECIAL[entry.key]) return "Say it like " + SPECIAL[entry.key] + ".";
  const k = entry.key, v = k.slice(-1), c = k.slice(0, -1);
  const vowel = VOWEL_SAY[v] ?? v;
  if (c.startsWith("r")) return `Say it like "${c.length > 1 ? "ry" : "r"}${vowel}", with a quick tap of the tongue: halfway between r, l and d (like the "tt" in American "butter").`;
  if (c.length === 2 && c.endsWith("y")) return `Say it like "${c[0]}y${vowel}", one quick syllable (not "${c[0]}ee-${vowel}").`;
  return `Say it like "${(CONS_SAY[c] ?? c)}${vowel}".`;
}

/** A custom extra (honk, laugh, shout...). Names become file names, so keep them simple. */
export function customEntry(name) {
  const key = String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  if (!key) return null;
  return { key: "x_" + key, kana: key, group: "extras", custom: true, label: String(name).trim().slice(0, 40) };
}
