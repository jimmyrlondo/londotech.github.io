// ENCORE. Links: release pages (smart link + pre-save page) built in the browser.
import {
  PLATFORMS, LISTEN_ORDER, PRESAVE_PLATFORMS, EXTRA_PLATFORMS, THEMES, detectPlatform, songLinkUrl, mapSongLink, itunesSearchUrl, itunesLookupUrl, mapItunes, bestMatch,
  oembedUrl, mapOembed, youtubeMusicUrl, parseFormCode, PROVIDER_NAMES, releaseAt, effectiveMode, paletteFromPixels, coverColours, themeTokens, hex, newPage, newLink, mergeLinks,
  moveItem, safeUrl, esc, slug, fileNameFor, makeBackup, readBackup, buildExportHtml, formatWhen, linkName, actionLabel,
} from './links-core.js';
import { encodeQR, qrToSvg } from './links-qr.js';

const $ = (id) => document.getElementById(id);
const P = 'encore-links-';
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(P + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(P + k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(P + k); } catch {} },
};

let toastTimer;
function toast(msg, ms = 2600) {
  let t = document.querySelector('.toast');
  if (!t) { t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), ms);
}
function download(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

// ---------- pages in this browser ----------
let ids = store.get('index', []);
let pages = new Map();
for (const id of ids) { const p = store.get('page-' + id); if (p) pages.set(id, readBackup(JSON.stringify([p]))[0]); }
ids = ids.filter((id) => pages.has(id));
let page = pages.get(store.get('current')) || null;
if (!page) { page = pages.get(ids[0]) || addPage(); }

function addPage(over = {}) {
  const p = newPage(over);
  pages.set(p.id, p); ids.unshift(p.id);
  store.set('index', ids); store.set('page-' + p.id, p);
  return p;
}
let saveTimer, warned = false;
function save(now = false) {
  page.updated = Date.now();
  clearTimeout(saveTimer);
  const go = () => {
    if (!store.set('page-' + page.id, page) && !warned) { warned = true; toast('This browser is out of room. Back up your pages, then delete old ones or use smaller covers.', 6000); }
    store.set('index', ids); store.set('current', page.id);
  };
  if (now) go(); else saveTimer = setTimeout(go, 250);
}
function changed(what = {}) {
  save();
  if (what.lib !== false) renderLib();
  schedulePreview();
  if (what.share !== false && activeTab === 'share') renderShare();
}

// ---------- releases list ----------
function renderLib() {
  const lib = $('lib');
  lib.innerHTML = ids.map((id) => {
    const p = pages.get(id), mode = effectiveMode(p, Date.now());
    const art = p.art || p.artRemote;
    const sub = mode === 'pre' && p.releaseAt ? `<i class="chip pre">Pre</i>${esc(new Date(p.releaseAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}` : `<i class="chip">Out</i>${esc(p.artist || '')}`;
    return `<button class="rel${p.id === page.id ? ' on' : ''}" data-id="${p.id}">${art ? `<img src="${esc(art)}" alt="">` : `<span class="noart">${esc((p.title || '♪')[0].toUpperCase())}</span>`}<span class="tx"><b>${esc(p.title || 'Untitled release')}</b><span>${sub}</span></span></button>`;
  }).join('');
  lib.insertAdjacentHTML('beforeend', `<div style="padding:8px 4px"><button class="btn sm" id="delPage" style="width:100%">Delete this page</button></div>`);
}
$('lib').addEventListener('click', (e) => {
  const b = e.target.closest('.rel');
  if (b) { page = pages.get(b.dataset.id); store.set('current', page.id); loadPage(); if (isPhone()) setM('edit'); return; }
  if (e.target.id === 'delPage') {
    if (!confirm(`Delete "${page.title || 'Untitled release'}"? This can't be undone (unless you have a backup).`)) return;
    store.del('page-' + page.id); pages.delete(page.id); ids = ids.filter((x) => x !== page.id);
    page = pages.get(ids[0]) || addPage();
    store.set('index', ids); store.set('current', page.id); loadPage();
  }
});
$('newPage').onclick = () => { page = addPage({ artist: page.artist, links: page.links.filter((l) => l.kind === 'extra').map((l) => ({ ...newLink(l.platform, 'extra', l.url), label: l.label, hidden: l.hidden })), signup: { ...page.signup }, look: { ...page.look } }); save(true); loadPage(); setTab('song'); $('findUrl').focus(); toast('New page. Your artist name, extra links, sign-up and look came along.'); };
$('backupBtn').onclick = () => { save(true); download(`encore-links-backup-${new Date().toISOString().slice(0, 10)}.json`, makeBackup(ids.map((id) => pages.get(id))), 'application/json'); };
$('restoreBtn').onclick = () => $('importFile').click();
$('importFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  try {
    const got = readBackup(await f.text());
    let added = 0, updated = 0;
    for (const p of got) {
      const have = pages.get(p.id);
      if (have && (have.updated || 0) >= (p.updated || 0)) continue;
      if (have) updated++; else { added++; ids.push(p.id); }
      pages.set(p.id, p); store.set('page-' + p.id, p);
    }
    store.set('index', ids); renderLib();
    toast(added || updated ? `Restored: ${added} new, ${updated} updated.` : 'Nothing new in that backup. Your pages are already up to date.');
  } catch (err) { toast(err.message, 4000); }
};

