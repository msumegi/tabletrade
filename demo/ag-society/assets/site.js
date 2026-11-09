(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var topbar = document.querySelector("[data-top]");
  function measure() {
    if (!topbar) return;
    document.documentElement.style.setProperty("--chrome", topbar.offsetHeight + "px");
  }
  measure();
  window.addEventListener("resize", measure);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);

  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  var main = document.getElementById("main");
  var footer = document.querySelector(".site-footer");
  var dock = document.querySelector(".dock");

  function setOpen(open) {
    if (!nav || !toggle) return;
    if (open) measure();
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    var label = toggle.querySelector(".sr-only");
    if (label) label.textContent = open ? "Close menu" : "Menu";
    [main, footer, dock].forEach(function (el) {
      if (!el) return;
      if (open) el.setAttribute("inert", "");
      else el.removeAttribute("inert");
    });
    if (open) {
      var first = nav.querySelector("a");
      if (first) first.focus();
    }
  }

  function closeNav(restore) {
    if (!nav) return;
    var was = nav.classList.contains("is-open");
    setOpen(false);
    if (was && restore && toggle) toggle.focus();
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setOpen(!nav.classList.contains("is-open"));
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeNav(false);
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav(true);
    });
    window.addEventListener("resize", function () {
      if (window.matchMedia("(min-width: 860px)").matches) closeNav(false);
    });
  }

  function showReveals() {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-in");
    });
  }

  if (!reduce && "IntersectionObserver" in window) {
    try {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          });
        },
        { threshold: 0, rootMargin: "0px" }
      );
      document.querySelectorAll(".reveal").forEach(function (el) {
        io.observe(el);
      });
      document.documentElement.classList.add("js");
      window.setTimeout(showReveals, 1600);
    } catch (err) {
      showReveals();
    }
  } else {
    showReveals();
  }

  var form = document.querySelector("[data-demo-form]");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (typeof form.reportValidity === "function" && !form.reportValidity()) return;
      var panel = document.querySelector("[data-demo-confirm]");
      if (!panel) return;
      form.hidden = true;
      panel.hidden = false;
      var heading = panel.querySelector("h2");
      if (heading) heading.focus();
    });
  }

  var dialog = document.querySelector("[data-lightbox]");
  if (dialog && typeof dialog.showModal === "function") {
    var pic = dialog.querySelector("img");
    var cap = dialog.querySelector("[data-caption]");
    document.querySelectorAll("[data-full]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var source = btn.querySelector("img");
        var alt = source ? source.alt : "";
        pic.src = btn.getAttribute("data-full");
        pic.alt = alt;
        if (cap) cap.textContent = alt;
        dialog.showModal();
      });
    });
    dialog.addEventListener("click", function (event) {
      if (event.target === dialog || event.target.closest("[data-close]")) dialog.close();
    });
  }
})();
