// Encore Tag: every field the editor knows, in plain English, and where each
// one lives in each tag format. One table drives the reader, the writer and
// the page, so a field can't be read one way and written another.
//
//   id3     an ID3v2 frame ("TIT2"), a user text frame ("TXXX:NAME"), or a
//           field with its own code in tag-id3.js ("*track", "*date", ...)
//   vorbis  the Vorbis comment name (FLAC, Ogg Vorbis, Opus); valt = other
//           names other taggers use for the same thing (read, not written)
//   mp4     an iTunes atom ("\xa9nam"), a freeform atom ("----:NAME", stored as
//           ----:com.apple.iTunes:NAME), or a coded one ("*trkn", "*tmpo")
//   riff    the RIFF INFO id written into WAV files (the id3 chunk carries
//           everything; INFO is the short list Windows Explorer shows)
// A missing entry means the format has no place for that field; `why` says so
// in plain words.

export const FIELDS = [
  // ---- the main fields: what distributors ask for when you send a song in ----
  { key: "title", label: "Title", main: true, id3: "TIT2", vorbis: "TITLE", mp4: "©nam", riff: "INAM" },
  { key: "artist", label: "Artist", main: true, hint: "The main artist only. Featured artists go in their own box.", id3: "TPE1", vorbis: "ARTIST", mp4: "©ART", riff: "IART" },
  { key: "featured", label: "Featured artist(s)", main: true, hint: "Distributors take these in their own box, not in Artist.",
    id3: "TXXX:FEATURING", vorbis: "FEATURING", mp4: "----:FEATURING" },
  { key: "album", label: "Album or release title", main: true, hint: "For a single, usually the song title.", id3: "TALB", vorbis: "ALBUM", mp4: "©alb", riff: "IPRD" },
  { key: "albumArtist", label: "Album artist", main: true, hint: "Who the album is filed under. Follows Artist until you type your own.",
    id3: "TPE2", vorbis: "ALBUMARTIST", valt: ["ALBUM ARTIST", "ALBUM_ARTIST"], mp4: "aART" },
  { key: "track", label: "Track number", main: true, type: "num", id3: "*track", vorbis: "TRACKNUMBER", mp4: "*trkn", riff: "ITRK" },
  { key: "trackTotal", label: "Total tracks", main: true, type: "num", id3: "*track", vorbis: "TRACKTOTAL", valt: ["TOTALTRACKS"], mp4: "*trkn" },
  { key: "date", label: "Release date", main: true, hint: "2026, or the full date as 2026-05-01.", id3: "*date", vorbis: "DATE", valt: ["YEAR"], mp4: "©day", riff: "ICRD" },
  { key: "genre", label: "Genre", main: true, id3: "*genre", vorbis: "GENRE", mp4: "©gen", riff: "IGNR" },
  { key: "composer", label: "Songwriter or composer", main: true, hint: "Who wrote the song. Several names: separate them with ; like Ann Lee; Bo Diaz.", id3: "TCOM", vorbis: "COMPOSER", mp4: "©wrt" },
  { key: "isrc", label: "ISRC", main: true, hint: "The recording's ID code from your distributor, like US-ABC-26-00001.", id3: "TSRC", vorbis: "ISRC", mp4: "----:ISRC" },
  { key: "barcode", label: "UPC / barcode", main: true, hint: "The release's barcode number (UPC or EAN) from your distributor.", id3: "TXXX:BARCODE", vorbis: "BARCODE", valt: ["UPC", "EAN"], mp4: "----:BARCODE" },
  { key: "label", label: "Record label", main: true, hint: "Your own name is fine if you're independent. MP3 tags call this Publisher.", id3: "TPUB", vorbis: "LABEL", valt: ["ORGANIZATION"], mp4: "----:LABEL" },
  { key: "phonographic", label: "(P) Recording copyright", main: true, hint: "Who owns the sound recording, like: 2026 Sick & Sad Records.", id3: "TPRO", vorbis: "PRODUCEDNOTICE", mp4: "----:PRODUCEDNOTICE" },
  { key: "copyright", label: "(C) Copyright", main: true, hint: "Who owns the release and artwork, like: 2026 Sick & Sad Records.", id3: "TCOP", vorbis: "COPYRIGHT", mp4: "cprt", riff: "ICOP" },
  { key: "explicit", label: "Explicit or clean", main: true, type: "explicit", hint: "Clean means an edited version of an explicit song.",
    id3: "TXXX:ITUNESADVISORY", vorbis: "ITUNESADVISORY", mp4: "*rtng" },
  { key: "language", label: "Language", main: true, hint: "The lyrics' language as a 3-letter code: eng, spa, pol... zxx means no words (instrumental).", id3: "TLAN", vorbis: "LANGUAGE", mp4: "----:LANGUAGE", riff: "ILNG" },
  { key: "lyrics", label: "Lyrics", main: true, type: "long", hint: "Plain lyrics, no timings.", id3: "*lyrics", vorbis: "LYRICS", valt: ["UNSYNCEDLYRICS"], mp4: "©lyr" },

  // ---- often used (in More fields) ----
  { key: "disc", cat: "Often used", label: "Disc number", type: "num", hint: "For sets of more than one disc.", id3: "*disc", vorbis: "DISCNUMBER", mp4: "*disk" },
  { key: "discTotal", cat: "Often used", label: "Total discs", type: "num", id3: "*disc", vorbis: "DISCTOTAL", valt: ["TOTALDISCS"], mp4: "*disk" },
  { key: "bpm", cat: "Often used", label: "BPM", type: "num", hint: "Tempo in beats per minute.", id3: "TBPM", vorbis: "BPM", mp4: "*tmpo" },
  { key: "key", cat: "Often used", label: "Key", hint: "The song's musical key, like Am or F#.", id3: "TKEY", vorbis: "INITIALKEY", valt: ["KEY"], mp4: "----:initialkey" },
  { key: "comment", cat: "Often used", label: "Comment", type: "long", hint: "A note that players show with the song.", id3: "*comment", vorbis: "COMMENT", mp4: "©cmt", riff: "ICMT" },

  // ---- credits ----
  { key: "lyricist", cat: "Credits", label: "Lyricist", hint: "Who wrote the words.", id3: "TEXT", vorbis: "LYRICIST", mp4: "----:LYRICIST" },
  { key: "conductor", cat: "Credits", label: "Conductor", id3: "TPE3", vorbis: "CONDUCTOR", mp4: "----:CONDUCTOR" },
  { key: "remixer", cat: "Credits", label: "Remixer", hint: "Who remixed or reworked the track.", id3: "TPE4", vorbis: "REMIXER", mp4: "----:REMIXER" },
  { key: "mixer", cat: "Credits", label: "Mixed by", id3: "*role:mix", vorbis: "MIXER", mp4: "----:MIXER" },
  { key: "producer", cat: "Credits", label: "Producer", id3: "*role:producer", vorbis: "PRODUCER", mp4: "----:PRODUCER" },
  { key: "engineer", cat: "Credits", label: "Engineer", id3: "*role:engineer", vorbis: "ENGINEER", mp4: "----:ENGINEER" },
  { key: "arranger", cat: "Credits", label: "Arranger", id3: "*role:arranger", vorbis: "ARRANGER", mp4: "----:ARRANGER" },
  { key: "originalArtist", cat: "Credits", label: "Original artist", hint: "For a cover: who first recorded the song.", id3: "TOPE", vorbis: "ORIGINALARTIST", mp4: "----:ORIGINALARTIST" },

  // ---- release ----
  { key: "publisher", cat: "Release", label: "Music publisher", hint: "The company that handles the song's publishing rights (not the label).", id3: "TXXX:PUBLISHER", vorbis: "PUBLISHER", mp4: "----:PUBLISHER" },
  { key: "catalogNumber", cat: "Release", label: "Catalog number", hint: "The label's own number for the release.", id3: "TXXX:CATALOGNUMBER", vorbis: "CATALOGNUMBER", mp4: "----:CATALOGNUMBER" },
  { key: "originalDate", cat: "Release", label: "Original release date", hint: "When the song first came out, for reissues and remasters.", id3: "*origdate", vorbis: "ORIGINALDATE", valt: ["ORIGINALYEAR"], mp4: "----:ORIGINALDATE" },
  { key: "compilation", cat: "Release", label: "Part of a compilation", type: "flag", hint: "Players file compilation tracks under the album, not each artist.", id3: "TCMP", vorbis: "COMPILATION", mp4: "*cpil" },
  { key: "media", cat: "Release", label: "Media type", hint: "What it was released on, like CD, Vinyl or Digital Media.", id3: "TMED", vorbis: "MEDIA", mp4: "----:MEDIA" },
  { key: "encodedBy", cat: "Release", label: "Encoded by", hint: "The person or company who made this file.", id3: "TENC", vorbis: "ENCODEDBY", valt: ["ENCODED-BY"], mp4: "----:ENCODEDBY" },
  { key: "encoder", cat: "Release", label: "Encoding software", id3: "TSSE", vorbis: "ENCODER", mp4: "\xa9too", riff: "ISFT" },

  // ---- about the song ----
  { key: "subtitle", cat: "About the song", label: "Subtitle", hint: "Extra words after the title, like a version name.", id3: "TIT3", vorbis: "SUBTITLE", mp4: "----:SUBTITLE" },
  { key: "grouping", cat: "About the song", label: "Grouping", hint: "Groups songs that belong together, like movements of one piece.", id3: "TIT1", vorbis: "GROUPING", mp4: "\xa9grp" },
  { key: "mood", cat: "About the song", label: "Mood", id3: "TMOO", vorbis: "MOOD", mp4: "----:MOOD" },
  { key: "description", cat: "About the song", label: "Description", type: "long", hint: "A longer description (podcasts use this).", id3: "TDES", vorbis: "DESCRIPTION", mp4: "desc" },
  { key: "work", cat: "About the song", label: "Work", hint: "Classical: the whole piece this track is part of.", id3: "TXXX:WORK", vorbis: "WORK", mp4: "\xa9wrk" },
  { key: "movementName", cat: "About the song", label: "Movement name", id3: "MVNM", vorbis: "MOVEMENTNAME", mp4: "\xa9mvn" },
  { key: "movement", cat: "About the song", label: "Movement number", type: "num", id3: "*movement", vorbis: "MOVEMENT", mp4: "*\xa9mvi" },
  { key: "movementTotal", cat: "About the song", label: "Total movements", type: "num", id3: "*movement", vorbis: "MOVEMENTTOTAL", mp4: "*\xa9mvc" },
  { key: "rating", cat: "About the song", label: "Rating", type: "rating", hint: "Your star rating, 1 to 5.", id3: "*rating", vorbis: "RATING",
    why: { mp4: "M4A files have no standard rating tag (iTunes keeps ratings in its library, not the file)." } },

  // ---- sorting ----
  { key: "titleSort", cat: "Sorting", label: "Sort title as", hint: "How players alphabetize the title, like \"Wall, The\".", id3: "TSOT", vorbis: "TITLESORT", mp4: "sonm" },
  { key: "artistSort", cat: "Sorting", label: "Sort artist as", hint: "Like \"Beatles, The\".", id3: "TSOP", vorbis: "ARTISTSORT", mp4: "soar" },
  { key: "albumSort", cat: "Sorting", label: "Sort album as", id3: "TSOA", vorbis: "ALBUMSORT", mp4: "soal" },
  { key: "albumArtistSort", cat: "Sorting", label: "Sort album artist as", id3: "TSO2", vorbis: "ALBUMARTISTSORT", mp4: "soaa" },
  { key: "composerSort", cat: "Sorting", label: "Sort composer as", id3: "TSOC", vorbis: "COMPOSERSORT", mp4: "soco" },

  // ---- IDs ----
  { key: "mbRecordingId", cat: "MusicBrainz IDs", label: "MusicBrainz recording ID", hint: "From musicbrainz.org; taggers like Picard fill these in.", id3: "*ufid", vorbis: "MUSICBRAINZ_TRACKID", mp4: "----:MusicBrainz Track Id" },
  { key: "mbReleaseTrackId", cat: "MusicBrainz IDs", label: "MusicBrainz track ID", id3: "TXXX:MusicBrainz Release Track Id", vorbis: "MUSICBRAINZ_RELEASETRACKID", mp4: "----:MusicBrainz Release Track Id" },
  { key: "mbAlbumId", cat: "MusicBrainz IDs", label: "MusicBrainz release ID", id3: "TXXX:MusicBrainz Album Id", vorbis: "MUSICBRAINZ_ALBUMID", mp4: "----:MusicBrainz Album Id" },
  { key: "mbArtistId", cat: "MusicBrainz IDs", label: "MusicBrainz artist ID", id3: "TXXX:MusicBrainz Artist Id", vorbis: "MUSICBRAINZ_ARTISTID", mp4: "----:MusicBrainz Artist Id" },
  { key: "mbAlbumArtistId", cat: "MusicBrainz IDs", label: "MusicBrainz release artist ID", id3: "TXXX:MusicBrainz Album Artist Id", vorbis: "MUSICBRAINZ_ALBUMARTISTID", mp4: "----:MusicBrainz Album Artist Id" },
  { key: "mbReleaseGroupId", cat: "MusicBrainz IDs", label: "MusicBrainz release group ID", id3: "TXXX:MusicBrainz Release Group Id", vorbis: "MUSICBRAINZ_RELEASEGROUPID", mp4: "----:MusicBrainz Release Group Id" },
  { key: "mbWorkId", cat: "MusicBrainz IDs", label: "MusicBrainz work ID", id3: "TXXX:MusicBrainz Work Id", vorbis: "MUSICBRAINZ_WORKID", mp4: "----:MusicBrainz Work Id" },

  // ---- loudness ----
  ...[["rgTrackGain", "ReplayGain track gain", "TRACK_GAIN", "Like -6.20 dB. Players turn the song up or down by this much."], ["rgTrackPeak", "ReplayGain track peak", "TRACK_PEAK", "The loudest sample, like 0.988"],
      ["rgAlbumGain", "ReplayGain album gain", "ALBUM_GAIN"], ["rgAlbumPeak", "ReplayGain album peak", "ALBUM_PEAK"]].map(([key, label, n, hint]) => ({
    key, cat: "Loudness", label, hint, id3: "TXXX:REPLAYGAIN_" + n, vorbis: "REPLAYGAIN_" + n, mp4: "----:replaygain_" + n.toLowerCase(),
    why: { opus: "Opus files don't use ReplayGain tags (the format has its own R128 gain, which players read instead)." } })),

  // ---- web ----
  { key: "urlArtist", cat: "Web links", label: "Artist website", id3: "WOAR", vorbis: "WEBSITE" },
  { key: "urlFile", cat: "Web links", label: "Song's web page", id3: "WOAF" },
  { key: "urlSource", cat: "Web links", label: "Where this file came from", id3: "WOAS" },
  { key: "urlPublisher", cat: "Web links", label: "Label's website", id3: "WPUB" },
  { key: "urlCommercial", cat: "Web links", label: "Where to buy it", id3: "WCOM" },
  { key: "urlCopyright", cat: "Web links", label: "Copyright or license page", id3: "WCOP" },
  { key: "urlRadio", cat: "Web links", label: "Radio station's website", id3: "WORS" },
  { key: "urlPayment", cat: "Web links", label: "Payment or tip page", id3: "WPAY" },

  // ---- podcasts ----
  { key: "podcast", cat: "Podcast", label: "This is a podcast episode", type: "flag", mp4: "*pcst",
    why: { id3: "There's no reliable podcast flag in ID3 tags; podcast apps go by the feed." } },
  { key: "podcastUrl", cat: "Podcast", label: "Podcast feed URL", id3: "WFED", mp4: "purl" },
  { key: "podcastId", cat: "Podcast", label: "Episode ID", id3: "TGID", mp4: "egid" },
  { key: "podcastCategory", cat: "Podcast", label: "Podcast category", id3: "TCAT", mp4: "catg" },
  { key: "podcastKeywords", cat: "Podcast", label: "Podcast keywords", id3: "TKWD", mp4: "keyw" },
];

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const MAIN = FIELDS.filter((f) => f.main);
export const MORE = FIELDS.filter((f) => !f.main);

