// ENCORE. Songbook print: a song, an album or the whole songbook laid out as real pages.
// Every page is built here (not left to the browser's page breaks), so a song is fitted to
// one or two pages on purpose, choruses that repeat word for word print once, and the
// contents can list real page numbers. Layout happens in an iframe at true paper size
// (96 CSS px per inch), which is also the preview.
import { parseSong } from "./songbook-core.js";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// page sizes in CSS px, with the margins (top, sides, bottom; the bottom holds the page number)
export const PAPER = {
  letter: { name: "Letter", w: 816, h: 1056, top: 48, side: 53, bottom: 58 },
  a4: { name: "A4", w: 794, h: 1123, top: 45, side: 53, bottom: 57 },
};
const GAP_COL = 26; // between two columns

// what to try, in order, for each fit setting: one column or two, and the lyric size in points
const ONE = [[1, 11], [2, 11], [1, 10], [2, 10], [2, 9.5], [2, 9]];
const ONE_TIGHT = [...ONE, [2, 8.5], [2, 8], [2, 7.5]];
const TWO = [[1, 11], [1, 10], [2, 10.5], [2, 10], [2, 9.5], [2, 9], [2, 8.5]];
export const FITS = {
  smart: { name: "1 or 2 pages", tries: [[1, ONE], [2, TWO]], last: [2, 9] },
  one: { name: "1 page", tries: [[1, ONE_TIGHT], [2, TWO]], last: [2, 8.5] },
  natural: { name: "Don't shrink", tries: [], last: [1, 11] },
};

const CSS = (p, o) => `
  @page { size: ${p.w}px ${p.h}px; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "DM Sans", system-ui, sans-serif; color: #111; background: #d6d3d1; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .page { position: relative; width: ${p.w}px; height: ${p.h - 1}px; padding: ${p.top}px ${p.side}px ${p.bottom}px; background: #fff; overflow: hidden; margin: 18px auto; box-shadow: 0 2px 14px rgb(0 0 0 / .25); }
  .foot { position: absolute; left: ${p.side}px; right: ${p.side}px; bottom: ${Math.round(p.bottom * 0.45)}px; display: flex; justify-content: space-between; font-size: 8.5pt; color: #78716c; }
  @media print { body { background: #fff; zoom: 1 !important; } .page { margin: 0; box-shadow: none; break-after: page; } .page:last-child { break-after: auto; } }
  .cols { display: flex; gap: ${GAP_COL}px; align-items: flex-start; }
  .col { flex: 1 1 0; min-width: 0; }
  .measure { position: absolute; left: -10000px; top: 0; visibility: hidden; }

  /* the song */
  .head { display: flex; gap: 16px; align-items: flex-start; padding-bottom: 10px; margin-bottom: 12px; border-bottom: 1.5px solid #111; }
  .head img { width: 104px; height: 104px; object-fit: cover; border-radius: 3px; flex: none; }
  .head .t { min-width: 0; flex: 1 1 auto; }
  .head h1 { margin: 0; font-size: 21pt; line-height: 1.1; font-weight: 800; letter-spacing: -.01em; }
  .head .by { font-size: 11.5pt; margin-top: 3px; }
  .head .meta { font-size: 9pt; color: #57534e; margin-top: 5px; line-height: 1.45; }
  .head .meta span + span::before { content: "\\00b7"; margin: 0 6px; color: #a8a29e; }
  .head .credit { font-size: 8.5pt; color: #57534e; margin-top: 3px; }
  .boxes { display: flex; flex-wrap: wrap; gap: 4px 10px; margin: -4px 0 12px; }
  .boxes .bx { width: 58px; text-align: center; font-size: 8.5pt; font-weight: 700; }
  .boxes svg { width: 58px; height: auto; display: block; }
  .a { padding: 0; }
  .lab { font-size: .8em; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: ${o.color ? "#c2410c" : "#111"}; line-height: 1.3; padding-bottom: 1px; }
  .lab i { font-style: italic; font-weight: 500; text-transform: none; letter-spacing: 0; color: #57534e; }
  .ln { line-height: 1.28; white-space: pre-wrap; overflow-wrap: anywhere; }
  .ln.c { white-space: normal; }
  .ln.note { font-style: italic; color: #0e7490; }
  .sg { display: inline-flex; flex-direction: column; vertical-align: bottom; white-space: pre; }
  .sg b { font-size: .86em; line-height: 1.15; font-weight: 800; color: ${o.color ? "#c2410c" : "#111"}; padding-right: .25em; }
  .note { font-size: .86em; color: #44403c; font-style: italic; line-height: 1.35; padding-top: 2px; }

  /* title page, contents, album page */
  .cover { text-align: center; padding-top: 18%; }
  .cover h1 { font-size: 40pt; margin: 0; font-weight: 800; letter-spacing: -.02em; line-height: 1.05; }
  .cover .by { font-size: 16pt; margin-top: 10px; }
  .cover .sub { font-size: 10pt; color: #57534e; margin-top: 22px; }
  .toch { font-size: 22pt; font-weight: 800; margin: 0 0 14px; }
  .tr { display: flex; gap: 8px; align-items: baseline; font-size: 10.5pt; line-height: 1.55; }
  .tr .n { width: 2em; text-align: right; color: #78716c; flex: none; font-size: .9em; }
  .tr .nm { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tr .k { color: #78716c; font-size: .85em; flex: none; }
  .tr .dots { flex: 1 1 auto; border-bottom: 1px dotted #a8a29e; transform: translateY(-4px); min-width: 12px; }
  .tr .pg { flex: none; font-variant-numeric: tabular-nums; }
  .tr.cat { font-size: 9pt; font-weight: 800; letter-spacing: .1em; text-transform: uppercase; color: #78716c; padding-top: 12px; }
  .tr.fold { font-weight: 800; font-size: 11.5pt; padding-top: 6px; }
  .tr.fold .sw { width: 9px; height: 9px; border-radius: 2px; flex: none; transform: translateY(-1px); }
  .album { text-align: center; }
  .album img { display: block; margin: 0 auto 18px; object-fit: cover; border-radius: 4px; box-shadow: 0 1px 6px rgb(0 0 0 / .2); }
  .album h1 { font-size: 26pt; margin: 0; font-weight: 800; line-height: 1.1; }
  .album .by { font-size: 13pt; margin-top: 6px; }
  .album .meta { font-size: 9.5pt; color: #57534e; margin-top: 6px; }
  .album .notes { font-size: 10pt; color: #292524; margin: 12px auto 0; max-width: 80%; white-space: pre-wrap; }
  .album .list { text-align: left; max-width: 74%; margin: 18px auto 0; }
`;