// ---------- tabs ----------
let activeTab = store.get('tab', 'song');
function setTab(t) {
  activeTab = t; store.set('tab', t);
  for (const b of $('ttabs').children) b.classList.toggle('on', b.dataset.t === t);
  for (const s of document.querySelectorAll('.tab')) s.classList.toggle('on', s.dataset.tab === t);
  if (t === 'share') renderShare();
  if (t === 'look') renderLook();
  $('tbody').scrollTop = 0;
}
$('ttabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setTab(b.dataset.t); });
const isPhone = () => matchMedia('(max-width: 899px)').matches;
function setM(m) {
  document.querySelector('main').dataset.m = m;
  for (const b of $('mtabs').children) b.classList.toggle('on', b.dataset.m === m);
  if (m === 'preview') fitPhone();
}
$('mtabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setM(b.dataset.m); });

// ---------- Song tab ----------
const bindText = (id, key, opts = {}) => {
  $(id).addEventListener('input', (e) => { page[key] = e.target.value; changed(opts); });
};
bindText('title', 'title'); bindText('artist', 'artist'); bindText('blurb', 'blurb', { lib: false });
$('modeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  page.mode = b.dataset.v;
  if (page.mode === 'pre' && !page.releaseDate) {
    const d = new Date(); d.setDate(d.getDate() + ((5 - d.getDay() + 7) % 7 || 7) + 7); // the Friday after next (new music Friday)
    page.releaseDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  updateRelease(); renderSong(); renderLinks(); changed();
});
function updateRelease() { page.releaseAt = page.mode === 'pre' ? releaseAt(page.releaseDate, page.releaseTime) : page.releaseAt; }
$('relDate').addEventListener('input', (e) => { page.releaseDate = e.target.value; updateRelease(); renderSong(); changed(); });
$('relTime').addEventListener('input', (e) => { page.releaseTime = e.target.value || '00:00'; updateRelease(); renderSong(); changed(); });
$('autoFlip').addEventListener('change', (e) => { page.autoFlip = e.target.checked; changed(); });
function renderSong() {
  $('title').value = page.title; $('artist').value = page.artist; $('blurb').value = page.blurb || '';
  for (const b of $('modeSeg').children) { b.classList.toggle('on', b.dataset.v === page.mode); b.setAttribute('aria-checked', b.dataset.v === page.mode); }
  $('preBox').classList.toggle('hidden', page.mode !== 'pre');
  $('relDate').value = page.releaseDate || ''; $('relTime').value = page.releaseTime || '00:00'; $('autoFlip').checked = page.autoFlip !== false;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'your time zone';
  let note = `The countdown ends at this moment in your time zone (${tz}). Fans see it in their own time.`;
  if (page.mode === 'pre' && page.releaseAt && page.releaseAt <= Date.now()) note = `That moment has passed, so the page ${page.autoFlip !== false ? 'already shows Out now' : 'shows a finished countdown'}. Pick a later date, or switch to Out now.`;
  else if (page.mode === 'pre' && !page.releaseAt) note = 'Pick your release day to start the countdown.';
  $('tzNote').textContent = note;
  const art = page.art || page.artRemote;
  $('artPic').innerHTML = art ? `<img src="${esc(art)}" alt="Your cover art">` : 'No cover yet';
  $('artRemove').classList.toggle('hidden', !art);
}

// ---------- cover art: kept inside the page, colours read from it ----------
function loadImage(src) {
  return new Promise((res, rej) => { const im = new Image(); if (!src.startsWith('data:')) im.crossOrigin = 'anonymous'; im.onload = () => res(im); im.onerror = () => rej(new Error('image')); im.src = src; });
}
async function setArt(src, remote = '') {
  const im = await loadImage(src);
  const max = 900, k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
  const g = c.getContext('2d'); g.drawImage(im, 0, 0, c.width, c.height);
  const small = document.createElement('canvas'); small.width = small.height = 48;
  small.getContext('2d').drawImage(im, 0, 0, 48, 48);
  const pal = paletteFromPixels(small.getContext('2d').getImageData(0, 0, 48, 48).data);
  page.art = c.toDataURL('image/jpeg', 0.86);
  page.artRemote = remote;
  page.colours = coverColours(pal);
  page.palette = pal.slice(0, 6).map((p) => hex(p.rgb));
  if (page.look.theme === 'encore' && !page._themePicked) page.look.theme = 'cover';
}
$('artUpload').onclick = () => $('artFile').click();
$('artFile').onchange = async (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  const url = URL.createObjectURL(f);
  try { await setArt(url); renderSong(); changed(); toast('Cover added. The page picked up its colours.'); } catch { toast('That image could not be opened. Try a JPG or PNG.'); }
  URL.revokeObjectURL(url);
};
$('artRemove').onclick = () => { page.art = ''; page.artRemote = ''; page.colours = null; page.palette = []; if (page.look.theme === 'cover' || page.look.theme === 'blur') page.look.theme = 'encore'; renderSong(); changed(); };

// ---------- finding the song from one link ----------
async function getJson(url, ms = 9000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, credentials: 'omit' });
    const j = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, json: j };
  } finally { clearTimeout(t); }
}
function status(msg, kind = '') { const s = $('findStatus'); s.className = 'status ' + kind; s.innerHTML = msg; s.classList.toggle('hidden', !msg); }
$('slKey').value = store.get('songlink-key', '');
$('slKey').addEventListener('input', (e) => store.set('songlink-key', e.target.value.trim()));
$('slKeyClear').onclick = () => { $('slKey').value = ''; store.del('songlink-key'); };
if (store.get('songlink-key')) $('keyBox').open = true;
$('findUrl').addEventListener('keydown', (e) => { if (e.key === 'Enter') find(); });
$('findBtn').onclick = () => find();