// Which tag system a container uses
export const SYSTEM = { mp3: "id3", wav: "id3", aiff: "id3", flac: "vorbis", ogg: "vorbis", opus: "vorbis", m4a: "mp4" };
export const FORMAT_NAME = { mp3: "MP3", wav: "WAV", aiff: "AIFF", flac: "FLAC", ogg: "Ogg Vorbis", opus: "Opus", m4a: "M4A" };

/** Can this format store this field? true, or the plain-English reason it can't */
export function canStore(format, key) {
  const f = FIELD[key], sys = SYSTEM[format];
  if (!f || !sys) return "Unknown field.";
  if (f.why?.[format]) return f.why[format];
  if (f[sys]) return true;
  if (f.why?.[sys]) return f.why[sys];
  const name = FORMAT_NAME[format];
  return `${name} files have no standard place for this. You can add it as a custom field instead (most players won't show it).`;
}

// Picture kinds (the same numbers in ID3 APIC, FLAC PICTURE and Ogg)
export const PICTURE_TYPES = ["Other", "32x32 file icon", "Other file icon", "Front cover", "Back cover", "Booklet page", "Disc (label side)",
  "Lead artist", "Artist or performer", "Conductor", "Band or orchestra", "Composer", "Lyricist", "Recording location", "During recording",
  "During performance", "Video screen capture", "A bright colored fish", "Illustration", "Band logo", "Label or studio logo"];