// ---------- a song as blocks: [Verse 1] and its lines, with repeats printed once ----------
function blocksOf(body) {
  const out = [];
  let cur = null;
  const start = (name) => { cur = { name, lines: [] }; out.push(cur); };
  for (const l of parseSong(body)) {
    if (l.type === "meta") continue;
    if (l.type === "section") { start(l.name); continue; }
    if (l.type === "blank") { if (cur && cur.lines.length) cur = null; continue; }
    if (!cur) start(null);
    cur.lines.push(l);
  }
  return out.filter((b) => b.name || b.lines.length);
}
const sig = (b) => b.lines.map((l) => l.type === "note" ? `{${l.text}}` : l.parts.map((p) => (p.chord ? `[${p.chord}]` : "") + p.text.trim()).join("")).join("\n");
const base = (n) => String(n || "").replace(/\s*\d+\s*$/, "").trim().toLowerCase();
function lineHtml(l, chords) {
  if (l.type === "note") return `<div class="ln note">${esc(l.text)}</div>`;
  if (!chords || !l.parts.some((p) => p.chord)) return `<div class="ln">${esc(l.parts.map((p) => p.text).join("").replace(/\s+$/, "")) || "&nbsp;"}</div>`;
  let h = "";
  for (const p of l.parts) {
    const toks = p.text.match(/\S+\s*|\s+/g) || [""];
    toks.forEach((t, i) => { h += `<span class="sg"><b>${i === 0 && p.chord ? esc(p.chord) : "&nbsp;"}</b><span>${t ? esc(t) : "&nbsp;"}</span></span>`; });
  }
  return `<div class="ln c">${h}</div>`;
}
/** A song as atoms: the pieces that can't be split across a column (a part's name stays with its first two lines) */
function songAtoms(s, o) {
  const atoms = [], seen = [];
  for (const b of blocksOf(s.body)) {
    const sg = b.lines.length ? sig(b) : "";
    // printed before, word for word (or just a part's name on its own line): say so instead of printing it again
    const prev = b.lines.length >= 2 && o.repeats ? seen.find((x) => x.sig === sg) : !b.lines.length ? seen.find((x) => base(x.name) === base(b.name)) : null;
    if (prev) {
      const same = (b.name || "") === (prev.name || "");
      atoms.push({ gap: true, html: `<div class="lab">${esc(b.name || prev.name)} <i>${same ? "(repeat)" : prev.name ? `repeat ${esc(prev.name)}` : "(repeat)"}</i></div>` });
      continue;
    }
    if (b.lines.length) seen.push({ name: b.name, sig: sg });
    const lines = b.lines.map((l) => lineHtml(l, o.chords));
    const lead = (b.name ? `<div class="lab">${esc(b.name)}</div>` : "") + lines.slice(0, 2).join("");
    atoms.push({ gap: true, html: lead || "&nbsp;" });
    for (const l of lines.slice(2)) atoms.push({ html: l });
  }
  if (s.notes) atoms.push({ gap: true, html: `<div class="note">${esc(s.notes)}</div>` });
  return atoms;
}
function songHead(s, o) {
  const img = o.covers && s.cover ? `<img src="${s.cover}" alt="">` : "";
  return `<div class="head">${img}<div class="t"><h1>${esc(s.title)}</h1>${s.artist ? `<div class="by">${esc(s.artist)}</div>` : ""}
    ${s.meta?.length ? `<div class="meta">${s.meta.map((m) => `<span>${esc(m)}</span>`).join("")}</div>` : ""}${s.credit ? `<div class="credit">${esc(s.credit)}</div>` : ""}</div></div>`
    + (o.boxes && s.boxes?.length ? `<div class="boxes">${s.boxes.map((b) => `<div class="bx">${esc(b.name)}${b.svg}</div>`).join("")}</div>` : "");
}

