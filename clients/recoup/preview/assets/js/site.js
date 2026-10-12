// Mobile menu + therapist filters. The site works without this script.
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  var form = document.querySelector("[data-filters]");
  if (!form) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll(".provider-card"));
  var count = document.querySelector("[data-filter-count]");
  var empty = document.querySelector("[data-filter-empty]");

  // Allow links like /meet-the-therapists?location=dublin&status=accepting
  var params = new URLSearchParams(window.location.search);
  ["location", "status"].forEach(function (name) {
    var v = params.get(name);
    var input = v && form.querySelector('input[name="' + name + '"][value="' + v + '"]');
    if (input) input.checked = true;
  });

  function apply() {
    var loc = form.querySelector('input[name="location"]:checked').value;
    var status = form.querySelector('input[name="status"]:checked').value;
    var shown = 0;
    cards.forEach(function (card) {
      var okLoc = loc === "all" || card.getAttribute("data-locations").split(" ").indexOf(loc) !== -1;
      var okStatus = status === "all" || card.getAttribute("data-status") === status;
      card.hidden = !(okLoc && okStatus);
      if (!card.hidden) shown++;
    });
    count.textContent = "Showing " + shown + " of " + cards.length;
    empty.hidden = shown !== 0;
    var q = new URLSearchParams();
    if (loc !== "all") q.set("location", loc);
    if (status !== "all") q.set("status", status);
    var qs = q.toString();
    history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
  }
  form.addEventListener("change", apply);
  apply();
})();