async function find() {
  const url = $('findUrl').value.trim();
  $('cands').innerHTML = '';
  const det = detectPlatform(url);
  if (!det) { status('That doesn\'t look like a music link. Copy the share link from Spotify, Apple Music, YouTube, Deezer, TIDAL, Amazon, SoundCloud or Bandcamp.', 'bad'); return; }
  $('findBtn').disabled = true;
  let info = { title: '', artist: '', artUrl: '', links: [] }, via = [];
  const key = store.get('songlink-key', '');
  let slNote = '';
  status(key ? 'Looking it up through song.link...' : 'Looking it up...', 'busy');
  // song.link switched off keyless look-ups in 2026 (they answer 401), so without a key we skip straight to the free way
  if (!key) slNote = 'For every service at once, add a free song.link key (see below).';
  else try {
    const r = await getJson(songLinkUrl(url, key));
    if (r.ok && r.json) { info = mapSongLink(r.json); via.push('song.link'); }
    else if (r.json && /DEPRECATED|ACCESS_KEY|KEY/.test(r.json.code || '')) slNote = key ? 'song.link didn\'t accept that key.' : 'song.link now needs a free key for the full search (see below).';
    else if (r.status === 429) slNote = 'song.link is busy right now (too many look-ups). Try again in a minute.';
    else if (r.status === 400 || r.status === 404) slNote = 'song.link couldn\'t find that link.';
    else slNote = 'song.link didn\'t answer.';
  } catch { slNote = 'song.link couldn\'t be reached.'; }

  if (!info.links.length) {
    // the free way: what the link itself says, plus Apple's catalogue
    status(key ? `${esc(slNote)} Checking Apple's catalogue and your link instead...` : "Checking your link and Apple's catalogue...", 'busy');
    info.links = det.platform !== 'songlink' ? [{ platform: det.platform, url }] : [];
    try {
      if (['spotify', 'youtube', 'youtubeMusic', 'soundcloud'].includes(det.platform)) {
        const r = await getJson(oembedUrl(det.platform, url));
        if (r.ok) { Object.assign(info, mapOembed(det.platform, r.json)); via.push(PLATFORMS[det.platform].name); }
        if (det.platform === 'youtube' && det.id) info.links.push({ platform: 'youtubeMusic', url: youtubeMusicUrl(det.id) });
        if (det.platform === 'youtubeMusic' && det.id) info.links.push({ platform: 'youtube', url: 'https://www.youtube.com/watch?v=' + encodeURIComponent(det.id) });
      }
      if (det.platform === 'appleMusic' && det.id) {
        const r = await getJson(itunesLookupUrl(det.id));
        const c = r.ok ? mapItunes(r.json) : [];
        const hit = c.find((x) => x.kind === 'track' && (det.type === 'track')) || c[0];
        if (hit) { info.title = hit.kind === 'track' && det.type !== 'track' ? hit.album : hit.title; info.artist = hit.artist; info.artUrl = hit.artUrl; via.push('Apple'); }
      }
    } catch {}
    const title = info.title || page.title, artist = info.artist || page.artist;
    if (det.platform !== 'appleMusic' && title) {
      try {
        const r = await getJson(itunesSearchUrl([title, artist].filter(Boolean).join(' ')));
        const c = r.ok ? mapItunes(r.json) : [];
        const m = bestMatch(c, title, artist);
        if (m) {
          info.links.push({ platform: 'appleMusic', url: m.url });
          if (!info.artist) info.artist = m.artist;
          if (!info.artUrl || /ytimg/.test(info.artUrl)) info.artUrl = m.artUrl;
          via.push('Apple');
        } else if (c.length) showCands(c.slice(0, 5));
      } catch {}
    }
  }
  $('findBtn').disabled = false;
  if (!info.title && !info.links.length) { status('Nothing found for that link. Fill in the details below and add your links on the Links tab.', 'bad'); return; }
  if (info.title && (!page.title || page.title === info.title)) page.title = info.title;
  else if (info.title && page.title !== info.title && confirm(`Use "${info.title}" as the title instead of "${page.title}"?`)) page.title = info.title;
  if (info.artist && !page.artist) page.artist = info.artist;
  const before = page.links.filter((l) => l.kind === 'listen').length;
  page.links = mergeLinks(page, info.links, 'listen');
  const added = page.links.filter((l) => l.kind === 'listen').length - before;
  if (info.artUrl && !page.art) { try { await setArt(info.artUrl, info.artUrl); } catch { page.artRemote = info.artUrl; } }
  renderSong(); renderLinks(); changed();
  const names = info.links.map((l) => PLATFORMS[l.platform]?.name).filter(Boolean);
  const pending = $('cands').children.length ? ' Is it one of these on Apple Music?' : '';
  status(`Found ${esc(info.title || 'your song')}${info.artist ? ' by ' + esc(info.artist) : ''}: ${added ? `added ${added} link${added > 1 ? 's' : ''} (${esc(names.join(', '))})` : 'your links were already there'}.${slNote && !via.includes('song.link') ? ' ' + esc(slNote) + ' Add the other services on the Links tab.' : ''}${pending}`, 'ok');
}
function showCands(c) {
  $('cands').innerHTML = c.map((x, i) => `<button class="cand" data-i="${i}"><img src="${esc(x.artUrl.replace('1000x1000', '100x100'))}" alt=""><span><b>${esc(x.title)}</b><span>${esc(x.artist)} · ${esc(x.album)}</span></span></button>`).join('') + '<button class="btn sm" data-i="-1">None of these</button>';
  $('cands').onclick = async (e) => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const x = c[+b.dataset.i];
    $('cands').innerHTML = '';
    if (!x) return;
    page.links = mergeLinks(page, [{ platform: 'appleMusic', url: x.url }], 'listen');
    if (!page.artist) page.artist = x.artist;
    if (!page.art) { try { await setArt(x.artUrl, x.artUrl); } catch {} }
    renderSong(); renderLinks(); changed(); toast('Apple Music link added.');
  };
}

