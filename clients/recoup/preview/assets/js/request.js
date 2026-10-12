// Appointment request form: prefill from the URL, validate, then POST to the request endpoint.
// In demo mode (previews) it validates and shows the confirmation without sending anything.
(function () {
  var form = document.querySelector("[data-request-form]");
  if (!form) return;
  var done = document.querySelector(".request-done");
  var errorBox = form.querySelector(".form-error");
  var therapist = form.querySelector("#rq-therapist");
  var waitNote = form.querySelector(".waitlist-note");
  var mismatch = form.querySelector(".location-mismatch");
  var childHint = form.querySelector(".hint-child");
  var startedAt = Date.now();
  var params = new URLSearchParams(window.location.search);
  var NAMES = { medina: "Medina", dublin: "Dublin", telehealth: "telehealth" };

  // Coming from a therapist's "Request" button: pre-select them.
  var pre = params.get("therapist");
  if (pre && therapist.querySelector('option[value="' + pre + '"]')) therapist.value = pre;

  function value(name) {
    var el = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]:not([type="radio"]):not([type="checkbox"])');
    return el ? el.value.trim() : "";
  }

  function refresh() {
    var opt = therapist.options[therapist.selectedIndex];
    var waitlisted = opt && opt.getAttribute("data-status") === "waitlist";
    waitNote.hidden = !waitlisted;
    if (waitlisted) waitNote.querySelector("[data-waitlist-name]").textContent = opt.textContent.split(",")[0];

    // Gentle heads-up when the chosen therapist doesn't see clients where the person wants to meet.
    var loc = value("location");
    var locs = opt && opt.getAttribute("data-locations");
    if (locs && loc && loc !== "any" && locs.split(" ").indexOf(loc) === -1) {
      var names = locs.split(" ").map(function (l) { return NAMES[l]; });
      var where = names.length < 3 ? names.join(" and ") : names.slice(0, -1).join(", ") + ", and " + names[names.length - 1];
      mismatch.textContent = opt.textContent.split(",")[0] + " sees clients in " + where + ". We'll help you find the right fit.";
      mismatch.hidden = false;
    } else {
      mismatch.hidden = true;
    }
    childHint.hidden = value("forWhom") !== "child";
  }
  form.addEventListener("change", refresh);
  refresh();

  function fail(msg, field) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
    if (field) field.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    errorBox.hidden = true;

    var required = [
      ["forWhom", "Please choose who therapy is for."],
      ["firstName", "Please enter a first name."],
      ["lastName", "Please enter a last name."],
      ["contactMethod", "Please choose the best way to reach you."],
      ["okToLeaveMessage", "Please let us know if it's OK to leave a message."],
      ["location", "Please choose where you'd like to meet."],
      ["insurance", "Please choose your insurance, or private pay or not sure."],
    ];
    for (var i = 0; i < required.length; i++) {
      if (!value(required[i][0])) return fail(required[i][1], form.querySelector('[name="' + required[i][0] + '"]'));
    }
    var phone = value("phone"), email = value("email");
    if (!phone && !email) return fail("Please give us a phone number or an email address.", form.querySelector("#rq-phone"));
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("That email address doesn't look right.", form.querySelector("#rq-email"));
    if (value("contactMethod") === "email" && !email) return fail("Please add an email address, since that's how you'd like us to reach you.", form.querySelector("#rq-email"));
    if (value("contactMethod") !== "email" && !phone) return fail("Please add a phone number, since you'd like a call or text.", form.querySelector("#rq-phone"));
    if (!form.querySelector('[name="ackNotEmergency"]').checked) return fail("Please confirm you understand this form is not for emergencies.", form.querySelector('[name="ackNotEmergency"]'));

    var payload = {
      forWhom: value("forWhom"),
      ageGroup: value("ageGroup"),
      firstName: value("firstName"),
      lastName: value("lastName"),
      phone: phone,
      email: email,
      contactMethod: value("contactMethod"),
      okToLeaveMessage: value("okToLeaveMessage"),
      bestTimes: Array.prototype.map.call(form.querySelectorAll('[name="bestTimes"]:checked'), function (c) { return c.value; }),
      location: value("location"),
      therapist: therapist.value,
      alsoMatch: !waitNote.hidden && form.querySelector('[name="alsoMatch"]').checked,
      insurance: value("insurance"),
      company: value("company"),
      elapsedMs: Date.now() - startedAt,
    };

    var button = form.querySelector(".btn-submit");
    button.disabled = true;
    button.textContent = "Sending...";

    function success() {
      if (typeof window.gtag === "function") window.gtag("event", "generate_lead", { method: "form", page_path: window.location.pathname });
      form.hidden = true;
      done.querySelector("[data-done-name]").textContent = payload.firstName;
      done.hidden = false;
      done.focus();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    if (form.getAttribute("data-demo") === "true") return setTimeout(success, 500);

    fetch(form.getAttribute("data-endpoint"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        success();
      })
      .catch(function () {
        button.disabled = false;
        button.textContent = "Send request";
        fail("Something went wrong sending your request. Please try again, or call us at " + form.getAttribute("data-phone") + ".");
      });
  });
})();
