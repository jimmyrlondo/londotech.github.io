// ENCORE. Vocal Synth: the recording lists (what to sing, one clip per line).
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

export const LISTS = {
  basic: { name: "Japanese CV, basic", note: "The classic starter voicebank: every Japanese syllable once. About 15 to 20 minutes per note.", entries: BASIC },
  extended: { name: "Japanese CV, extended", note: "Basic plus sounds that help with English lyrics (ti, fa, va, wi...) and a breath. About 20 to 25 minutes per note.", entries: [...BASIC, ...EXTENDED] },
};

/** How to sing a line, in plain words. */
export function hintFor(entry) {
  if (entry.key === "br") return "Take one natural breath in, through the mouth. No voice.";
  if (entry.custom) return "Anything you like: a shout, a laugh, a honk. Keep it the same length each time you redo it.";
  if (entry.key === "n") return "Hum \"nn\" on the note with your mouth closed, then hold it.";
  if (entry.group === "vowels") return `Sing a clean "${entry.key}" on the note and hold it steady. No slide into the note.`;
  return `Sing "${entry.key}" once, right on the beat, and hold the vowel steady until the light goes off.`;
}

/** A custom extra (honk, laugh, shout...). Names become file names, so keep them simple. */
export function customEntry(name) {
  const key = String(name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 24);
  if (!key) return null;
  return { key: "x_" + key, kana: key, group: "extras", custom: true, label: String(name).trim().slice(0, 40) };
}
