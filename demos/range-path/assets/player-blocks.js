/* Interactive lesson blocks. Progress goes through RangePathData. */
(function () {
  "use strict";

  function api() {
    return window.RangePathData || null;
  }

  function courseId() {
    var gate = document.querySelector("[data-course-gate]");
    return gate ? gate.getAttribute("data-course-gate") : "";
  }

  function learnerId() {
    var store = api();
    var user = store && store.getSessionUser ? store.getSessionUser() : null;
    return user ? user.id : "";
  }

  function remember(itemId, kind) {
    var store = api();
    var who = learnerId();
    var course = courseId();
    if (!store || !who || !course) return;
    store.saveProgress({
      learnerId: who,
      courseId: course,
      itemId: itemId,
      kind: kind,
      status: "done",
      at: new Date().toISOString()
    });
    paintBadges();
  }

  function earned(itemId) {
    var store = api();
    var who = learnerId();
    var course = courseId();
    if (!store || !who || !course || !store.listProgress) return false;
    return store.listProgress(who, course).some(function (row) {
      return row.itemId === itemId && row.status === "done";
    });
  }

  function paintBadges() {
    document.querySelectorAll("[data-badge]").forEach(function (badge) {
      var type = badge.getAttribute("data-when");
      var id = badge.getAttribute("data-when-id");
      var on = false;
      if (type === "simulationComplete") on = earned("sim:" + id);
      if (type === "assignmentTried") on = earned("assignment:" + id) || earned("badge:" + badge.getAttribute("data-badge"));
      if (type === "finalPassed") {
        var store = api();
        var view = store && store.getProgress ? store.getProgress(learnerId(), courseId()) : null;
        on = Boolean(view && view.final && view.final.passed);
      }
      badge.setAttribute("data-earned", on ? "true" : "false");
    });
  }

  function setupListen() {
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== "function") return;
    document.querySelectorAll("[data-listen]").forEach(function (button) {
      button.hidden = false;
      button.addEventListener("click", function () {
        if (window.speechSynthesis.speaking) {
          window.speechSynthesis.cancel();
          button.textContent = "Listen to this section";
          return;
        }
        var section = button.closest("section");
        var text = section ? section.innerText : "";
        var utter = new SpeechSynthesisUtterance(text);
        utter.lang = "en-CA";
        button.textContent = "Stop";
        utter.onend = function () { button.textContent = "Listen to this section"; };
        window.speechSynthesis.speak(utter);
      });
    });
  }

  function setupChecks() {
    document.querySelectorAll("[data-check]").forEach(function (form) {
      var keyNode = form.querySelector(".check-key");
      var key = {};
      try { key = JSON.parse(keyNode.textContent); } catch (err) { key = {}; }
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var chosen = form.querySelector("input:checked");
        var live = form.querySelector(".feedback");
        if (!chosen) {
          live.hidden = false;
          live.textContent = "Choose an answer, then check it.";
          return;
        }
        var ok = chosen.value === key.answer;
        live.hidden = false;
        live.className = ok ? "feedback is-good" : "feedback is-bad";
        live.textContent = (ok ? "That's right. " : "Not quite. ") + (key.explain || "");
        if (ok) remember("check:" + form.getAttribute("data-check"), "check");
      });
    });
  }

  function setupSims() {
    document.querySelectorAll("[data-sim]").forEach(function (root) {
      var keyNode = root.querySelector(".sim-key");
      var config = { steps: [] };
      try { config = JSON.parse(keyNode.textContent); } catch (err) { config = { steps: [] }; }
      var index = 0;
      var prompt = root.querySelector("[data-sim-prompt]");
      var live = root.querySelector("[data-sim-feedback]");
      var fallback = root.querySelector("[data-sim-fallback]");
      function step() { return config.steps[index]; }
      function show() {
        var current = step();
        if (!current) {
          prompt.textContent = "You finished this practice screen.";
          remember("sim:" + root.getAttribute("data-sim"), "simulation");
          return;
        }
        prompt.textContent = current.prompt || "";
        live.textContent = "";
        root.querySelectorAll("[data-hotspot]").forEach(function (button) {
          button.classList.remove("is-target");
        });
        if (fallback) {
          fallback.textContent = "";
          var list = document.createElement("div");
          list.className = "actions";
          (current.hotspots || []).forEach(function (spot) {
            var button = document.createElement("button");
            button.type = "button";
            button.className = "btn btn-secondary";
            button.textContent = spot.label || spot.id;
            button.addEventListener("click", function () { choose(spot.id); });
            list.appendChild(button);
          });
          fallback.appendChild(list);
        }
      }
      function choose(id) {
        var current = step();
        if (!current) return;
        var ok = (current.correct || []).indexOf(id) !== -1;
        live.className = ok ? "feedback is-good" : "feedback is-bad";
        live.textContent = ok ? (current.pass || "That's right.") : (current.fail || "Not quite. Try again.");
        if (!ok) return;
        index += 1;
        show();
      }
      root.querySelectorAll("[data-hotspot]").forEach(function (button) {
        button.addEventListener("click", function () { choose(button.getAttribute("data-hotspot")); });
      });
      var showMe = root.querySelector("[data-sim-show]");
      if (showMe) {
        showMe.addEventListener("click", function () {
          var current = step();
          if (!current) return;
          root.querySelectorAll("[data-hotspot]").forEach(function (button) {
            var on = (current.correct || []).indexOf(button.getAttribute("data-hotspot")) !== -1;
            button.classList.toggle("is-target", on);
          });
        });
      }
      show();
    });
  }

  function setupOrder() {
    document.querySelectorAll("[data-order]").forEach(function (root) {
      var list = root.querySelector("[data-order-list]");
      var keyNode = root.querySelector(".order-key");
      var key = { correct: [], pass: "" };
      try { key = JSON.parse(keyNode.textContent); } catch (err) { key = { correct: [], pass: "" }; }
      var first = list.firstElementChild;
      if (first) list.appendChild(first);
      root.querySelectorAll("[data-move]").forEach(function (button) {
        button.addEventListener("click", function () {
          var item = button.closest("[data-order-item]");
          if (!item) return;
          if (button.getAttribute("data-move") === "up" && item.previousElementSibling) {
            list.insertBefore(item, item.previousElementSibling);
          }
          if (button.getAttribute("data-move") === "down" && item.nextElementSibling) {
            list.insertBefore(item.nextElementSibling, item);
          }
        });
      });
      var check = root.querySelector("[data-order-check]");
      if (!check) return;
      check.addEventListener("click", function () {
        var got = Array.prototype.map.call(list.children, function (item) {
          return item.getAttribute("data-order-item");
        });
        var ok = got.join(",") === (key.correct || []).join(",");
        var live = root.querySelector(".feedback");
        live.hidden = false;
        live.className = ok ? "feedback is-good" : "feedback is-bad";
        live.textContent = ok ? (key.pass || "That's right.") : "Not quite. Move the steps and check again.";
        if (ok) remember("order:" + root.getAttribute("data-order"), "order");
      });
    });
  }

  function setupBranch() {
    document.querySelectorAll("[data-branch]").forEach(function (root) {
      var stack = [];
      function show(id) {
        root.querySelectorAll("[data-branch-node]").forEach(function (node) {
          node.hidden = node.getAttribute("data-branch-node") !== id;
        });
      }
      show(root.getAttribute("data-start"));
      root.querySelectorAll("[data-next]").forEach(function (button) {
        button.addEventListener("click", function () {
          var current = root.querySelector("[data-branch-node]:not([hidden])");
          if (current) stack.push(current.getAttribute("data-branch-node"));
          var next = button.getAttribute("data-next");
          show(next);
          var node = root.querySelector('[data-branch-node="' + next + '"]');
          if (node && !node.querySelector("[data-next]")) remember("branch:" + root.getAttribute("data-branch"), "branch");
        });
      });
      var back = root.querySelector("[data-branch-back]");
      if (back) {
        back.addEventListener("click", function () {
          var prev = stack.pop();
          if (prev) show(prev);
        });
      }
    });
  }

  function setupCheatPrint() {
    document.querySelectorAll("[data-print-cheat]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.body.classList.add("printing-cheat");
        window.print();
        document.body.classList.remove("printing-cheat");
      });
    });
  }

  setupListen();
  setupChecks();
  setupSims();
  setupOrder();
  setupBranch();
  setupCheatPrint();
  paintBadges();
})();
