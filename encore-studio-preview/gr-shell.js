// ENCORE. Green Room: the shell every tool shares.
// Adds the current tool's name and icon to the bar and an "All tools" launcher (a searchable
// sheet of every tool, grouped, with icons). The old tab strip and drop-down stay in the page
// (hidden by gr.css) so anything that reads them keeps working.
//   <script type="module" src="gr-shell.js"></script>
// Ctrl+K (or Cmd+K) opens the launcher from anywhere; Esc closes it.

const I = {
  journey: '<circle cx="5.5" cy="18" r="2.5"/><circle cx="18.5" cy="6" r="2.5"/><path d="M8 18h7.5a3.5 3.5 0 0 0 0-7h-7a3.5 3.5 0 0 1 0-7H16"/>',
  master: '<path d="M3 12h2.5l2-6 3.5 13 3-10 2 5 1.5-2H21"/>',
  live: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4.5M8.5 21.5h7"/>',
  lastcall: '<circle cx="12" cy="12" r="9"/><path d="m8.5 12.2 2.4 2.4 4.6-4.9"/>',
  convert: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  clips: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="m10.5 9 4 3-4 3z"/>',
  links: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  credits: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  songbook: '<path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7.5h6M9 11h4"/>',
  compose: '<path d="M9 18V5.5l10-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
  tune: '<path d="M4.5 17a8.5 8.5 0 1 1 15 0"/><path d="m12 14 3.5-5.5"/><circle cx="12" cy="14.5" r="1.2"/>',
  metronome: '<path d="M7 21 10 3h4l3 18z"/><path d="m12 15 5.5-8.5M7.6 17.5h8.8"/>',
  beatpad: '<rect x="3" y="3" width="5" height="5" rx="1.2"/><rect x="9.5" y="3" width="5" height="5" rx="1.2"/><rect x="16" y="3" width="5" height="5" rx="1.2"/><rect x="3" y="9.5" width="5" height="5" rx="1.2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1.2"/><rect x="16" y="9.5" width="5" height="5" rx="1.2"/><rect x="3" y="16" width="5" height="5" rx="1.2"/><rect x="9.5" y="16" width="5" height="5" rx="1.2"/><rect x="16" y="16" width="5" height="5" rx="1.2"/>',
  restore: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2.5"/><path d="M12 5.5a6.5 6.5 0 0 1 6.5 6.5"/>',
  tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  chords: '<path d="M6 3v18M10 3v18M14 3v18M18 3v18M6 7h12M6 12h12M6 17h12"/><circle cx="10" cy="9.5" r="1.4" fill="currentColor"/><circle cx="14" cy="14.5" r="1.4" fill="currentColor"/>',
  scales: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8.5 4v16M15.5 4v16"/><path d="M6.8 4v9h3.4V4M13.8 4v9h3.4V4" fill="currentColor"/>',
  voice: '<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
  basement: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M6.5 12.5V9M9.5 12.5V7.5M12.5 12.5v-2M15.5 12.5V8"/>',
  vst: '<path d="M9 2.5V7M15 2.5V7M6.5 7h11v4a5.5 5.5 0 0 1-11 0zM12 16.5v5"/>',
  playground: '<path d="M9 3h6M10 3v6l-5.2 9.1A2 2 0 0 0 6.5 21h11a2 2 0 0 0 1.7-2.9L14 9V3M7.5 15h9"/>',
  cassette: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><circle cx="8" cy="11" r="2"/><circle cx="16" cy="11" r="2"/><path d="M10 11h4M6 19l1.5-3.5h9L18 19"/>',
  chip: '<rect x="2.5" y="7" width="19" height="10" rx="3.5"/><path d="M6.5 12h4M8.5 10v4"/><circle cx="15.5" cy="11" r="1" fill="currentColor"/><circle cx="18" cy="13" r="1" fill="currentColor"/>',
  chipguitar: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12z"/>',
  chop: '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12"/>',
  drums: '<ellipse cx="12" cy="7.5" rx="8" ry="3"/><path d="M4 7.5v8c0 1.7 3.6 3 8 3s8-1.3 8-3v-8M4.5 11l3.5 6.5M19.5 11 16 17.5"/>',
  ear: '<path d="M6.5 9a5.5 5.5 0 0 1 11 0c0 4-4 4.5-4 8.5a2.5 2.5 0 0 1-5 0"/><path d="M10 9.5a2 2 0 0 1 4 0c0 1.5-1.5 1.8-1.5 3"/>',
  parts: '<circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="8" r="3"/><path d="M2.5 20a5.5 5.5 0 0 1 11 0M11 20a5.5 5.5 0 0 1 11 0"/>',
  practice: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  setlist: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
  sfx: '<path d="m12 3 2 5.5L19.5 10.5 14 12.5 12 18l-2-5.5-5.5-2L10 8.5zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  slowed: '<path d="M20.5 14A8.5 8.5 0 1 1 10 3.5a6.5 6.5 0 0 0 10.5 10.5z"/>',
  tabs: '<path d="M5 20V9M8.5 20V6M12 20V3.5M15.5 20V6M19 20V9M3 20.5h18"/>',
  tunebook: '<path d="M2.5 4.5H8a4 4 0 0 1 4 4V21a3 3 0 0 0-3-3H2.5zM21.5 4.5H16a4 4 0 0 0-4 4V21a3 3 0 0 1 3-3h6.5z"/>',
  voicebank: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4.5"/><path d="M19 3v4M17 5h4"/>',
  grid: '<circle cx="5" cy="5" r="1.6"/><circle cx="12" cy="5" r="1.6"/><circle cx="19" cy="5" r="1.6"/><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/><circle cx="5" cy="19" r="1.6"/><circle cx="12" cy="19" r="1.6"/><circle cx="19" cy="19" r="1.6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
};

