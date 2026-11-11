// ENCORE. Links: the plain logic (no DOM). Release pages: smart links and pre-save pages.
// What a link points at, mapping song.link / Apple / oEmbed answers, reading Kit and Mailchimp
// form code, the countdown, colours from cover art, and the fan page as one HTML file.

export const VERSION = 1;

// ---------- platforms ----------
// kind: 'listen' (a streaming or store page), 'extra' (store, merch, socials)
const B = (bg, inner, round = 6) => `<svg viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="${round}" fill="${bg}"/>${inner}</svg>`;
const T = (t, size = 11) => `<text x="12" y="${12 + size * 0.36}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="${size}" fill="#fff">${t}</text>`;
const NOTE = '<path d="M16.2 5.2v9.2a2.4 2.4 0 1 1-1.5-2.2V8.3l-5.4 1.3v6.6a2.4 2.4 0 1 1-1.5-2.2V7.4z" fill="#fff"/>';
export const PLATFORMS = {
  spotify: { name: 'Spotify', kind: 'listen', act: 'Play', pre: 'Pre-save', icon: B('#1ed760', '<path d="M6.6 9.3c3.7-1.1 7.8-.8 11 1.1M7.2 12.5c3-.9 6.3-.6 8.9.9M7.9 15.5c2.4-.6 4.9-.4 6.9.7" stroke="#000" stroke-width="1.8" fill="none" stroke-linecap="round"/>', 12) },
  appleMusic: { name: 'Apple Music', kind: 'listen', act: 'Play', pre: 'Pre-add', icon: B('#fa2d48', NOTE) },
  youtubeMusic: { name: 'YouTube Music', kind: 'listen', act: 'Play', icon: B('#ff0033', '<circle cx="12" cy="12" r="6.2" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M10.4 9.4v5.2l4.4-2.6z" fill="#fff"/>', 12) },
  youtube: { name: 'YouTube', kind: 'listen', act: 'Watch', icon: B('#ff0033', '<path d="M9.8 8.4v7.2l6-3.6z" fill="#fff"/>') },
  amazonMusic: { name: 'Amazon Music', kind: 'listen', act: 'Play', pre: 'Pre-save', icon: B('#0f1b2d', '<path d="M6 13.5c3.6 2.4 8.4 2.4 12 0" stroke="#25d1da" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M16.4 12.4l1.9 1-1 1.9" stroke="#25d1da" stroke-width="1.5" fill="none" stroke-linecap="round"/>') },
  deezer: { name: 'Deezer', kind: 'listen', act: 'Play', pre: 'Pre-save', icon: B('#a238ff', '<path d="M5 17h2.6M8.8 17h2.6M12.6 17h2.6M16.4 17H19M12.6 14.2h2.6M16.4 14.2H19M16.4 11.4H19M16.4 8.6H19" stroke="#fff" stroke-width="1.8"/>') },
  tidal: { name: 'TIDAL', kind: 'listen', act: 'Play', pre: 'Pre-save', icon: B('#000', '<path d="M4.5 9.5l2.5-2.5 2.5 2.5L7 12zM9.5 9.5L12 7l2.5 2.5L12 12zM14.5 9.5L17 7l2.5 2.5L17 12zM9.5 14.5L12 12l2.5 2.5L12 17z" fill="#fff"/>') },
  soundcloud: { name: 'SoundCloud', kind: 'listen', act: 'Play', icon: B('#ff5500', '<path d="M8 16.2h9a2.6 2.6 0 0 0 .3-5.2 4 4 0 0 0-7.6-1.2A2.9 2.9 0 0 0 8 16.2z" fill="#fff"/><path d="M4.6 12.6v3.4M6.3 11.4v4.8" stroke="#fff" stroke-width="1.1" stroke-linecap="round"/>') },
  bandcamp: { name: 'Bandcamp', kind: 'listen', act: 'Buy', icon: B('#1da0c3', '<path d="M8.6 7.6h10.2l-3.4 8.8H5.2z" fill="#fff"/>') },
  itunes: { name: 'iTunes Store', kind: 'listen', act: 'Buy', icon: B('#ea4cc0', NOTE) },
  amazonStore: { name: 'Amazon', kind: 'listen', act: 'Buy', icon: B('#232f3e', '<path d="M6 13.5c3.6 2.4 8.4 2.4 12 0" stroke="#ff9900" stroke-width="1.8" fill="none" stroke-linecap="round"/>') },
  pandora: { name: 'Pandora', kind: 'listen', act: 'Play', icon: B('#224099', T('P', 13)) },
  audiomack: { name: 'Audiomack', kind: 'listen', act: 'Play', icon: B('#ffa200', T('am', 10)) },
  anghami: { name: 'Anghami', kind: 'listen', act: 'Play', icon: B('#8a2be2', T('A', 13)) },
  boomplay: { name: 'Boomplay', kind: 'listen', act: 'Play', icon: B('#0f0f0f', T('B', 13)) },
  audius: { name: 'Audius', kind: 'listen', act: 'Play', icon: B('#7e1bcc', T('A', 13)) },
  napster: { name: 'Napster', kind: 'listen', act: 'Play', icon: B('#111', T('N', 13)) },
  encore: { name: 'ENCORE. store', kind: 'extra', act: 'Support', icon: B('#0c0a09', '<path d="M7.5 6.5h6.6v1.9h-4.4v2.7h3.9V13H9.7v2.6h4.4v1.9H7.5z" fill="#f2efe8"/><rect x="15.4" y="15.6" width="1.9" height="1.9" fill="#ff3b00"/>') },
  merch: { name: 'Merch', kind: 'extra', act: 'Shop', icon: B('#3f3a36', '<path d="M9 6l-4 2.2 1.4 3 1.6-.7V18h8v-7.5l1.6.7 1.4-3L15 6c-.4 1.2-1.6 2-3 2s-2.6-.8-3-2z" fill="#fff"/>') },
  tickets: { name: 'Tickets', kind: 'extra', act: 'Get tickets', icon: B('#3f3a36', '<path d="M5 8.5h14v2a1.5 1.5 0 0 0 0 3v2H5v-2a1.5 1.5 0 0 0 0-3z" fill="#fff"/><path d="M14 9v6" stroke="#3f3a36" stroke-width="1" stroke-dasharray="1.2 1.2"/>') },
  website: { name: 'Website', kind: 'extra', act: 'Visit', icon: B('#3f3a36', '<circle cx="12" cy="12" r="6" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M6 12h12M12 6c-2.4 3.2-2.4 8.8 0 12M12 6c2.4 3.2 2.4 8.8 0 12" stroke="#fff" stroke-width="1.2" fill="none"/>') },
  instagram: { name: 'Instagram', kind: 'extra', act: 'Follow', icon: B('#d62976', '<rect x="6.5" y="6.5" width="11" height="11" rx="3.2" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="12" cy="12" r="2.6" fill="none" stroke="#fff" stroke-width="1.5"/><circle cx="15.3" cy="8.7" r=".9" fill="#fff"/>') },
  tiktok: { name: 'TikTok', kind: 'extra', act: 'Follow', icon: B('#000', '<path d="M13.2 5.5h2a3.4 3.4 0 0 0 3 3v2a5.4 5.4 0 0 1-3-1v5.2a3.9 3.9 0 1 1-3.9-3.9h.4v2.1h-.4a1.8 1.8 0 1 0 1.9 1.8z" fill="#fff"/>') },
  x: { name: 'X', kind: 'extra', act: 'Follow', icon: B('#000', '<path d="M6.5 6.5h3.2l8 11h-3.2zM17.3 6.5L12.9 11.4M11 12.8l-4.4 4.7" stroke="#fff" stroke-width="1.3" fill="none"/>') },
  facebook: { name: 'Facebook', kind: 'extra', act: 'Follow', icon: B('#1877f2', '<path d="M13.2 18.5v-5.6h1.9l.3-2.2h-2.2V9.3c0-.6.2-1.1 1.1-1.1h1.2v-2a15 15 0 0 0-1.7-.1c-1.7 0-2.9 1-2.9 3v1.6H9v2.2h1.9v5.6z" fill="#fff"/>') },
  email: { name: 'Email', kind: 'extra', act: 'Write', icon: B('#3f3a36', '<rect x="5.5" y="7.5" width="13" height="9" rx="1.5" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M6 8.3l6 4.4 6-4.4" stroke="#fff" stroke-width="1.4" fill="none"/>') },
  link: { name: 'Link', kind: 'extra', act: 'Open', icon: B('#3f3a36', '<path d="M10.6 13.4a3 3 0 0 0 4.2 0l2.4-2.4a3 3 0 0 0-4.2-4.2l-.8.8M13.4 10.6a3 3 0 0 0-4.2 0l-2.4 2.4a3 3 0 0 0 4.2 4.2l.8-.8" stroke="#fff" stroke-width="1.5" fill="none" stroke-linecap="round"/>') },
};
export const LISTEN_ORDER = ['spotify', 'appleMusic', 'youtubeMusic', 'youtube', 'amazonMusic', 'deezer', 'tidal', 'soundcloud', 'bandcamp', 'pandora', 'audiomack', 'anghami', 'boomplay', 'audius', 'napster', 'itunes', 'amazonStore'];
export const PRESAVE_PLATFORMS = ['spotify', 'appleMusic', 'amazonMusic', 'deezer', 'tidal', 'link'];
export const EXTRA_PLATFORMS = ['encore', 'bandcamp', 'merch', 'tickets', 'website', 'instagram', 'tiktok', 'youtube', 'x', 'facebook', 'email', 'link'];

