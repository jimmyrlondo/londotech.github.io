// ENCORE. Set List projector: a second window with only the words, one part at a time,
// for a screen or TV. The stage view drives it (BroadcastChannel, same browser, nothing sent
// anywhere); arrow keys here move it by hand too.
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
let show = { title: "", slides: [], index: 0, black: false };
let chan = null;
try { chan = new BroadcastChannel("encore-setlist-show"); } catch {}

function render() {
  const el = $("slide"), s = show.slides[show.index];
  el.classList.toggle("black", !!show.black);
  if (!s) el.innerHTML = show.title ? `<div>${esc(show.title)}</div>` : `<div class="ttl">ENCORE. Set List</div><div>Waiting for the stage view...</div>`;
  else el.innerHTML = s.lines.map((l) => `<div>${esc(l)}</div>`).join("");
  $("where").textContent = show.slides.length ? `${show.title} · ${s ? s.name || "" : ""} ${show.index + 1}/${show.slides.length}` : show.title;
  document.title = (show.title ? show.title + " · " : "") + "Projector · ENCORE. Set List";
}
function go(d) {
  if (!show.slides.length) return;
  show.index = Math.max(0, Math.min(show.slides.length - 1, show.index + d));
  render();
  try { chan?.postMessage({ type: "slide", index: show.index }); } catch {}
}
if (chan) {
  chan.onmessage = (e) => {
    const m = e.data || {};
    if (m.type !== "show") return;
    show = { title: m.title || "", slides: Array.isArray(m.slides) ? m.slides : [], index: Math.max(0, +m.index || 0), black: !!m.black };
    render();
  };
  try { chan.postMessage({ type: "hello" }); } catch {}
}
document.addEventListener("keydown", (e) => {
  if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) { e.preventDefault(); go(1); }
  else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) { e.preventDefault(); go(-1); }
  else if (e.key === "b" || e.key === "B") { show.black = !show.black; render(); }
  else if (e.key === "f" || e.key === "F") $("full").click();
});
$("full").addEventListener("click", () => { try { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen(); } catch {} });
let idle = 0;
document.addEventListener("mousemove", () => { document.body.classList.remove("idle"); clearTimeout(idle); idle = setTimeout(() => document.body.classList.add("idle"), 2500); });
render();
window.__projector = () => ({ ...show, text: $("slide").textContent, black: $("slide").classList.contains("black") });