// ---------- measuring and packing ----------
function measurer(doc) {
  const m = doc.createElement("div");
  m.className = "measure";
  doc.body.appendChild(m);
  return {
    heights(htmls, width, fs) {
      m.style.width = width + "px"; m.style.fontSize = fs + "pt";
      m.innerHTML = htmls.map((h) => `<div class="a">${h}</div>`).join("");
      return [...m.children].map((c) => c.getBoundingClientRect().height);
    },
    height(html, width, fs = 11) { return this.heights([html], width, fs)[0]; },
    done() { m.remove(); },
  };
}
// fill columns of `cap` px (the first page loses `first` px to the header); gap between parts is `gapPx`
function pack(hs, gaps, cols, cap, first, gapPx) {
  const pages = [];
  let page = null, col = null, used = 0, room = 0;
  const newPage = () => { page = { cols: [] }; pages.push(page); room = cap - (pages.length === 1 ? first : 0); newCol(); };
  const newCol = () => { if (page.cols.length >= cols) { newPage(); return; } col = []; page.cols.push(col); used = 0; };
  newPage();
  hs.forEach((h, i) => {
    let need = h + (col.length && gaps[i] ? gapPx : 0);
    if (col.length && used + need > room) { newCol(); need = h; }
    col.push(i); used += need;
  });
  return pages;
}
// the last page's two columns evened out (so it doesn't read as one long column and a stub)
function balanceLast(pages, hs, gaps, cap, first, gapPx) {
  const last = pages[pages.length - 1];
  if (last.cols.length < 2) return;
  const idx = last.cols.flat(), room = cap - (pages.length === 1 ? first : 0);
  let lo = Math.max(...idx.map((i) => hs[i])), hi = room;
  const fits = (H) => { const p = pack(idx.map((i) => hs[i]), idx.map((i) => gaps[i]), 2, H, 0, gapPx); return p.length === 1; };
  if (!fits(hi)) return;
  for (let k = 0; k < 14; k++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  const p = pack(idx.map((i) => hs[i]), idx.map((i) => gaps[i]), 2, hi + 0.5, 0, gapPx)[0];
  last.cols = p.cols.map((c) => c.map((j) => idx[j]));
}
function layoutSong(mz, s, o, P) {
  const W = P.w - 2 * P.side, cap = P.h - P.top - P.bottom;
  const head = songHead(s, o), headH = mz.height(head, W) + 2;
  const atoms = songAtoms(s, o), gaps = atoms.map((a) => !!a.gap);
  const tryOne = (cols, fs) => {
    const cw = cols === 1 ? W : (W - GAP_COL) / 2;
    const hs = mz.heights(atoms.map((a) => a.html), cw, fs);
    const gapPx = fs * 1.333 * 0.62;
    const pages = pack(hs, gaps, cols, cap, headH, gapPx);
    if (cols === 2) balanceLast(pages, hs, gaps, cap, headH, gapPx);
    return { cols, fs, pages, gapPx };
  };
  const fit = FITS[o.fit] || FITS.smart;
  let best = null;
  for (const [limit, tries] of fit.tries) {
    for (const [cols, fs] of tries) { const r = tryOne(cols, fs); if (r.pages.length <= limit) { best = r; break; } }
    if (best) break;
  }
  best ||= tryOne(...fit.last);
  const pages = best.pages.map((pg, n) => (n === 0 ? head : "") + `<div class="cols" style="font-size:${best.fs}pt">${pg.cols.map((c) => `<div class="col">${c.map((i, j) => `<div class="a"${j && gaps[i] ? ` style="margin-top:${best.gapPx.toFixed(1)}px"` : ""}>${atoms[i].html}</div>`).join("")}</div>`).join("")}</div>`);
  return { pages, fs: best.fs, cols: best.cols };
}

// ---------- the book ----------
/**
 * Lay out a book in `frame` (an iframe) and return what it made.
 * book: { kind: "song"|"album"|"all", title, artist, date, groups: [{ name, folders: [{ id, name, color, artist, meta: [..], notes, cover, songs: [song] }] }] }
 * song: { id, title, artist, meta: [..], credit, notes, cover, body, boxes: [{name, svg}], track }
 * o: { paper, fit, chords, repeats, covers, boxes, color, albumPages, contents, zoom }
 * returns { pages, songs: [{ id, title, pages, fs, cols }] }
 */
export async function renderBook(frame, book, o = {}) {
  o = { paper: "letter", fit: "smart", chords: true, repeats: true, covers: true, boxes: false, color: true, albumPages: true, contents: true, zoom: 1, ...o };
  const P = PAPER[o.paper] || PAPER.letter;
  const doc = frame.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(book.title || "Songbook")}</title>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400..800&display=swap" rel="stylesheet"><style>${CSS(P, o)}</style></head><body></body></html>`);
  doc.close();
  try { await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 2500))]); await doc.fonts.load("800 20px 'DM Sans'"); await doc.fonts.load("400 14px 'DM Sans'"); } catch {}
  const mz = measurer(doc), W = P.w - 2 * P.side, cap = P.h - P.top - P.bottom;
  const out = []; // { html, foot }
  const songsOut = [];
  const multi = book.kind !== "song";
  const footName = book.kind === "album" ? book.groups[0]?.folders[0]?.name || book.title : book.title;

  // songs first (so the contents know the page numbers), placed in book order afterwards
  const laid = new Map();
  for (const g of book.groups) for (const f of g.folders) for (const s of f.songs) laid.set(s.id, layoutSong(mz, s, o, P));

  // album page: the cover as big as fits with the track list
  const albumPage = (f, pageOf) => {
    const list = f.songs.map((s, i) => `<div class="tr"><span class="n">${i + 1}</span><span class="nm">${esc(s.title)}</span>${s.key ? `<span class="k">${esc(s.key)}</span>` : ""}<span class="dots"></span><span class="pg">${pageOf(s.id) ?? ""}</span></div>`).join("");
    const text = `<h1>${esc(f.name)}</h1>${f.artist ? `<div class="by">${esc(f.artist)}</div>` : ""}${f.meta?.length ? `<div class="meta">${f.meta.map(esc).join(" · ")}</div>` : ""}${f.notes ? `<div class="notes">${esc(f.notes)}</div>` : ""}<div class="list">${list}</div>`;
    let size = 0;
    if (o.covers && f.cover) { const rest = mz.height(`<div class="album">${text}</div>`, W); size = Math.max(0, Math.min(W * 0.72, cap - rest - 30)); if (size < 120) size = 0; }
    return `<div class="album">${size ? `<img src="${f.cover}" alt="" style="width:${size}px;height:${size}px">` : ""}${text}</div>`;
  };
  // contents rows (their heights don't depend on the numbers, so lay them out once, fill numbers after)
  const tocRows = [];
  if (book.kind === "all" && o.contents) {
    for (const g of book.groups) {
      if (book.groups.length > 1 && g.name) tocRows.push({ html: () => `<div class="tr cat">${esc(g.name)}</div>` });
      for (const f of g.folders) {
        if (f.name) tocRows.push({ html: (pg) => `<div class="tr fold">${f.color ? `<span class="sw" style="background:${f.color}"></span>` : ""}<span class="nm">${esc(f.name)}</span>${f.artist ? `<span class="k">${esc(f.artist)}</span>` : ""}<span class="dots"></span><span class="pg">${pg("f:" + f.id) ?? ""}</span></div>` });
        f.songs.forEach((s, i) => tocRows.push({ html: (pg) => `<div class="tr"><span class="n">${f.name ? i + 1 : ""}</span><span class="nm">${esc(s.title)}</span>${s.key ? `<span class="k">${esc(s.key)}</span>` : ""}<span class="dots"></span><span class="pg">${pg(s.id) ?? ""}</span></div>` }));
      }
    }
  }
  const tocHead = `<div class="toch">Contents</div>`;
  let tocPages = [];
  if (tocRows.length) {
    const hs = mz.heights(tocRows.map((r) => r.html(() => 888)), W, 11), headH = mz.height(tocHead, W);
    tocPages = pack(hs, hs.map(() => false), 1, cap, headH, 0);
  }

  // page numbers: title page, contents, then each folder (its album page, its songs)
  const pageNo = new Map();
  let n = 1;
  if (book.kind === "all") n += 1 + tocPages.length;
  const albumOn = (f) => (book.kind === "album" || (book.kind === "all" && o.albumPages)) && f.name;
  for (const g of book.groups) for (const f of g.folders) {
    if (albumOn(f)) { pageNo.set("f:" + f.id, n); n += 1; }
    for (const s of f.songs) { pageNo.set(s.id, n); if (!pageNo.has("f:" + f.id)) pageNo.set("f:" + f.id, n); n += laid.get(s.id).pages.length; }
  }
  const pg = (id) => pageNo.get(id);

  if (book.kind === "all") {
    const count = book.groups.reduce((a, g) => a + g.folders.reduce((b, f) => b + f.songs.length, 0), 0);
    out.push({ html: `<div class="cover"><h1>${esc(book.title || "Songbook")}</h1>${book.artist ? `<div class="by">${esc(book.artist)}</div>` : ""}<div class="sub">${count} song${count === 1 ? "" : "s"}${book.date ? ` · ${esc(book.date)}` : ""}</div></div>`, foot: false });
    tocPages.forEach((p, i) => out.push({ html: (i === 0 ? tocHead : "") + p.cols[0].map((j) => tocRows[j].html(pg)).join(""), foot: true }));
  }
  for (const g of book.groups) for (const f of g.folders) {
    if (albumOn(f)) out.push({ html: albumPage(f, pg), foot: book.kind === "all" });
    for (const s of f.songs) {
      const L = laid.get(s.id);
      L.pages.forEach((h, i) => out.push({ html: h, foot: multi || L.pages.length > 1, song: s, part: i + 1, of: L.pages.length }));
      songsOut.push({ id: s.id, title: s.title, pages: L.pages.length, fs: L.fs, cols: L.cols });
    }
  }
  mz.done();
  doc.body.innerHTML = out.map((p, i) => `<div class="page">${p.html}${p.foot ? `<div class="foot"><span>${esc(multi ? footName || "" : p.song?.title || "")}</span><span>${multi ? i + 1 : `${p.part} of ${p.of}`}</span></div>` : ""}</div>`).join("");
  doc.body.style.zoom = String(o.zoom);
  return { pages: out.length, songs: songsOut };
}