export const icon = (k, cls = "grIcon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k] || I.grid}</svg>`;

// Every tool, in the order people meet them. group: shown in the launcher; blurb: one line.
export const TOOLS = [
  { id: "journey", name: "Journey", group: "Release your music", blurb: "Mix to release in one place: master, tag, check, download." },
  { id: "master", name: "Master", group: "Release your music", blurb: "Master a mix and hear exactly what changed." },
  { id: "live", name: "Live", group: "Release your music", blurb: "Turn a show recording into a live album." },
  { id: "lastcall", name: "Last Call", group: "Release your music", blurb: "The final check before you release." },
  { id: "convert", name: "Convert", group: "Release your music", blurb: "Any audio format to any other, tags kept." },
  { id: "clips", name: "Clips", group: "Get it heard", blurb: "Vertical videos of your hook, lyrics on screen." },
  { id: "links", name: "Links", group: "Get it heard", blurb: "A release page with every service and pre-saves." },
  { id: "credits", name: "Credits", group: "Get it heard", blurb: "Codes, credits, splits and where to register." },
  { id: "songbook", name: "Songbook", group: "Write and play", blurb: "Lyrics and chords, rhymes, any instrument." },
  { id: "compose", name: "Compose", group: "Write and play", blurb: "Sheet music from clicks, typing or a keyboard." },
  { id: "tune", name: "Tune", group: "Write and play", blurb: "A tuner for 87 instruments and 229 tunings." },
  { id: "metronome", name: "Metronome", group: "Write and play", blurb: "A click that tells you where you rush or drag." },
  { id: "beatpad", name: "Beatpad", group: "Write and play", blurb: "Nine drum pads, real kits and a loop recorder." },
  { id: "restore", name: "Restore", group: "Write and play", blurb: "Digitize records and tapes, clean them up." },
  { id: "tag", name: "Tag", group: "Write and play", blurb: "Everything distributors ask for, without touching audio." },
  { id: "chords", name: "Chords", group: "Learn", blurb: "Name any chord, build progressions that work." },
  { id: "scales", name: "Scales", group: "Learn", blurb: "47 scales on any neck or keyboard." },
  { id: "voice", name: "Voice", group: "Learn", blurb: "A voice coach that listens." },
  { id: "slowed", name: "Slowed + Reverb", group: "Playground", blurb: "Slowed and reverb edits of your song." },
  { id: "practice", name: "Practice", group: "Playground", blurb: "Slow a song down without changing its pitch." },
  { id: "cassette", name: "Cassette", group: "Playground", blurb: "Plan a tape: sides, timing and the J-card." },
  { id: "chop", name: "Chop", group: "Playground", blurb: "Chop a sample into pads and play it." },
  { id: "parts", name: "Learning Tracks", group: "Playground", blurb: "Choir and band parts to learn by ear." },
  { id: "setlist", name: "Set List", group: "Playground", blurb: "Build the set, run it on stage." },
  { id: "tunebook", name: "Tune Book", group: "Playground", blurb: "Folk tunes, written out and playable." },
  { id: "tabs", name: "Tabs", group: "Playground", blurb: "Kalimba and simple instrument tabs." },
  { id: "ear", name: "Ear", group: "Playground", blurb: "Train your ear: intervals, chords, rhythm." },
  { id: "drums", name: "Drums", group: "Playground", blurb: "Program a drum part on a grid." },
  { id: "chip", name: "Chip", group: "Playground", blurb: "Write chiptune with classic console sounds." },
  { id: "chipguitar", name: "Chip Guitar", group: "Playground", blurb: "Play guitar, hear an 8-bit synth." },
  { id: "sfx", name: "SFX", group: "Playground", blurb: "Make game and video sound effects." },
  { id: "voicebank", name: "Voicebank", group: "Playground", blurb: "Record your own singing voice." },
  { id: "basement", name: "Basement Studio", group: "Desktop", blurb: "The free ENCORE. studio for your computer." },
  { id: "vst", name: "ENCORE. VST", group: "Desktop", blurb: "ENCORE. plugins for any DAW." },
];

const here = (location.pathname.split("/").pop() || "index.html").replace(/\.html$/, "") || "index";
// Playground tools only show in the launcher on a deploy that has them (their page exists here).
const pgPage = document.querySelector('.bar .tools a[href="playground.html"]');

function build() {
  const bar = document.querySelector(".bar");
  if (!bar || bar.querySelector(".grLaunch")) return;
  document.documentElement.classList.add("gr");
  const tool = TOOLS.find((t) => t.id === here);
  const home = bar.querySelector(".home");
  const chipLabel = home?.querySelector(".chip-label");
  if (chipLabel) chipLabel.textContent = "GREEN ROOM";

  const cur = document.createElement("div");
  cur.className = "grCurrent";
  if (tool) cur.innerHTML = `<span class="grBadge">${icon(tool.id)}</span><span class="grName"><b></b><small></small></span>`;
  if (tool) { cur.querySelector("b").textContent = tool.name; cur.querySelector("small").textContent = tool.group; }

  const btn = document.createElement("button");
  btn.type = "button"; btn.className = "grLaunch";
  btn.setAttribute("aria-haspopup", "dialog");
  btn.innerHTML = `${icon("grid")}<span>All tools</span><kbd>Ctrl K</kbd>`;
  if (/Mac|iPhone|iPad/.test(navigator.platform)) btn.querySelector("kbd").textContent = "⌘K";
  btn.addEventListener("click", open);

  (home || bar.firstChild).after(cur);
  cur.after(btn);
}

let sheet = null, lastFocus = null;
function makeSheet() {
  sheet = document.createElement("div");
  sheet.className = "grSheet"; sheet.hidden = true;
  sheet.setAttribute("role", "dialog"); sheet.setAttribute("aria-modal", "true"); sheet.setAttribute("aria-label", "All ENCORE. Green Room tools");
  const groups = [...new Set(TOOLS.map((t) => t.group))];
  const showPg = !!pgPage || TOOLS.some((t) => t.group === "Playground" && t.id === here);
  sheet.innerHTML = `<div class="grSheetIn">
    <div class="grSearch">${icon("search")}<input type="search" placeholder="Find a tool: master, tuner, chords..." aria-label="Find a tool"><button type="button" class="grClose" aria-label="Close">Esc</button></div>
    <div class="grGroups">${groups.filter((g) => g !== "Playground" || showPg).map((g) => `<section><h3>${g}</h3><div class="grTiles">${TOOLS.filter((t) => t.group === g).map((t) =>
      `<a class="grTile${t.id === here ? " on" : ""}" href="${t.id}.html" data-q="${(t.name + " " + t.blurb + " " + g).toLowerCase()}"><span class="grBadge">${icon(t.id)}</span><span><b>${t.name}</b><small>${t.blurb}</small></span></a>`).join("")}</div></section>`).join("")}
      <p class="grNone" hidden>No tool matches that. Try "mix", "tuner" or "drums".</p></div></div>`;
  document.body.append(sheet);
  const q = sheet.querySelector("input");
  q.addEventListener("input", () => {
    const words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
    let any = false;
    for (const sec of sheet.querySelectorAll("section")) {
      let n = 0;
      for (const a of sec.querySelectorAll(".grTile")) { const ok = words.every((w) => a.dataset.q.includes(w)); a.hidden = !ok; if (ok) n++; }
      sec.hidden = !n; any ||= !!n;
    }
    sheet.querySelector(".grNone").hidden = any;
  });
  q.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = sheet.querySelector(".grTile:not([hidden])"); if (a) location.href = a.href; } });
  sheet.addEventListener("click", (e) => { if (e.target === sheet || e.target.closest(".grClose")) close(); });
  sheet.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
    if (e.key === "Tab") { // keep focus inside the sheet
      const f = [...sheet.querySelectorAll("input, button, a:not([hidden])")].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus(); }
    }
  });
}
function open() {
  if (!sheet) makeSheet();
  lastFocus = document.activeElement;
  sheet.hidden = false;
  requestAnimationFrame(() => sheet.classList.add("show"));
  const q = sheet.querySelector("input"); q.value = ""; q.dispatchEvent(new Event("input")); q.focus();
}
function close() {
  if (!sheet || sheet.hidden) return;
  sheet.classList.remove("show"); sheet.hidden = true;
  lastFocus?.focus?.();
}
export const openLauncher = open;

addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "k") { e.preventDefault(); sheet && !sheet.hidden ? close() : open(); }
});

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", build); else build();
