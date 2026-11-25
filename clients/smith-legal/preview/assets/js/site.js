// Mobile menu toggle + court list filter. No dependencies.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = toggle.getAttribute("aria-expanded") === "true";
      toggle.setAttribute("aria-expanded", String(!open));
      nav.classList.toggle("open", !open);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("open");
        toggle.focus();
      }
    });
    // A tap outside the open menu only closes it; it must not also follow a link underneath.
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !nav.contains(e.target) && !toggle.contains(e.target)) {
        e.preventDefault();
        e.stopPropagation();
        toggle.setAttribute("aria-expanded", "false");
        nav.classList.remove("open");
      }
    }, true);
  }

  var filter = document.getElementById("court-filter");
  if (filter) {
    var items = document.querySelectorAll("[data-court]");
    var count = document.getElementById("court-count");
    filter.addEventListener("input", function () {
      var q = filter.value.trim().toLowerCase();
      var shown = 0;
      items.forEach(function (li) {
        var hit = !q || li.textContent.toLowerCase().indexOf(q) !== -1;
        li.hidden = !hit;
        if (hit) shown++;
      });
      if (count) count.textContent = q ? shown + " match" + (shown === 1 ? "" : "es") : "";
    });
  }

  // Contact form: no backend yet, so it opens the visitor's email app with the message filled in.
  var form = document.querySelector("form.contact");
  if (form && !form.getAttribute("action")) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var d = new FormData(form);
      var body = "Name: " + (d.get("name") || "") + "\nPhone: " + (d.get("phone") || "") + "\nEmail: " + (d.get("email") || "") +
        "\nTopic: " + (d.get("topic") || "") + "\nCounty: " + (d.get("county") || "") + "\n\n" + (d.get("message") || "");
      window.location.href = "mailto:" + form.dataset.to + "?subject=" + encodeURIComponent("Website inquiry: " + (d.get("topic") || "General")) +
        "&body=" + encodeURIComponent(body);
    });
  }
})();