// ---------- Links tab ----------
const KIND_LISTS = { presave: PRESAVE_PLATFORMS, listen: LISTEN_ORDER, extra: EXTRA_PLATFORMS };
const ADD_TEXT = { presave: '+ Add a pre-save button', listen: '+ Add a listen button', extra: '+ Add a link' };
const URL_HINT = { presave: 'Paste the pre-save link from your distributor', listen: 'https://...', extra: 'https://...' };
function rowHtml(l, i, n) {
  const p = PLATFORMS[l.platform] || PLATFORMS.link;
  const bad = l.url && !safeUrl(l.url);
  return `<div class="lrow${l.hidden ? ' off' : ''}" data-id="${l.id}">
  <span class="lic">${p.icon}</span>
  <div class="lmain">
    <div class="lline"><input class="t lname" value="${esc(l.label)}" placeholder="${esc(p.name)}" aria-label="Button name"><input class="t lact" value="${esc(l.action)}" placeholder="${esc(actionLabel({ ...l, action: '' }))}" aria-label="Button action word"></div>
    <input class="t lurl${bad ? ' badurl' : ''}" type="url" inputmode="url" value="${esc(l.url)}" placeholder="${esc(l.platform === 'email' ? 'mailto:you@example.com' : URL_HINT[l.kind])}" aria-label="${esc(p.name)} link">
  </div>
  <div class="lbtns">
    <button class="ib" data-a="up" title="Move up" aria-label="Move up" ${i ? '' : 'disabled'}>&#8593;</button>
    <button class="ib" data-a="hide" title="${l.hidden ? 'Show on the page' : 'Hide from the page'}" aria-label="${l.hidden ? 'Show' : 'Hide'}" aria-pressed="${l.hidden}">${l.hidden ? '&#9711;' : '&#9673;'}</button>
    <button class="ib" data-a="down" title="Move down" aria-label="Move down" ${i < n - 1 ? '' : 'disabled'}>&#8595;</button>
    <button class="ib" data-a="del" title="Remove" aria-label="Remove">&#10005;</button>
  </div>
</div>`;
}
function renderLinks() {
  $('preSec').classList.toggle('hidden', page.mode !== 'pre');
  $('listenWhen').textContent = page.mode === 'pre' ? (page.autoFlip !== false ? 'shown once it\'s out' : 'switch "Out now" on yourself') : 'where fans can play it';
  for (const kind of ['presave', 'listen', 'extra']) {
    const list = page.links.filter((l) => l.kind === kind);
    $('list-' + kind).innerHTML = list.length ? list.map((l, i) => rowHtml(l, i, list.length)).join('')
      : `<div class="empty">${kind === 'listen' ? 'None yet. Find your song on the Song tab, or add them one by one.' : kind === 'presave' ? 'None yet. Add the pre-save link from your distributor.' : 'Nothing here yet.'}</div>`;
    const sel = $('add-' + kind);
    const have = new Set(list.map((l) => l.platform));
    sel.innerHTML = `<option value="">${ADD_TEXT[kind]}</option>` + KIND_LISTS[kind].map((id) => `<option value="${id}">${esc(id === 'link' ? (kind === 'presave' ? 'Pre-save link (HyperFollow, any service)' : 'Other link') : PLATFORMS[id].name)}${have.has(id) && id !== 'link' ? ' (again)' : ''}</option>`).join('');
  }
}
function findLink(el) { const row = el.closest('.lrow'); return row && page.links.find((l) => l.id === row.dataset.id); }
document.querySelector('[data-tab="links"]').addEventListener('input', (e) => {
  const l = findLink(e.target); if (!l) return;
  if (e.target.classList.contains('lname')) l.label = e.target.value;
  else if (e.target.classList.contains('lact')) l.action = e.target.value;
  else if (e.target.classList.contains('lurl')) { l.url = e.target.value.trim(); e.target.classList.toggle('badurl', !!l.url && !safeUrl(l.url)); }
  changed({ lib: false });
});
document.querySelector('[data-tab="links"]').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-a]'); if (!b) return;
  const l = findLink(b); if (!l) return;
  const same = page.links.filter((x) => x.kind === l.kind), i = same.indexOf(l);
  if (b.dataset.a === 'del') page.links = page.links.filter((x) => x !== l);
  else if (b.dataset.a === 'hide') l.hidden = !l.hidden;
  else {
    const moved = moveItem(same, i, b.dataset.a === 'up' ? -1 : 1);
    const others = page.links.filter((x) => x.kind !== l.kind);
    page.links = [...others, ...moved];
  }
  renderLinks(); changed({ lib: false });
  const again = document.querySelector(`.lrow[data-id="${l.id}"] [data-a="${b.dataset.a}"]`);
  if (again && !again.disabled) again.focus();
});
for (const kind of ['presave', 'listen', 'extra']) {
  $('add-' + kind).addEventListener('change', (e) => {
    const id = e.target.value; if (!id) return;
    const l = newLink(id, kind);
    page.links.push(l); renderLinks(); changed({ lib: false });
    document.querySelector(`.lrow[data-id="${l.id}"] .lurl`)?.focus();
  });
}