export function actionLabel(link) {
  if (link.action) return link.action;
  const p = PLATFORMS[link.platform] || PLATFORMS.link;
  if (link.kind === 'presave') return p.pre || 'Pre-save';
  return p.act || 'Open';
}
export const linkName = (link) => (link.label || '').trim() || (link.kind === 'presave' && link.platform === 'link' ? 'Pre-save on your app' : (PLATFORMS[link.platform] || PLATFORMS.link).name);

// ---------- reading a music link ----------
export function detectPlatform(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return null; }
  const h = u.hostname.replace(/^www\./, '').toLowerCase(), p = u.pathname;
  if (h === 'open.spotify.com' || h === 'spotify.link') { const m = p.match(/\/(track|album)\/([A-Za-z0-9]+)/); return { platform: 'spotify', type: m ? m[1] : '', id: m ? m[2] : '' }; }
  if (h === 'music.apple.com' || h === 'itunes.apple.com') {
    const track = u.searchParams.get('i'), m = p.match(/\/(album|song)\/[^/]*\/?(\d+)/) || p.match(/\/id(\d+)/);
    const id = track || (m ? m[m.length - 1] : '');
    return { platform: 'appleMusic', type: track || /\/song\//.test(p) ? 'track' : 'album', id };
  }
  if (h === 'music.youtube.com') return { platform: 'youtubeMusic', type: 'track', id: u.searchParams.get('v') || '' };
  if (h === 'youtube.com' || h === 'm.youtube.com') return { platform: 'youtube', type: 'track', id: u.searchParams.get('v') || (p.match(/\/(?:shorts|embed)\/([\w-]+)/) || [])[1] || '' };
  if (h === 'youtu.be') return { platform: 'youtube', type: 'track', id: p.slice(1).split('/')[0] };
  if (h.endsWith('deezer.com') || h === 'deezer.page.link' || h === 'link.deezer.com') return { platform: 'deezer', type: (p.match(/\/(track|album)\//) || [])[1] || '', id: (p.match(/\/(?:track|album)\/(\d+)/) || [])[1] || '' };
  if (h.endsWith('tidal.com')) return { platform: 'tidal', type: (p.match(/\/(track|album)\//) || [])[1] || '', id: (p.match(/\/(?:track|album)\/(\d+)/) || [])[1] || '' };
  if (h.startsWith('music.amazon.') || h.startsWith('amazon.')) return { platform: h.startsWith('music.') ? 'amazonMusic' : 'amazonStore', type: '', id: '' };
  if (h === 'soundcloud.com' || h === 'on.soundcloud.com' || h === 'm.soundcloud.com') return { platform: 'soundcloud', type: 'track', id: '' };
  if (h.endsWith('bandcamp.com')) return { platform: 'bandcamp', type: /\/album\//.test(p) ? 'album' : 'track', id: '' };
  if (h === 'song.link' || h === 'album.link' || h === 'odesli.co') return { platform: 'songlink', type: '', id: '' };
  if (h.endsWith('pandora.com')) return { platform: 'pandora', type: '', id: '' };
  if (h.endsWith('audiomack.com')) return { platform: 'audiomack', type: '', id: '' };
  return null;
}
export const youtubeMusicUrl = (id) => (id ? `https://music.youtube.com/watch?v=${encodeURIComponent(id)}` : '');
export const songLinkUrl = (url, key = '') => 'https://api.song.link/v1-alpha.1/links?url=' + encodeURIComponent(String(url).trim()) + '&userCountry=US' + (key ? '&key=' + encodeURIComponent(key) : '');

// song.link answer -> { title, artist, artUrl, links: [{ platform, url }] } in our order
const SL_MAP = { spotify: 'spotify', appleMusic: 'appleMusic', itunes: 'itunes', youtube: 'youtube', youtubeMusic: 'youtubeMusic', amazonMusic: 'amazonMusic', amazonStore: 'amazonStore',
  deezer: 'deezer', tidal: 'tidal', soundcloud: 'soundcloud', bandcamp: 'bandcamp', pandora: 'pandora', audiomack: 'audiomack', anghami: 'anghami', boomplay: 'boomplay', audius: 'audius', napster: 'napster' };
export function mapSongLink(json) {
  if (!json || typeof json !== 'object' || !json.linksByPlatform) return { title: '', artist: '', artUrl: '', links: [], pageUrl: '' };
  const ents = json.entitiesByUniqueId || {};
  const main = ents[json.entityUniqueId] || Object.values(ents)[0] || {};
  // the best artwork: the biggest thumbnail any platform gave
  let art = main.thumbnailUrl || '', artW = main.thumbnailWidth || 0;
  for (const e of Object.values(ents)) if (e.thumbnailUrl && (e.thumbnailWidth || 0) > artW) { art = e.thumbnailUrl; artW = e.thumbnailWidth; }
  const links = [];
  for (const id of LISTEN_ORDER) {
    const key = Object.keys(SL_MAP).find((k) => SL_MAP[k] === id);
    const l = json.linksByPlatform[key];
    if (l && l.url) links.push({ platform: id, url: l.url });
  }
  return { title: main.title || '', artist: main.artistName || '', artUrl: art, links, pageUrl: json.pageUrl || '' };
}

// Apple's free catalogue search (itunes.apple.com/search or /lookup) -> candidates
export const itunesSearchUrl = (term, country = 'US') => `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=6&country=${country}`;
export const itunesLookupUrl = (id, country = 'US') => `https://itunes.apple.com/lookup?id=${encodeURIComponent(id)}&entity=song&country=${country}`;
export const bigArt = (url, px = 1000) => String(url || '').replace(/\/\d+x\d+(bb)?(-\d+)?\.(jpg|png|webp)$/i, `/${px}x${px}bb.jpg`);
export function mapItunes(json) {
  const rows = (json && json.results) || [];
  return rows.filter((r) => r.trackName || r.collectionName).map((r) => ({
    title: r.trackName || r.collectionName, artist: r.artistName || '', album: r.collectionName || '',
    url: (r.trackViewUrl || r.collectionViewUrl || '').replace(/[?&]uo=\d+/, '').replace(/\?$/, ''),
    artUrl: bigArt(r.artworkUrl100 || r.artworkUrl60 || ''), kind: r.wrapperType === 'track' ? 'track' : 'album',
    released: r.releaseDate || '',
  })).filter((r) => r.url);
}
const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\(.*?\)|\[.*?\]|feat\..*$|ft\..*$/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
// the candidate that matches the title (and artist if we know it), or null
export function bestMatch(cands, title, artist) {
  const t = norm(title), a = norm(artist);
  if (!t) return null;
  return cands.find((c) => norm(c.title) === t && (!a || norm(c.artist) === a || norm(c.artist).includes(a) || a.includes(norm(c.artist)))) || null;
}

// oEmbed answers (Spotify, YouTube, SoundCloud) -> what we can learn
export const oembedUrl = (platform, url) => ({
  spotify: 'https://open.spotify.com/oembed?url=', youtube: 'https://www.youtube.com/oembed?format=json&url=', youtubeMusic: 'https://www.youtube.com/oembed?format=json&url=',
  soundcloud: 'https://soundcloud.com/oembed?format=json&url=',
}[platform] || '') + encodeURIComponent(platform === 'youtubeMusic' ? String(url).replace('music.youtube.com', 'www.youtube.com') : url);
export function mapOembed(platform, j) {
  if (!j) return { title: '', artist: '', artUrl: '' };
  let title = j.title || '', artist = '';
  const art = j.thumbnail_url || '';
  if (platform === 'youtube' || platform === 'youtubeMusic') {
    artist = String(j.author_name || '').replace(/\s*-\s*Topic$/, '').replace(/VEVO$/i, '');
    const m = title.match(/^(.+?)\s+[-|]\s+(.+)$/);
    if (m) { artist = m[1].trim(); title = m[2]; }
    title = title.replace(/\s*[([](official|lyric|audio|music|video|visualizer|hd|4k|remaster)[^)\]]*[)\]]/gi, '').trim();
  } else if (platform === 'soundcloud') {
    const m = title.match(/^(.+) by (.+)$/);
    if (m) { title = m[1]; artist = m[2]; } else artist = j.author_name || '';
  }
  return { title: title.trim(), artist: artist.trim(), artUrl: platform === 'soundcloud' ? art.replace('-t500x500', '-t500x500') : art };
}

// ---------- email sign-up: Kit (ConvertKit) or Mailchimp form code ----------
const decodeEnt = (s) => String(s).replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
function attrs(tag) {
  const out = {};
  tag.replace(/([\w:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (_, k, __, a, b, c) => { out[k.toLowerCase()] = decodeEnt(a ?? b ?? c ?? ''); return ''; });
  return out;
}
export function providerOf(url) {
  try {
    const h = new URL(url).hostname.toLowerCase();
    if (/(^|\.)(kit\.com|convertkit\.com|ck\.page|kit\.co)$/.test(h)) return 'kit';
    if (/(^|\.)(list-manage\.com|mailchimp\.com|eepurl\.com|mailchi\.mp)$/.test(h)) return 'mailchimp';
  } catch {}
  return 'other';
}
export const PROVIDER_NAMES = { kit: 'Kit', mailchimp: 'Mailchimp', other: 'your email service' };
// parseFormCode(text) -> { ok, provider, mode: 'post'|'link', action, field, hidden: [{name, value}], error }
export function parseFormCode(text) {
  const src = String(text || '').trim();
  const fail = (error) => ({ ok: false, provider: '', mode: '', action: '', field: '', hidden: [], error });
  if (!src) return fail('');
  if (/<script[^>]+data-uid=/i.test(src) && !/<form/i.test(src)) return fail('That is the JavaScript version of the Kit form. In Kit, pick the HTML option instead and paste that code.');
  const formTag = src.match(/<form\b[^>]*>/i);
  if (formTag) {
    const fa = attrs(formTag[0]);
    const action = (fa.action || '').trim();
    if (!/^https:\/\//i.test(action)) return fail('Found a form, but its address is missing or not secure (https). Copy the embed code again.');
    const provider = providerOf(action);
    const inputs = [...src.matchAll(/<input\b[^>]*>/gi)].map((m) => attrs(m[0]));
    let field = (inputs.find((i) => (i.type || '').toLowerCase() === 'email' && i.name) || inputs.find((i) => /^(email|email_address|EMAIL|fields\[email\])$/i.test(i.name || '')) || {}).name || '';
    if (!field) field = provider === 'mailchimp' ? 'EMAIL' : provider === 'kit' ? 'email_address' : '';
    if (!field) return fail('Found a form, but no email box in it.');
    // keep hidden fields the service needs (Mailchimp's anti-robot box goes in empty)
    const hidden = inputs.filter((i) => i.name && i.name !== field && ((i.type || '').toLowerCase() === 'hidden' || /^b_[\w]+_[\w]+$/.test(i.name)))
      .map((i) => ({ name: i.name, value: /^b_/.test(i.name) ? '' : (i.value || ''), trap: /^b_/.test(i.name) }));
    return { ok: true, provider, mode: 'post', action, field, hidden, error: '' };
  }
  const urlMatch = src.match(/https:\/\/[^\s"'<>]+/i);
  if (!urlMatch) return fail('Paste the embed code (it starts with <form) or your form\'s web address (https://...).');
  const url = decodeEnt(urlMatch[0]);
  const provider = providerOf(url);
  let u; try { u = new URL(url); } catch { return fail('That web address does not look right.'); }
  if (provider === 'kit') {
    const m = u.pathname.match(/\/forms\/(\d+)(\/subscriptions)?/);
    if (m) return { ok: true, provider, mode: 'post', action: `${u.origin}/forms/${m[1]}/subscriptions`, field: 'email_address', hidden: [], error: '' };
  }
  if (provider === 'mailchimp' && /list-manage\.com$/.test(u.hostname) && u.searchParams.get('u') && u.searchParams.get('id')) {
    const uu = u.searchParams.get('u'), id = u.searchParams.get('id');
    const action = `${u.origin}/subscribe/post?u=${encodeURIComponent(uu)}&id=${encodeURIComponent(id)}` + (u.searchParams.get('f_id') ? '&f_id=' + encodeURIComponent(u.searchParams.get('f_id')) : '');
    return { ok: true, provider, mode: 'post', action, field: 'EMAIL', hidden: [{ name: `b_${uu}_${id}`, value: '', trap: true }], error: '' };
  }
  // a hosted sign-up page: the button opens it
  return { ok: true, provider, mode: 'link', action: url, field: '', hidden: [], error: '' };
}

// ---------- the release date and the countdown ----------
// the release moment from a date ('2026-12-04') and time ('00:00') in the artist's own time zone
export function releaseAt(date, time, tzOffsetMinutes = null) {
  const m = String(date || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [hh, mm] = String(time || '00:00').split(':').map((x) => parseInt(x, 10) || 0);
  if (tzOffsetMinutes == null) return new Date(+m[1], +m[2] - 1, +m[3], hh, mm).getTime();
  return Date.UTC(+m[1], +m[2] - 1, +m[3], hh, mm) + tzOffsetMinutes * 60000;
}
export function countdownParts(target, now) {
  const left = Math.max(0, (target || 0) - now);
  const s = Math.floor(left / 1000);
  return { done: !target || left <= 0, d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
}
export const pad2 = (n) => String(n).padStart(2, '0');
export function effectiveMode(page, now) {
  if (page.mode !== 'pre') return 'out';
  if (page.autoFlip && page.releaseAt && now >= page.releaseAt) return 'out';
  return 'pre';
}

// ---------- colours ----------
export const hex = (c) => '#' + c.slice(0, 3).map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
export function parseHex(h) {
  const m = String(h || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const s = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
}
export function luminance([r, g, b]) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
export function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
export function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const t = (x) => { x = (x + 1) % 1; return x < 1 / 6 ? p + (q - p) * 6 * x : x < 1 / 2 ? q : x < 2 / 3 ? p + (q - p) * (2 / 3 - x) * 6 : p; };
  return [t(h + 1 / 3) * 255, t(h) * 255, t(h - 1 / 3) * 255];
}
// the main colours in some RGBA pixels: [{ rgb, share, s, l }] most common first
export function paletteFromPixels(data) {
  const buckets = new Map();
  let total = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    const k = (data[i] >> 3) << 10 | (data[i + 1] >> 3) << 5 | data[i + 2] >> 3;
    let b = buckets.get(k);
    if (!b) buckets.set(k, b = [0, 0, 0, 0]);
    b[0] += data[i]; b[1] += data[i + 1]; b[2] += data[i + 2]; b[3]++; total++;
  }
  // merge near buckets into up to 8 clusters
  const sorted = [...buckets.values()].map((b) => ({ rgb: [b[0] / b[3], b[1] / b[3], b[2] / b[3]], n: b[3] })).sort((a, b) => b.n - a.n);
  const clusters = [];
  for (const c of sorted) {
    const near = clusters.find((k) => Math.hypot(k.rgb[0] - c.rgb[0], k.rgb[1] - c.rgb[1], k.rgb[2] - c.rgb[2]) < 48);
    if (near) { const t = near.n + c.n; near.rgb = near.rgb.map((v, i) => (v * near.n + c.rgb[i] * c.n) / t); near.n = t; }
    else if (clusters.length < 12) clusters.push({ rgb: c.rgb.slice(), n: c.n });
  }
  return clusters.sort((a, b) => b.n - a.n).slice(0, 8).map((c) => { const [, s, l] = rgbToHsl(c.rgb); return { rgb: c.rgb.map(Math.round), share: total ? c.n / total : 0, s, l }; });
}
// pick a background tint and an accent from a palette
export function coverColours(palette) {
  if (!palette || !palette.length) return null;
  const dominant = palette[0].rgb;
  // the accent: a lively colour that stands apart from the background (prefer one that isn't the main colour)
  const score = (c) => c.s * Math.sqrt(c.share) * (c.l > 0.35 && c.l < 0.8 ? 1.5 : 1);
  const lively = palette.filter((c) => c.s > 0.3 && c.l > 0.2 && c.l < 0.85);
  const apart = lively.filter((c) => Math.hypot(...c.rgb.map((v, i) => v - dominant[i])) > 90);
  const vivid = (apart.length ? apart : lively).sort((a, b) => score(b) - score(a))[0];
  return { dominant: hex(dominant), accent: hex(vivid ? vivid.rgb : palette.find((c) => c.l > 0.35 && c.l < 0.9)?.rgb || [255, 59, 0]) };
}
const mixRgb = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
// white on a colour whenever it reads (the ENCORE. look), otherwise near-black
const readable = (bg) => (contrast(bg, [255, 255, 255]) >= 3 || contrast(bg, [255, 255, 255]) >= contrast(bg, [12, 10, 9]) ? '#ffffff' : '#0c0a09');
// make a colour light or dark enough to read against a background (at least `min` contrast)
export function ensureContrast(fg, bg, min = 3) {
  let c = fg.slice(); const towards = luminance(bg) < 0.4 ? [255, 255, 255] : [0, 0, 0];
  for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mixRgb(c, towards, 0.15);
  return c;
}

export const THEMES = [
  { id: 'encore', name: 'ENCORE.' }, { id: 'cover', name: 'Cover colours' }, { id: 'blur', name: 'Cover blur' }, { id: 'dark', name: 'Dark' }, { id: 'light', name: 'Light' },
];
// the colours a page uses: { bg, bg2, card, line, text, muted, accent, onAccent, blur }
export function themeTokens(look = {}, colours = null) {
  const id = look.theme || 'encore';
  let t;
  if (id === 'light') t = { bg: [246, 244, 239], text: [24, 20, 18], muted: [96, 88, 80] };
  else if (id === 'dark') t = { bg: [17, 17, 19], text: [244, 244, 245], muted: [161, 161, 170] };
  else if ((id === 'cover' || id === 'blur') && colours) {
    const [h, s] = rgbToHsl(parseHex(colours.dominant));
    t = { bg: hslToRgb([h, Math.min(s, 0.45), id === 'blur' ? 0.08 : 0.11]), text: [250, 248, 244], muted: [205, 198, 190] };
  } else t = { bg: [12, 10, 9], text: [242, 239, 232], muted: [189, 180, 169] };
  const dark = luminance(t.bg) < 0.3;
  let accent = parseHex(look.accent) || (id === 'encore' || !colours ? (id === 'light' ? [230, 52, 0] : [255, 59, 0]) : parseHex(colours.accent));
  accent = ensureContrast(accent, t.bg, 2.6);
  const card = dark ? mixRgb(t.bg, [255, 255, 255], 0.07) : mixRgb(t.bg, [255, 255, 255], 0.75);
  const line = dark ? mixRgb(t.bg, [255, 255, 255], 0.16) : mixRgb(t.bg, [0, 0, 0], 0.12);
  return { bg: hex(t.bg), bg2: hex(mixRgb(t.bg, dark ? [0, 0, 0] : [255, 255, 255], 0.35)), card: hex(card), line: hex(line), text: hex(t.text), muted: hex(t.muted),
    accent: hex(accent), onAccent: readable(accent), dark, blur: id === 'blur' };
}

// ---------- pages ----------
const rid = () => Math.random().toString(36).slice(2, 10);
export const newId = () => Date.now().toString(36) + rid().slice(0, 4);
export function newLink(platform, kind, url = '') { return { id: rid(), platform, kind, url, label: '', action: '', hidden: false }; }
export function newPage(over = {}) {
  const now = Date.now();
  return {
    id: newId(), created: now, updated: now, title: '', artist: '', blurb: '',
    art: '', artRemote: '', colours: null,
    mode: 'out', releaseDate: '', releaseTime: '00:00', releaseAt: null, autoFlip: true,
    links: [], signup: { on: false, code: '', heading: 'Get new music first', button: 'Sign up', note: '' },
    look: { theme: 'encore', buttons: 'solid', shape: 'pill', accent: '', credit: true },
    pageUrl: '', ...over,
  };
}
// put found links into a page: keep the artist's own, add what is new, fill empty urls
export function mergeLinks(page, found, kind = 'listen') {
  const links = page.links.slice();
  for (const f of found) {
    const have = links.find((l) => l.kind === kind && l.platform === f.platform);
    if (have) { if (!have.url) have.url = f.url; } else links.push(newLink(f.platform, kind, f.url));
  }
  return links;
}
export function moveItem(arr, i, by) {
  const j = i + by, a = arr.slice();
  if (j < 0 || j >= a.length) return a;
  [a[i], a[j]] = [a[j], a[i]];
  return a;
}
export function safeUrl(u) {
  const s = String(u || '').trim();
  if (/^mailto:[^\s]+@[^\s]+$/i.test(s)) return s;
  try { const x = new URL(s); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; }
}
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function slug(s) { return String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'release'; }
export const fileNameFor = (page) => slug([page.artist, page.title].filter(Boolean).join(' ')) + '.html';

// ---------- backup ----------
export function makeBackup(pages) { return JSON.stringify({ app: 'encore-links', version: VERSION, saved: new Date().toISOString(), pages }, null, 1); }
export function readBackup(text) {
  let j; try { j = JSON.parse(text); } catch { throw new Error('That file is not an ENCORE. Links backup.'); }
  const pages = Array.isArray(j) ? j : j && j.app === 'encore-links' && Array.isArray(j.pages) ? j.pages : null;
  if (!pages) throw new Error('That file is not an ENCORE. Links backup.');
  return pages.filter((p) => p && typeof p === 'object' && p.id).map((p) => {
    const base = newPage();
    return { ...base, ...p, signup: { ...base.signup, ...(p.signup || {}) }, look: { ...base.look, ...(p.look || {}) }, links: Array.isArray(p.links) ? p.links.filter((l) => l && l.platform) : [] };
  });
}

// ---------- the fan page ----------
export function formatWhen(ms, locale = 'en-US', timeZone) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleString(locale, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) });
  } catch { return new Date(ms).toUTCString(); }
}
const visible = (page, kind) => page.links.filter((l) => l.kind === kind && !l.hidden && safeUrl(l.url));

// buildExportHtml(page, { now, preview, ogImage }) -> one self-contained HTML file
export function buildExportHtml(page, opts = {}) {
  const now = opts.now ?? Date.now();
  const tk = themeTokens(page.look, page.colours);
  const shape = { pill: '999px', rounded: '14px', square: '4px' }[page.look.shape] || '999px';
  const title = (page.title || 'New release').trim(), artist = (page.artist || '').trim();
  const full = artist ? `${title} by ${artist}` : title;
  const pre = visible(page, 'presave'), out = visible(page, 'listen'), extra = visible(page, 'extra');
  const canPre = page.mode === 'pre' && page.releaseAt;
  const mode = canPre ? effectiveMode(page, now) : 'out';
  const flip = canPre && page.autoFlip;
  const when = canPre ? formatWhen(page.releaseAt, 'en-US', opts.timeZone) : '';
  const desc = page.blurb ? page.blurb.trim().slice(0, 200) : canPre && mode === 'pre' ? `${full}. Out ${when}. Pre-save it now.` : `Listen to ${full} on your favourite app.`;
  const pageUrl = safeUrl(page.pageUrl);
  const ogImage = safeUrl(opts.ogImage || page.artRemote || '');
  const btn = (l, cls = '') => {
    const p = PLATFORMS[l.platform] || PLATFORMS.link;
    const href = safeUrl(l.url);
    return `<li><a class="lk${cls}" href="${esc(href)}" target="_blank" rel="noopener"><span class="ic">${p.icon}</span><span class="nm">${esc(linkName(l))}</span><span class="act">${esc(actionLabel(l))}</span></a></li>`;
  };
  const listOut = out.length ? out : pre.map((l) => ({ ...l, kind: 'listen', action: 'Listen' }));
  const preBlock = canPre ? `<section class="pre" aria-label="Pre-save">
<p class="tag">${esc(pre.length ? 'Pre-save now' : 'Coming soon')}</p>
<p class="when">Out <time datetime="${new Date(page.releaseAt).toISOString()}" id="when">${esc(when)}</time></p>
<div class="cd" role="timer" aria-label="Time until release" id="cd">${['Days', 'Hours', 'Min', 'Sec'].map((u, i) => `<div><b id="cd${i}">00</b><span>${u}</span></div>`).join('')}</div>
${pre.length ? `<ul class="links">${pre.map((l) => btn(l)).join('')}</ul>` : ''}
</section>` : '';
  const outBlock = (!canPre || flip) ? `<section class="out" aria-label="Listen">
${canPre ? '<p class="tag">Out now</p>' : ''}
${listOut.length ? `<ul class="links">${listOut.map((l) => btn(l)).join('')}</ul>` : '<p class="soon">Links coming soon.</p>'}
</section>` : '';
  const s = page.signup || {};
  const f = s.on ? parseFormCode(s.code) : null;
  let signup = '';
  if (f && f.ok) {
    const head = `<h2>${esc(s.heading || 'Get new music first')}</h2>${s.note ? `<p class="fine">${esc(s.note)}</p>` : ''}`;
    if (f.mode === 'post') {
      signup = `<section class="su" aria-label="Email sign-up">${head}
<form action="${esc(f.action)}" method="post" target="_blank" rel="noopener">
<label class="vh" for="em">Email address</label>
<input id="em" type="email" name="${esc(f.field)}" required autocomplete="email" inputmode="email" placeholder="you@example.com">
${f.hidden.map((h) => h.trap ? `<div class="vh" aria-hidden="true"><input type="text" name="${esc(h.name)}" tabindex="-1" value=""></div>` : `<input type="hidden" name="${esc(h.name)}" value="${esc(h.value)}">`).join('')}
<button type="submit">${esc(s.button || 'Sign up')}</button>
</form></section>`;
    } else {
      signup = `<section class="su" aria-label="Email sign-up">${head}<a class="subtn" href="${esc(safeUrl(f.action))}" target="_blank" rel="noopener">${esc(s.button || 'Sign up')}</a></section>`;
    }
  }
  const extras = extra.length ? `<section class="more" aria-label="More from ${esc(artist || 'the artist')}"><ul class="links sm">${extra.map((l) => btn(l)).join('')}</ul></section>` : '';
  const art = page.art || page.artRemote;
  const credit = page.look.credit !== false ? '<footer><a href="https://encoremusic.studio" target="_blank" rel="noopener">Made with ENCORE.</a></footer>' : '';
  const btnBg = page.look.buttons === 'accent' ? tk.accent : page.look.buttons === 'outline' ? 'transparent' : tk.card;
  const btnFg = page.look.buttons === 'accent' ? tk.onAccent : tk.text;
  const btnLine = page.look.buttons === 'outline' ? tk.text + '55' : page.look.buttons === 'accent' ? 'transparent' : tk.line;
  const actBg = page.look.buttons === 'accent' ? (tk.onAccent === '#ffffff' ? '#ffffff26' : '#0000001f') : tk.accent;
  const actFg = page.look.buttons === 'accent' ? tk.onAccent : tk.onAccent;
  const css = `*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;background:${tk.bg};color:${tk.text};font:16px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;-webkit-font-smoothing:antialiased}
.bg{position:fixed;inset:0;z-index:-1;overflow:hidden;background:radial-gradient(120% 80% at 50% 0%,${tk.accent}22,transparent 60%),linear-gradient(${tk.bg},${tk.bg2})}
.bg img{position:absolute;inset:-15%;width:130%;height:130%;object-fit:cover;filter:blur(48px) saturate(1.3);opacity:.55}
.bg::after{content:"";position:absolute;inset:0;background:linear-gradient(${tk.bg}66,${tk.bg}ee 70%)}
main{max-width:460px;margin:0 auto;padding:max(28px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(24px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));display:flex;flex-direction:column;align-items:center;text-align:center}
.art{width:min(100%,340px);aspect-ratio:1;object-fit:cover;border-radius:12px;box-shadow:0 24px 60px -12px #000a,0 0 0 1px #ffffff14;display:block;background:${tk.card}}
.noart{width:min(60%,200px);display:grid;place-items:center;font-size:72px;font-weight:800;color:${tk.onAccent};background:linear-gradient(135deg,${tk.accent},${tk.bg2});box-shadow:0 20px 50px -14px ${tk.accent}88}
h1{font-size:clamp(26px,7.5vw,34px);line-height:1.1;letter-spacing:-.02em;margin:22px 0 4px;font-weight:800;text-wrap:balance}
.by{margin:0;font-size:17px;color:${tk.muted};font-weight:600}
.blurb{margin:12px 0 0;color:${tk.muted};font-size:15px;max-width:38ch}
section{width:100%;margin-top:22px}
.tag{display:inline-block;margin:0;padding:5px 12px;border-radius:999px;background:${tk.accent};color:${tk.onAccent};font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.when{margin:10px 0 0;font-size:15px;color:${tk.muted}}
.cd{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:14px 0 4px}
.cd div{background:${tk.card};border:1px solid ${tk.line};border-radius:12px;padding:10px 4px 8px}
.cd b{display:block;font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;line-height:1.1;color:${tk.text}}
.cd span{font-size:11px;color:${tk.muted};font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.links{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px}
.lk{display:flex;align-items:center;gap:12px;min-height:58px;padding:9px 10px 9px 12px;border-radius:${shape};background:${btnBg};border:1px solid ${btnLine};color:${btnFg};text-decoration:none;font-weight:700;font-size:16px;transition:transform .15s ease,border-color .15s ease}
.lk:hover{transform:translateY(-1px);border-color:${tk.accent}}
.lk:focus-visible,.su button:focus-visible,.su input:focus-visible,footer a:focus-visible,.subtn:focus-visible{outline:3px solid ${tk.accent};outline-offset:2px}
.ic{width:34px;height:34px;flex:none;border-radius:8px;overflow:hidden;display:block}.ic svg{width:100%;height:100%;display:block}
.nm{flex:1 1 auto;text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.act{flex:none;font-size:13px;font-weight:800;padding:7px 13px;border-radius:${shape};background:${actBg};color:${actFg}}
.sm .lk{min-height:48px;font-size:15px}.sm .ic{width:28px;height:28px;border-radius:7px}.sm .act{background:transparent;color:${tk.muted};padding:6px 4px}
.soon{color:${tk.muted}}
.su{background:${tk.card};border:1px solid ${tk.line};border-radius:18px;padding:18px 16px}
.su h2{margin:0;font-size:18px;font-weight:800}.fine{margin:4px 0 0;font-size:13.5px;color:${tk.muted}}
.su form{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap}
.su input[type=email]{flex:1 1 180px;min-width:0;min-height:48px;padding:0 14px;font:inherit;border-radius:${shape};border:1px solid ${tk.line};background:${tk.bg};color:${tk.text}}
.su button,.subtn{flex:1 0 auto;min-height:48px;padding:0 20px;border:0;border-radius:${shape};background:${tk.accent};color:${tk.onAccent};font:inherit;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center}
.subtn{margin-top:12px;width:100%}
.vh{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
footer{margin-top:28px;font-size:12.5px}footer a{color:${tk.muted};text-decoration:none;font-weight:700;letter-spacing:.02em}footer a:hover{color:${tk.text}}
html[data-mode=out] .pre,html[data-mode=pre] .out{display:none}
@media (prefers-reduced-motion:reduce){.lk{transition:none}.lk:hover{transform:none}}`;
  const js = canPre ? `(function(){var T=${Number(page.releaseAt)},F=${flip ? 1 : 0},O=${Math.round(opts.clockOffset || 0)},d=document.documentElement,w=document.getElementById("when");
try{w.textContent=new Date(T).toLocaleString(undefined,{weekday:"long",month:"long",day:"numeric",hour:"numeric",minute:"2-digit"})}catch(e){}
function p(n){return(n<10?"0":"")+n}var id;function t(){var l=T-(Date.now()+O);if(l<=0){if(F)d.setAttribute("data-mode","out");for(var i=0;i<4;i++)document.getElementById("cd"+i).textContent="00";clearInterval(id);return}
var s=Math.floor(l/1e3),v=[Math.floor(s/86400),Math.floor(s/3600)%24,Math.floor(s/60)%60,s%60];for(var i=0;i<4;i++)document.getElementById("cd"+i).textContent=p(v[i])}
t();id=setInterval(t,1000)})();` : '';
  const previewJs = opts.preview ? `document.addEventListener("click",function(e){var a=e.target.closest("a");if(a){e.preventDefault();parent.postMessage({links:"open",href:a.href},"*")}});document.addEventListener("submit",function(e){e.preventDefault();parent.postMessage({links:"submit"},"*")});` : '';
  const meta = [
    `<meta property="og:type" content="music.song">`, `<meta property="og:title" content="${esc(full)}">`, `<meta property="og:description" content="${esc(desc)}">`,
    pageUrl ? `<meta property="og:url" content="${esc(pageUrl)}"><link rel="canonical" href="${esc(pageUrl)}">` : '',
    ogImage ? `<meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:alt" content="Cover art for ${esc(full)}">` : '',
    `<meta name="twitter:card" content="${ogImage ? 'summary_large_image' : 'summary'}">`, `<meta name="twitter:title" content="${esc(full)}">`, `<meta name="twitter:description" content="${esc(desc)}">`,
    ogImage ? `<meta name="twitter:image" content="${esc(ogImage)}">` : '',
  ].filter(Boolean).join('\n');
  return `<!doctype html>
<html lang="en" data-mode="${mode}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(full)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="${tk.bg}">
<meta name="color-scheme" content="${tk.dark ? 'dark' : 'light'}">
<meta name="generator" content="ENCORE. Links">
${meta}
<style>${css}</style>
</head>
<body>
<div class="bg" aria-hidden="true">${tk.blur && art ? `<img src="${esc(art)}" alt="">` : ''}</div>
<main>
${art ? `<img class="art" src="${esc(art)}" alt="Cover art for ${esc(full)}" width="340" height="340">` : `<div class="art noart" aria-hidden="true">${esc((title[0] || '♪').toUpperCase())}</div>`}
<h1>${esc(title)}</h1>
${artist ? `<p class="by">${esc(artist)}</p>` : ''}
${page.blurb ? `<p class="blurb">${esc(page.blurb)}</p>` : ''}
${preBlock}
${outBlock}
${signup}
${extras}
${credit}
</main>
${js || previewJs ? `<script>${js}${previewJs}</script>` : ''}
</body>
</html>
`;
}
