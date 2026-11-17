// Menu toggle + forms. No libraries.
(() => {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("open", !open);
    });
    // tapping anywhere outside the open menu closes it
    document.addEventListener("click", (e) => {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) toggle.click();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && nav.classList.contains("open")) { toggle.click(); toggle.focus(); }
    });
  }

  // The email a form turns into when no endpoint is set (exposed for testing).
  function mailtoFor(form, data) {
    const lines = [];
    for (const el of form.querySelectorAll("input, select, textarea")) {
      if (!el.name || el.type === "file" || el.type === "hidden" || el.closest(".hp")) continue;
      if ((el.type === "checkbox" || el.type === "radio") && !el.checked) continue;
      const v = el.value.trim();
      if (!v) continue;
      const label = el.dataset.label || form.querySelector(`label[for="${el.id}"]`)?.textContent.replace(/\(optional\)/, "").trim() || el.name;
      const same = lines.find((l) => l.label === label);
      if (same) same.v += ", " + v; else lines.push({ label, v });
    }
    const who = data.get("company") || data.get("name");
    const subject = form.dataset.subject + (who ? ` (${who})` : "");
    return `mailto:${form.dataset.to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.map((l) => `${l.label}: ${l.v}`).join("\n"))}`;
  }
  window.qisMailtoFor = mailtoFor;

  // Forms: with data-endpoint they post in the page (Formspree / Web3Forms style).
  // Without one they open the visitor's email app, addressed to data-to, with every answer filled in.
  for (const form of document.querySelectorAll("form[data-qis-form]")) {
    const status = form.querySelector(".form-status");
    const say = (msg) => { if (status) { status.textContent = msg; status.classList.add("show"); status.focus?.(); } };
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      if (form.querySelector(".hp input")?.value) return; // bots fill the hidden field
      const data = new FormData(form);
      data.delete("website_hp");
      const endpoint = form.dataset.endpoint;
      if (endpoint) {
        const btn = form.querySelector("[type=submit]");
        btn && (btn.disabled = true);
        try {
          const res = await fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } });
          if (!res.ok) throw new Error(String(res.status));
          form.reset();
          say(form.dataset.thanks || "Thanks! We got it and will be in touch within one business day.");
        } catch {
          say("Sorry, that didn't go through. Please call us or email " + form.dataset.to + ".");
        } finally { btn && (btn.disabled = false); }
        return;
      }
      location.href = mailtoFor(form, data);
      say("Your email app should open with everything filled in. Just press Send. If nothing opened, email " + form.dataset.to + " or call us.");
    });
  }
})();
