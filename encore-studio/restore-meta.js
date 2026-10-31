// Encore Restore: the release details (the Release tab). Everything a record
// archivist writes down: the release itself, the people on it, its condition,
// the pictures, and the transfer chain. Each field writes straight into the
// project and calls onChange (which saves it).
import { GRADES, SLEEVE_GRADES, IMAGE_KINDS, imageName } from "./restore-project.js";
import { GENRES } from "./genres.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const RELEASE_FIELDS = [
  { key: "artist", label: "Artist" },
  { key: "title", label: "Title" },
  { key: "albumArtist", label: "Album artist", ph: "If not the artist (Various...)" },
  { key: "label", label: "Label" },
  { key: "catalog", label: "Catalog number" },
  { key: "barcode", label: "Barcode", ph: "UPC or EAN, if any" },
  { key: "year", label: "Year", mode: "numeric" },
  { key: "date", label: "Release date", ph: "1958-05-12" },
  { key: "country", label: "Country" },
  { key: "genre", label: "Genre", list: "genreList" },
  { key: "style", label: "Style", ph: "Polka, Waltz..." },
  { key: "formatDetails", label: "Format details", ph: "Vinyl, LP, Mono" },
  { key: "language", label: "Language", ph: "English, Slovenian..." },
  { key: "copyright", label: "Copyright", ph: "1958 Columbia Records" },
  { key: "collection", label: "Collection", ph: "World Polka Archive", hint: "Written as the Grouping tag" },
  { key: "conditionMedia", label: "Condition: record or tape", options: GRADES },
  { key: "conditionSleeve", label: "Condition: sleeve or case", options: SLEEVE_GRADES },
  { key: "linerNotes", label: "Liner notes", long: true, ph: "The back of the sleeve, typed out" },
];
export const TRANSFER_FIELDS = [
  { key: "by", label: "Transferred by" },
  { key: "date", label: "Transfer date", type: "date" },
  { key: "deck", label: "Turntable or deck" },
  { key: "cartridge", label: "Cartridge or head" },
  { key: "stylus", label: "Stylus", ph: "3.0 mil truncated elliptical" },
  { key: "preamp", label: "Preamp" },
  { key: "adc", label: "Converter or interface" },
  { key: "settings", label: "Settings", ph: "96 kHz, 24-bit, RIAA on" },
  { key: "archiveId", label: "Archive ID", ph: "WPA-0001" },
  { key: "notes", label: "Archive notes", long: true, ph: "Condition, repairs, anything an archivist should know" },
];
const ROLES = ["Accordion", "Button box", "Concertina", "Clarinet", "Saxophone", "Trumpet", "Trombone", "Tuba", "Banjo", "Bass", "Drums", "Piano", "Violin", "Guitar",
  "Vocals", "Band leader", "Orchestra", "Arranger", "Producer", "Engineer", "Recorded by", "Conductor", "Liner notes", "Photography", "Design"];

// <datalist>s the form uses (genres from the shared list, credit roles)
export function datalists() {
  return `<datalist id="genreList">${Object.values(GENRES).flat().map((g) => `<option value="${esc(g)}">`).join("")}</datalist>` +
    `<datalist id="roleList">${ROLES.map((r) => `<option value="${esc(r)}">`).join("")}</datalist>`;
}

