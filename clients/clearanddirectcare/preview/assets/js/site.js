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
      if (form.getAttribute("data-demo")) {
        form.reset();
        show("Thanks! This is a preview of the new site, so messages aren't sent. On the live site, this goes straight to the concierge team.");
        return;
      }
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

// Join page demo: live order summary from the chosen plan and billing. Never charges anything.
(function () {
  var form = document.getElementById("join-form");
  if (!form || !window.CDC_PLANS) return;
  var plans = window.CDC_PLANS, services = window.CDC_SERVICES || [];
  var money = function (n) { return "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 }); };
  var setAll = function (sel, text) { document.querySelectorAll(sel).forEach(function (el) { el.textContent = text; }); };

  // Preselect from the button that brought them here (/join?plan=strategist&billing=monthly).
  var q = new URLSearchParams(location.search);
  var pre = form.querySelector('input[name=plan][value="' + (q.get("plan") || "") + '"]');
  if (pre) pre.checked = true;
  var bil = form.querySelector('input[name=billing][value="' + (q.get("billing") || "") + '"]');
  if (bil) bil.checked = true;

  function render() {
    var id = form.querySelector("input[name=plan]:checked").value;
    var billing = form.querySelector("input[name=billing]:checked").value;
    var t = plans.filter(function (p) { return p.id === id; })[0];
    var monthly = billing === "monthly";
    var setup = monthly ? t.monthlySetup : t.annualSetup;
    var price = monthly ? t.monthly : t.annual;
    setAll("[data-plan-name]", t.name);
    setAll("[data-billing-name]", monthly ? "Monthly" : "Annual");
    setAll("[data-price-label]", monthly ? "First month" : "12 months, paid once");
    setAll("[data-price]", money(price));
    setAll("[data-setup]", money(setup));
    setAll("[data-today]", money(price + setup));
    setAll("[data-year]", money((monthly ? price * 12 : price) + setup));
    setAll("[data-schedule]", monthly
      ? "Then " + money(price) + " a month for the next 11 months."
      : "Nothing more to pay for the 12 months.");
    setAll("[data-terms-billing]", monthly
      ? "You pay " + money(price) + " a month for 12 months (" + money(price * 12) + " in total)."
      : "You pay " + money(price) + " once for the full 12 months.");
    var ul = document.querySelector("[data-includes]");
    ul.innerHTML = "";
    services.forEach(function (s) {
      var v = t.includes[s.id];
      if (!v) return;
      var li = document.createElement("li");
      var unit = s.id === "urgent-care" || s.id === "physical-therapy" ? " visit" : " session";
      li.textContent = typeof v === "number" ? v + " " + s.short.toLowerCase() + unit + (v > 1 ? "s" : "") : v;
      ul.appendChild(li);
    });
  }
  form.addEventListener("change", render);
  render();

  var status = form.querySelector(".form-status");
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (!form.checkValidity()) {
      status.className = "form-status is-shown is-error";
      status.textContent = "Please fill in your details and agree to the terms to continue.";
      var bad = form.querySelector(":invalid");
      if (bad) bad.focus();
      return;
    }
    status.className = "form-status is-shown";
    status.textContent = "This is where payment would open. In this demo, nothing is charged and no account is created.";
  });
})();

// Carry the monthly/annual choice from the plan cards into the Join page link.
document.addEventListener("click", function (e) {
  var a = e.target.closest && e.target.closest('a[data-track="join"][data-plan]');
  if (!a || a.getAttribute("data-plan") === "header") return;
  var block = a.closest(".plans-block");
  if (!block) return;
  var u = new URL(a.href, location.href);
  u.searchParams.set("billing", block.getAttribute("data-billing"));
  a.href = u.pathname + u.search;
});
