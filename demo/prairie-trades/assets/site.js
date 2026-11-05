(function () {
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var root = document.documentElement;
  if (!reduce) root.classList.add("js");

  var toggle = document.querySelector("[data-nav-toggle]");
  var nav = document.querySelector("[data-nav]");
  function closeNav() {
    if (!nav || !toggle) return;
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  }
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (event) {
      if (event.target.closest("a")) closeNav();
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") closeNav();
    });
  }

  var header = document.querySelector("[data-header]");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 6);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  if (!reduce && "IntersectionObserver" in window) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          io.unobserve(entry.target);
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -6% 0px" }
    );
    document.querySelectorAll(".reveal").forEach(function (el) {
      io.observe(el);
    });
  }

  var parallax = document.querySelector("[data-parallax]");
  var allowParallax =
    parallax &&
    !reduce &&
    window.matchMedia("(min-width: 900px) and (pointer: fine)").matches;
  if (allowParallax) {
    var ticking = false;
    window.addEventListener(
      "scroll",
      function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(function () {
          var y = Math.min(window.scrollY, 800) * 0.14;
          parallax.style.transform = "translate3d(0," + y.toFixed(2) + "px,0)";
          ticking = false;
        });
      },
      { passive: true }
    );
  }

  document.querySelectorAll("[data-accordion]").forEach(function (item) {
    var btn = item.querySelector("button");
    var panel = item.querySelector("[data-panel]");
    if (!btn || !panel) return;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", open ? "false" : "true");
      panel.hidden = open;
    });
  });

  var form = document.querySelector("[data-demo-form]");
  if (form) {
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      var data = new FormData(form);
      var name = String(data.get("name") || "").trim() || "there";
      var panel = document.querySelector("[data-demo-confirm]");
      if (!panel) return;
      var slot = panel.querySelector("[data-confirm-name]");
      if (slot) slot.textContent = name;
      form.hidden = true;
      panel.hidden = false;
      var heading = panel.querySelector("h2");
      if (heading) heading.focus();
    });
  }
})();