// ---------- Sign-up tab ----------
function renderSignup() {
  const s = page.signup;
  $('suOn').checked = !!s.on; $('suBox').classList.toggle('hidden', !s.on);
  $('suCode').value = s.code || ''; $('suHeading').value = s.heading || ''; $('suButton').value = s.button || ''; $('suNote').value = s.note || '';
  signupStatus();
}
function signupStatus() {
  const f = parseFormCode(page.signup.code), st = $('suStatus');
  if (!page.signup.code) { st.classList.add('hidden'); return; }
  st.classList.remove('hidden');
  if (!f.ok) { st.className = 'status bad'; st.textContent = f.error; return; }
  st.className = 'status ok';
  const who = PROVIDER_NAMES[f.provider];
  st.innerHTML = f.mode === 'post'
    ? `&#10003; Connected to <b>${esc(who)}</b>. Sign-ups go to your list (form ${esc(new URL(f.action).host)}, email box "${esc(f.field)}").`
    : `&#10003; Linked to your <b>${esc(who)}</b> sign-up page. The button opens it in a new tab. For a box right on your page, paste the embed code instead.`;
}
$('suOn').addEventListener('change', (e) => { page.signup.on = e.target.checked; renderSignup(); changed({ lib: false }); });
$('suCode').addEventListener('input', (e) => { page.signup.code = e.target.value; signupStatus(); changed({ lib: false }); });
for (const [id, k] of [['suHeading', 'heading'], ['suButton', 'button'], ['suNote', 'note']]) $(id).addEventListener('input', (e) => { page.signup[k] = e.target.value; changed({ lib: false }); });