// The ID3v1 genre list (numbered genres in old MP3s and M4A "gnre" atoms)
export const ID3_GENRES = ["Blues", "Classic Rock", "Country", "Dance", "Disco", "Funk", "Grunge", "Hip-Hop", "Jazz", "Metal", "New Age", "Oldies", "Other", "Pop", "R&B", "Rap",
  "Reggae", "Rock", "Techno", "Industrial", "Alternative", "Ska", "Death Metal", "Pranks", "Soundtrack", "Euro-Techno", "Ambient", "Trip-Hop", "Vocal", "Jazz+Funk", "Fusion", "Trance",
  "Classical", "Instrumental", "Acid", "House", "Game", "Sound Clip", "Gospel", "Noise", "Alternative Rock", "Bass", "Soul", "Punk", "Space", "Meditative", "Instrumental Pop",
  "Instrumental Rock", "Ethnic", "Gothic", "Darkwave", "Techno-Industrial", "Electronic", "Pop-Folk", "Eurodance", "Dream", "Southern Rock", "Comedy", "Cult", "Gangsta", "Top 40",
  "Christian Rap", "Pop/Funk", "Jungle", "Native American", "Cabaret", "New Wave", "Psychedelic", "Rave", "Showtunes", "Trailer", "Lo-Fi", "Tribal", "Acid Punk", "Acid Jazz", "Polka",
  "Retro", "Musical", "Rock & Roll", "Hard Rock", "Folk", "Folk-Rock", "National Folk", "Swing", "Fast Fusion", "Bebop", "Latin", "Revival", "Celtic", "Bluegrass", "Avantgarde",
  "Gothic Rock", "Progressive Rock", "Psychedelic Rock", "Symphonic Rock", "Slow Rock", "Big Band", "Chorus", "Easy Listening", "Acoustic", "Humour", "Speech", "Chanson", "Opera",
  "Chamber Music", "Sonata", "Symphony", "Booty Bass", "Primus", "Porn Groove", "Satire", "Slow Jam", "Club", "Tango", "Samba", "Folklore", "Ballad", "Power Ballad", "Rhythmic Soul",
  "Freestyle", "Duet", "Punk Rock", "Drum Solo", "A Cappella", "Euro-House", "Dance Hall", "Goa", "Drum & Bass", "Club-House", "Hardcore", "Terror", "Indie", "Britpop", "Afro-Punk",
  "Polsk Punk", "Beat", "Christian Gangsta Rap", "Heavy Metal", "Black Metal", "Crossover", "Contemporary Christian", "Christian Rock", "Merengue", "Salsa", "Thrash Metal", "Anime",
  "J-Pop", "Synthpop", "Abstract", "Art Rock", "Baroque", "Bhangra", "Big Beat", "Breakbeat", "Chillout", "Downtempo", "Dub", "EBM", "Eclectic", "Electro", "Electroclash", "Emo",
  "Experimental", "Garage", "Global", "IDM", "Illbient", "Industro-Goth", "Jam Band", "Krautrock", "Leftfield", "Lounge", "Math Rock", "New Romantic", "Nu-Breakz", "Post-Punk",
  "Post-Rock", "Psytrance", "Shoegaze", "Space Rock", "Trop Rock", "World Music", "Neoclassical", "Audiobook", "Audio Theatre", "Neue Deutsche Welle", "Podcast", "Indie Rock",
  "G-Funk", "Dubstep", "Garage Rock", "Psybient"];
