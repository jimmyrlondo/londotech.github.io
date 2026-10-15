// Clear and Direct Care: menu, billing switch, contact form, and analytics events.
(function () {
  // Sends a GA4 event when analytics is on (live site with a measurement ID). Never send health details.
  function track(name, params) {
    if (typeof window.gtag === "function") window.gtag("event", name, params || {});
  }

  // Mobile menu
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
      toggle.textContent = open ? "Close" : "Menu";
    });
  }

  // Monthly / annual switch. Every plans block on the page follows the same choice.
  var blocks = document.querySelectorAll(".plans-block");
  function setBilling(mode) {
    blocks.forEach(function (b) {
      b.setAttribute("data-billing", mode);
      b.querySelectorAll("[data-set-billing]").forEach(function (btn) {
        btn.setAttribute("aria-pressed", btn.getAttribute("data-set-billing") === mode ? "true" : "false");
      });
    });
    try { localStorage.setItem("cdc-billing", mode); } catch (e) {}
  }
  document.querySelectorAll("[data-set-billing]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var mode = btn.getAttribute("data-set-billing");
      setBilling(mode);
      track("billing_toggle", { billing: mode });
    });
  });
  try {
    var saved = localStorage.getItem("cdc-billing");
    if (saved === "monthly" || saved === "annual") setBilling(saved);
  } catch (e) {}

  // Analytics: membership button clicks and email clicks.
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-track]");
    if (!a) return;
    var kind = a.getAttribute("data-track");
    if (kind === "join") {
      var block = a.closest(".plans-block");
      track("begin_checkout", {
        plan: a.getAttribute("data-plan") || "",
        billing: block ? block.getAttribute("data-billing") : "",
      });
    } else if (kind === "email") {
      track("email_click", {});
    }
  });

  // Contact form: posts to the configured endpoint, or opens a pre-filled email when none is set.
  var form = document.getElementById("contact-form");
  if (form) {
    var status = form.querySelector(".form-status");
    function show(msg, isError) {
      status.textContent = msg;
      status.className = "form-status is-shown" + (isError ? " is-error" : "");
    }
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.checkValidity()) {
        show("Please add your name, a valid email and a message.", true);
        var bad = form.querySelector(":invalid");
        if (bad) bad.focus();
        return;
      }
      var data = new FormData(form);
      if (data.get("_gotcha")) return;
      var endpoint = form.getAttribute("data-endpoint");
      var topic = data.get("topic");
      if (!endpoint) {
        var body = data.get("message") + "\n\n" + data.get("name") + (data.get("phone") ? "\n" + data.get("phone") : "");
        window.location.href = "mailto:" + form.getAttribute("data-email") +
          "?subject=" + encodeURIComponent("Website question: " + topic) +
          "&body=" + encodeURIComponent(body);
        track("generate_lead", { method: "email", topic: topic });
        return;
      }
      var btn = form.querySelector("button[type=submit]");
      btn.disabled = true;
      fetch(endpoint, { method: "POST", body: data, headers: { Accept: "application/json" } })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          form.reset();
          show("Thanks. Your message is in, and the concierge team will reply within 12 business hours.");
          track("generate_lead", { method: "form", topic: topic });
        })
        .catch(function () {
          show("Something went wrong sending that. Please email us instead at " + form.getAttribute("data-email") + ".", true);
        })
        .finally(function () { btn.disabled = false; });
    });
  }
})();
