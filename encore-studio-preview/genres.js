// Genres for the export dropdown, grouped. Broad enough to cover what
// distributors and stores ask for; the first entry in each group is the
// group's main genre.
export const GENRES = {
  "Alternative": ["Alternative", "Alt-Rock", "Dream Pop", "Emo", "Grunge", "Indie Pop", "Indie Rock", "Math Rock", "Midwest Emo", "Noise Rock", "Post-Hardcore", "Post-Punk", "Post-Rock", "Screamo", "Shoegaze", "Slowcore"],
  "Punk": ["Punk", "Anarcho-Punk", "Crust Punk", "Folk Punk", "Garage Punk", "Hardcore", "Horror Punk", "Melodic Hardcore", "Oi!", "Pop Punk", "Riot Grrrl", "Ska Punk", "Skate Punk", "Street Punk"],
  "Rock": ["Rock", "Arena Rock", "Art Rock", "Blues Rock", "Classic Rock", "Garage Rock", "Glam Rock", "Hard Rock", "Progressive Rock", "Psychedelic Rock", "Rockabilly", "Soft Rock", "Southern Rock", "Stoner Rock", "Surf Rock"],
  "Metal": ["Metal", "Black Metal", "Death Metal", "Deathcore", "Djent", "Doom Metal", "Grindcore", "Heavy Metal", "Mathcore", "Metalcore", "Nu Metal", "Post-Metal", "Power Metal", "Progressive Metal", "Sludge Metal", "Thrash Metal"],
  "Folk & Americana": ["Folk", "Alt-Country", "Americana", "Anti-Folk", "Bluegrass", "Celtic", "Folk Rock", "Indie Folk", "Old-Time", "Roots", "Singer-Songwriter"],
  "Country": ["Country", "Country Pop", "Country Rock", "Honky Tonk", "Outlaw Country", "Red Dirt", "Western"],
  "Pop": ["Pop", "Art Pop", "Bedroom Pop", "Chamber Pop", "Electropop", "Hyperpop", "J-Pop", "K-Pop", "Power Pop", "Synth-Pop", "Teen Pop"],
  "Hip-Hop & Rap": ["Hip-Hop", "Boom Bap", "Cloud Rap", "Conscious Hip-Hop", "Drill", "Emo Rap", "Grime", "Lo-fi Hip-Hop", "Phonk", "Rap", "Trap", "Underground Hip-Hop"],
  "R&B & Soul": ["R&B", "Alternative R&B", "Contemporary R&B", "Disco", "Funk", "Motown", "Neo-Soul", "Quiet Storm", "Soul"],
  "Electronic": ["Electronic", "Ambient", "Breakbeat", "Chillwave", "Chiptune", "Darkwave", "Downtempo", "EBM", "Electro", "Glitch", "IDM", "Industrial", "Synthwave", "Trip-Hop", "Vaporwave", "Witch House"],
  "Dance": ["Dance", "Deep House", "Drum & Bass", "Dubstep", "EDM", "Footwork", "Future Bass", "Hardstyle", "House", "Jungle", "Tech House", "Techno", "Trance", "UK Garage"],
  "Jazz & Blues": ["Jazz", "Bebop", "Big Band", "Blues", "Chicago Blues", "Delta Blues", "Jazz Fusion", "Smooth Jazz", "Swing"],
  "Latin": ["Latin", "Bachata", "Banda", "Bossa Nova", "Corridos", "Cumbia", "Latin Pop", "Latin Rock", "Reggaeton", "Regional Mexican", "Salsa", "Tango"],
  "Reggae & Caribbean": ["Reggae", "Calypso", "Dancehall", "Dub", "Rocksteady", "Ska", "Soca"],
  "World": ["World", "Afrobeat", "Afrobeats", "Amapiano", "Balkan", "Bollywood", "Fado", "Flamenco", "Highlife", "Klezmer", "Middle Eastern", "Polka"],
  "Classical & Score": ["Classical", "Chamber Music", "Choral", "Contemporary Classical", "Film Score", "Minimalism", "Musical Theatre", "New Age", "Opera", "Soundtrack", "Video Game Music"],
  "Christian & Gospel": ["Christian", "CCM", "Christian Rock", "Gospel", "Worship"],
  "Other": ["Acoustic", "Children's", "Comedy", "Easy Listening", "Experimental", "Holiday", "Instrumental", "Lounge", "Meditation", "Noise", "Poetry", "Spoken Word", "Other"],
};

export function fillGenreSelect(select) {
  for (const [group, list] of Object.entries(GENRES)) {
    const og = document.createElement("optgroup");
    og.label = group;
    for (const g of list) { const o = document.createElement("option"); o.value = g; o.textContent = g; og.append(o); }
    select.append(og);
  }
}