// ---------- Look tab ----------
function renderLook() {
  const art = page.art || page.artRemote;
  $('themes').innerHTML = THEMES.map((t) => {
    const needsArt = (t.id === 'cover' || t.id === 'blur') && !page.colours;
    const tk = themeTokens({ ...page.look, theme: t.id }, page.colours);
    const bgImg = t.id === 'blur' && art ? `background-image:linear-gradient(${tk.bg}99,${tk.bg}ee),url('${esc(art)}');` : `background:${tk.bg};`;
    return `<button class="th${page.look.theme === t.id ? ' on' : ''}" data-v="${t.id}" ${needsArt ? 'disabled title="Add a cover first"' : ''} aria-pressed="${page.look.theme === t.id}"><span class="sw" style="${bgImg}"><i style="background:${tk.card};border:1px solid ${tk.line}"></i><i class="a" style="background:${tk.accent}"></i></span><b>${esc(t.name)}</b></button>`;
  }).join('');
  $('themeHelp').textContent = page.colours ? 'Cover colours and Cover blur take their colours from your artwork.' : 'Add a cover on the Song tab to unlock themes made from its colours.';
  const pal = page.palette || [];
  $('swatches').innerHTML = pal.length ? pal.map((c) => `<button class="swatch${page.look.accent === c ? ' on' : ''}" data-c="${c}" style="background:${c}" aria-label="Use colour ${c}" title="${c}"></button>`).join('') : '<span class="help" style="margin:0">Add a cover to see its colours here.</span>';
  const tk = themeTokens(page.look, page.colours);
  $('accent').value = page.look.accent || tk.accent;
  $('accentLbl').textContent = page.look.accent ? 'Your button colour' : 'Button colour (automatic)';
  for (const b of $('btnSeg').children) b.classList.toggle('on', b.dataset.v === page.look.buttons);
  for (const b of $('shapeSeg').children) b.classList.toggle('on', b.dataset.v === page.look.shape);
  $('credit').checked = page.look.credit !== false;
}
$('themes').addEventListener('click', (e) => { const b = e.target.closest('.th'); if (!b || b.disabled) return; page.look.theme = b.dataset.v; page._themePicked = true; renderLook(); changed({ lib: false }); });
$('swatches').addEventListener('click', (e) => { const b = e.target.closest('.swatch'); if (!b) return; page.look.accent = b.dataset.c; renderLook(); changed({ lib: false }); });
$('accent').addEventListener('input', (e) => { page.look.accent = e.target.value; $('accentLbl').textContent = 'Your button colour'; for (const s of $('swatches').children) s.classList.remove('on'); changed({ lib: false }); });
$('accentAuto').onclick = () => { page.look.accent = ''; renderLook(); changed({ lib: false }); };
$('btnSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; page.look.buttons = b.dataset.v; renderLook(); changed({ lib: false }); });
$('shapeSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; page.look.shape = b.dataset.v; renderLook(); changed({ lib: false }); });
$('credit').addEventListener('change', (e) => { page.look.credit = e.target.checked; changed({ lib: false }); });

// ---------- Share tab: download, address, QR ----------
const coverName = () => slug([page.artist, page.title].filter(Boolean).join(' ')) + '-cover.jpg';
function ogImageFor() {
  if (page.artRemote) return page.artRemote;
  const u = safeUrl(page.pageUrl);
  if (page.art && u) { try { return new URL(coverName(), u).href; } catch {} }
  return '';
}
const exportHtml = () => buildExportHtml(page, { ogImage: ogImageFor() });
function doDownload() {
  if (!page.title.trim()) { setTab('song'); $('title').focus(); toast('Give your release a title first.'); return; }
  download(fileNameFor(page), exportHtml(), 'text/html');
  toast(`Saved ${fileNameFor(page)}. Next: put it online (Share tab, step 4).`, 3600);
}
$('dlHtml').onclick = doDownload; $('dlHtml2').onclick = doDownload;
$('dlCover').onclick = () => { const b = page.art.split(',')[1]; const bin = atob(b), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i); download(coverName(), new Blob([arr], { type: 'image/jpeg' })); };
$('pageUrl').addEventListener('input', (e) => { page.pageUrl = e.target.value.trim(); changed({ lib: false, share: false }); renderQr(); });
$('qrWhat').addEventListener('change', () => renderQr());
let qrCurrent = null;
function qrTarget() {
  const v = $('qrWhat').value;
  if (v === 'page') return safeUrl(page.pageUrl);
  const l = page.links.find((x) => x.id === v);
  return l ? safeUrl(l.url) : '';
}
function renderShare() {
  const size = new Blob([exportHtml()]).size;
  $('dlSize').textContent = size > 1024 * 1024 ? (size / 1048576).toFixed(1) + ' MB' : Math.round(size / 1024) + ' KB';
  $('coverDl').classList.toggle('hidden', !(page.art && !page.artRemote));
  if (document.activeElement !== $('pageUrl')) $('pageUrl').value = page.pageUrl || '';
  const prev = $('qrWhat').value;
  const opts = [`<option value="page">This page${page.pageUrl ? '' : ' (add its address above)'}</option>`]
    .concat(page.links.filter((l) => safeUrl(l.url)).map((l) => `<option value="${l.id}">${esc(linkName(l))} (${l.kind === 'presave' ? 'pre-save' : l.kind === 'listen' ? 'listen' : 'link'})</option>`));
  $('qrWhat').innerHTML = opts.join('');
  if ([...$('qrWhat').options].some((o) => o.value === prev)) $('qrWhat').value = prev;
  renderQr();
}
function renderQr() {
  const c = $('qrCanvas'), g = c.getContext('2d'), url = qrTarget();
  g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  qrCurrent = null;
  $('qrPng').disabled = $('qrSvg').disabled = !url;
  if (!url) {
    g.fillStyle = '#91887d'; g.font = '600 20px system-ui'; g.textAlign = 'center';
    g.fillText($('qrWhat').value === 'page' ? 'Add your page' : 'No link', c.width / 2, c.height / 2 - 6);
    g.fillText($('qrWhat').value === 'page' ? 'address above' : 'to show', c.width / 2, c.height / 2 + 20);
    $('qrUrl').textContent = '';
    return;
  }
  try { qrCurrent = encodeQR(url); } catch (e) { $('qrUrl').textContent = e.message; return; }
  drawQr(g, qrCurrent, c.width);
  $('qrUrl').textContent = url;
}
function drawQr(g, qr, px, border = 4) {
  const n = qr.size + border * 2, k = px / n;
  g.fillStyle = '#fff'; g.fillRect(0, 0, px, px); g.fillStyle = '#000';
  for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) g.fillRect(Math.floor((x + border) * k), Math.floor((y + border) * k), Math.ceil(k), Math.ceil(k));
}
const qrName = (ext) => { const v = $('qrWhat').value; const l = page.links.find((x) => x.id === v); return slug([page.artist, page.title, l ? linkName(l) : ''].filter(Boolean).join(' ')) + '-qr.' + ext; };
$('qrPng').onclick = () => {
  if (!qrCurrent) return;
  const scale = 20, px = (qrCurrent.size + 8) * scale, c = document.createElement('canvas');
  c.width = c.height = px; drawQr(c.getContext('2d'), qrCurrent, px);
  c.toBlob((b) => download(qrName('png'), b), 'image/png');
};
$('qrSvg').onclick = () => { if (qrCurrent) download(qrName('svg'), qrToSvg(qrCurrent), 'image/svg+xml'); };

