// ENCORE. Compose: ready-made line-ups, so a new score starts with the right
// instruments in the right order, clefs and transpositions included. Names are
// the page's instrument names (compose.js INSTRUMENTS: Tune's list plus piano,
// organ, harp and voices).
export const TEMPLATES = [
  { id: "blank", name: "Blank", blurb: "One staff, piano sound. Start anywhere.", parts: ["Piano"], single: true },
  { id: "lead", name: "Lead sheet", blurb: "Melody, chords and lyrics on one staff.", parts: ["Voice (soprano, alto)"] },
  { id: "piano", name: "Piano", blurb: "Grand staff, both hands.", parts: ["Piano"] },
  { id: "solo", name: "Solo instrument", blurb: "Pick the instrument; transposition handled.", parts: ["Flute"], pick: true },
  { id: "songwriter", name: "Song (voice + piano)", blurb: "The classic art song or pop demo layout.", parts: ["Voice (soprano, alto)", "Piano"] },
  { id: "band", name: "Rock band", blurb: "Vocals, two guitars, bass, keys.", parts: ["Voice (soprano, alto)", "Guitar (6-string)", "Guitar (6-string)", "Bass (4-string)", "Piano"] },
  { id: "satb", name: "Choir (SATB)", blurb: "Soprano, alto, tenor, bass, with piano.", parts: ["Voice (soprano, alto)", "Voice (soprano, alto)", "Voice (tenor)", "Voice (bass, baritone)", "Piano"], names: ["Soprano", "Alto", "Tenor", "Bass", "Piano"] },
  { id: "quartet", name: "String quartet", blurb: "Two violins, viola, cello.", parts: ["Violin / fiddle", "Violin / fiddle", "Viola", "Cello"], names: ["Violin I", "Violin II", "Viola", "Cello"] },
  { id: "brass5", name: "Brass quintet", blurb: "Two trumpets, horn, trombone, tuba.", parts: ["Trumpet / cornet (Bb)", "Trumpet / cornet (Bb)", "French horn (F)", "Trombone", "Tuba"], names: ["Trumpet 1", "Trumpet 2", "Horn in F", "Trombone", "Tuba"] },
  { id: "wind5", name: "Wind quintet", blurb: "Flute, oboe, clarinet, horn, bassoon.", parts: ["Flute", "Oboe", "Clarinet (Bb)", "French horn (F)", "Bassoon"] },
  { id: "jazz", name: "Jazz combo", blurb: "Trumpet, tenor sax, piano, bass.", parts: ["Trumpet / cornet (Bb)", "Tenor saxophone (Bb)", "Piano", "Upright / double bass"] },
  { id: "chamber", name: "Chamber orchestra", blurb: "Winds, horns, strings.", parts: ["Flute", "Oboe", "Clarinet (Bb)", "Bassoon", "French horn (F)", "Violin / fiddle", "Violin / fiddle", "Viola", "Cello", "Upright / double bass"], names: ["Flute", "Oboe", "Clarinet in Bb", "Bassoon", "Horn in F", "Violin I", "Violin II", "Viola", "Cello", "Double bass"] },
];
/** Short names for system starts after the first (the renderer has its own list; these are for the parts list) */
export const SHORT = { Soprano: "S.", Alto: "A.", Tenor: "T.", Bass: "B.", "Violin I": "Vln. I", "Violin II": "Vln. II", Viola: "Vla.", Cello: "Vc.", "Double bass": "Db." };