function field(f, value, prefix) {
  const id = `${prefix}_${f.key}`;
  if (f.options) return `<label class="${f.long ? "full" : ""}">${esc(f.label)} <select id="${id}" data-k="${f.key}">${f.options.map(([v, n]) => `<option value="${esc(v)}" ${v === (value ?? "") ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></label>`;
  if (f.long) return `<label class="full">${esc(f.label)} <textarea id="${id}" data-k="${f.key}" placeholder="${esc(f.ph || "")}">${esc(value)}</textarea></label>`;
  return `<label title="${esc(f.hint || "")}">${esc(f.label)} <input type="${f.type || "text"}" id="${id}" data-k="${f.key}" value="${esc(value)}" placeholder="${esc(f.ph || "")}"${f.list ? ` list="${f.list}"` : ""}${f.mode ? ` inputmode="${f.mode}"` : ""}></label>`;
}

// The whole Release tab body (except the paste helper, which the page owns)
export function renderRelease(box, project, { onChange, onImage, urlFor }) {
  const r = project.release, x = project.transfer;
  box.innerHTML = `
    <div class="paneSub" id="relBasics">The release</div>
    <div class="notes">${RELEASE_FIELDS.filter((f) => !f.long).map((f) => field(f, r[f.key], "r")).join("")}${field(RELEASE_FIELDS.find((f) => f.key === "linerNotes"), r.linerNotes, "r")}</div>
    <div class="paneSub" id="relCredits">Credits <span class="note">band members and roles, producer, arranger, engineer</span></div>
    <div class="credits" id="creditRows"></div>
    <button class="small" id="addCredit">Add a credit</button>
    <div class="paneSub" id="relImages">Pictures <span class="note">the front cover goes into every file; all of them go in the archive</span></div>
    <div class="imgGrid" id="imgGrid"></div>
    <div class="paneSub" id="relTransfer">The transfer <span class="note">kept with every file and in the catalog</span></div>
    <div class="notes">${TRANSFER_FIELDS.map((f) => field(f, x[f.key], "x")).join("")}</div>`;
  for (const el of box.querySelectorAll("[id^=r_]")) el.addEventListener("change", () => { r[el.dataset.k] = el.value.trim(); onChange("release", el.dataset.k); });
  for (const el of box.querySelectorAll("[id^=x_]")) el.addEventListener("change", () => { x[el.dataset.k] = el.value.trim(); onChange("transfer", el.dataset.k); });
  const credits = box.querySelector("#creditRows");
  const drawCredits = () => {
    credits.innerHTML = project.credits.map((c, i) => `<div class="credit"><input type="text" value="${esc(c.name)}" placeholder="Name" aria-label="Name" data-i="${i}" data-f="name"><input type="text" list="roleList" value="${esc(c.role)}" placeholder="Role" aria-label="Role" data-i="${i}" data-f="role"><button class="small" data-del="${i}" aria-label="Remove">Remove</button></div>`).join("") || `<div class="note">No credits yet.</div>`;
    for (const el of credits.querySelectorAll("input")) el.onchange = () => { project.credits[+el.dataset.i][el.dataset.f] = el.value.trim(); onChange("credits"); };
    for (const b of credits.querySelectorAll("[data-del]")) b.onclick = () => { project.credits.splice(+b.dataset.del, 1); drawCredits(); onChange("credits"); };
  };
  drawCredits();
  box.querySelector("#addCredit").onclick = () => { project.credits.push({ name: "", role: "" }); drawCredits(); credits.querySelector(".credit:last-child input")?.focus(); };
  renderImages(box.querySelector("#imgGrid"), project, { onImage, urlFor });
}

// Picture slots: front, back, a label for each part, then inserts and others
export function renderImages(grid, project, { onImage, urlFor }) {
  const slots = [{ kind: "front", part: null, label: "Front cover" }, { kind: "back", part: null, label: "Back cover" },
    ...project.parts.filter((p) => p.letter || project.parts.length > 1 || true).map((p) => ({ kind: "label", part: p.id, label: `Label, ${p.name}` }))];
  const extras = (project.images || []).filter((im) => im.kind === "insert" || im.kind === "other");
  const cell = (im, slot) => `<div class="img" data-kind="${slot.kind}" data-part="${slot.part ?? ""}" data-id="${im?.id ?? ""}" tabindex="0" role="button" aria-label="${esc(slot.label)}${im ? ", replace" : ", add"}">
      ${im ? `<img src="${urlFor(im)}" alt="">` : `<span class="plus">+</span>`}<span class="cap">${esc(slot.label)}</span>${im ? `<button class="x" data-rm="${im.id}" aria-label="Remove ${esc(slot.label)}">&times;</button>` : ""}</div>`;
  grid.innerHTML = slots.map((s) => cell((project.images || []).find((im) => im.kind === s.kind && (im.part || null) === s.part), s)).join("") +
    extras.map((im) => cell(im, { kind: im.kind, part: null, label: imageName(project, im) })).join("") +
    cell(null, { kind: "insert", part: null, label: "Insert or other" });
  for (const el of grid.querySelectorAll(".img")) {
    const pick = () => onImage({ kind: el.dataset.kind, part: el.dataset.part || null, replace: el.dataset.id || null });
    el.addEventListener("click", (e) => { if (!e.target.closest("[data-rm]")) pick(); });
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    el.addEventListener("dragover", (e) => { e.preventDefault(); el.classList.add("over"); });
    el.addEventListener("dragleave", () => el.classList.remove("over"));
    el.addEventListener("drop", (e) => { e.preventDefault(); el.classList.remove("over"); const f = e.dataTransfer.files[0]; if (f) onImage({ kind: el.dataset.kind, part: el.dataset.part || null, replace: el.dataset.id || null, file: f }); });
  }
  for (const b of grid.querySelectorAll("[data-rm]")) b.onclick = (e) => { e.stopPropagation(); onImage({ remove: b.dataset.rm }); };
}
export { IMAGE_KINDS };