// ---------- the phone preview ----------
let previewWhen = 'now', previewTimer;
$('whenSeg').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; previewWhen = b.dataset.v; for (const x of $('whenSeg').children) x.classList.toggle('on', x === b); renderPreview(); });
function schedulePreview() { clearTimeout(previewTimer); previewTimer = setTimeout(renderPreview, 120); }
function renderPreview() {
  const canPre = page.mode === 'pre' && page.releaseAt;
  $('whenSeg').classList.toggle('hidden', !canPre);
  let clockOffset = 0;
  if (canPre && previewWhen === 'after') clockOffset = page.releaseAt - Date.now() + 1000;
  if (canPre && previewWhen === 'flip') clockOffset = page.releaseAt - Date.now() - 10000;
  const html = buildExportHtml(page, { preview: true, ogImage: ogImageFor(), clockOffset, now: Date.now() + clockOffset });
  $('pv').srcdoc = html;
}
window.addEventListener('message', (e) => {
  if (e.source !== $('pv').contentWindow || !e.data || !e.data.links) return;
  if (e.data.links === 'submit') toast('That would send the email to your list. It works on your downloaded page.');
  else toast(`That button opens ${e.data.href.slice(0, 60)} on your real page.`);
});
function fitPhone() {
  const st = $('stage'), ph = $('phone'), sc = $('screen');
  const bezel = isPhone() ? 0 : 24, pad = isPhone() ? 0 : 28;
  const w = st.clientWidth - pad, h = st.clientHeight - pad;
  if (w <= 0 || h <= 0) return;
  // on a phone the page fills the width and scrolls in its own box; on a computer the whole phone fits
  const s = isPhone() ? Math.min(1, w / 390) : Math.min(1, w / (390 + bezel), h / (844 + bezel));
  sc.style.transform = `scale(${s})`;
  sc.style.width = 390 + 'px';
  const sh = isPhone() ? Math.min(844, h / s) : 844;
  sc.style.height = sh + 'px'; $('pv').style.height = sh + 'px';
  ph.style.width = (390 * s + bezel) + 'px'; ph.style.height = (sh * s + bezel) + 'px';
  sc.style.borderRadius = Math.round((isPhone() ? 12 : 34) / s) + 'px';
}
new ResizeObserver(fitPhone).observe($('stage'));

// ---------- start ----------
function loadPage() {
  renderLib(); renderSong(); renderLinks(); renderSignup();
  if (activeTab === 'look') renderLook();
  if (activeTab === 'share') renderShare();
  $('findUrl').value = ''; status(''); $('cands').innerHTML = '';
  renderPreview();
}
// tick the release list and the timezone note when a release moment passes
setInterval(() => { if (page.mode === 'pre' && page.releaseAt && Math.abs(page.releaseAt - Date.now()) < 1500) { renderSong(); renderLib(); } }, 1000);
loadPage();
setTab(activeTab);
if (isPhone()) setM('edit');
fitPhone();
window.__links = { get page() { return page; }, formatWhen, effectiveMode, exportHtml };
