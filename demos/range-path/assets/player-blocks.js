/* Interactive lesson blocks. Progress goes through LearnHereData. */
(function () {
  "use strict";

  function api() {
    return window.LearnHereData || window.RangePathData || null;
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
      var label = badge.getAttribute("data-label") || badge.textContent.replace(/^(Earned: |Not yet: )/, "");
      badge.setAttribute("data-label", label);
      badge.textContent = (on ? "Earned: " : "Not yet: ") + label;
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
        var bits = [];
        if (section) {
          var heading = section.querySelector("h2");
          if (heading) bits.push(heading.textContent);
          section.querySelectorAll("[data-block='prose'], .block-example, .caption, figcaption").forEach(function (node) {
            bits.push(node.innerText);
          });
        }
        var text = bits.join(" ");
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

  function paintRich(root, id) {
    var app = root.querySelector("[data-app]");
    var appName = app ? app.getAttribute("data-app") : "";
    function field(name, text) {
      var el = root.querySelector('[data-field="' + name + '"]');
      if (el) el.textContent = text;
    }
    function slot(name) {
      var el = root.querySelector('[data-slot="' + name + '"]');
      if (el) el.hidden = false;
      return el;
    }
    var sim = root.getAttribute("data-sim") || "";
    var lines = {
      "outlook-new-email": {
        to: "Jordan Lee",
        subject: "Saturday hall setup — can you confirm by Thursday?",
        body: "I can help set up tables this Saturday from 9:00 a.m. to 10:00 a.m. Please let me know if the plan changes."
      },
      "jobsearch-cover-email": {
        to: "jobs@sampletown.example",
        subject: "Weekend Attendant application — Sam Lee",
        body: "I can greet visitors and set up tables on weekends. Resume attached."
      }
    };
    var mine = lines[sim] || {};
    function retitle(text) {
      var el = root.querySelector("[data-app-title]");
      if (el) el.textContent = text;
    }
    function openApp(name) {
      var launch = root.querySelector('[data-slot="launcher"]');
      if (launch) launch.hidden = true;
      slot("doc");
      slot("app");
      var docName = root.querySelector("[data-doc-name]");
      if (docName && name) docName.textContent = name;
    }
    if (id === "start") slot("startmenu");
    if (id === "word") {
      openApp("Document1");
      retitle("Word");
    }
    if (id === "outlook") {
      openApp("");
      retitle("Outlook");
    }
    if (id === "search") slot("results");
    if (id === "title" && appName === "job") field("title", "Weekend Attendant");
    if (id === "title" && appName === "word") {
      var line = slot("title");
      if (line) line.classList.add("is-selected");
    }
    if (id === "place") field("place", "Sampletown");
    if (id === "hours") {
      var other = root.querySelector('[data-job="other"]');
      if (other) other.hidden = true;
    }
    if (id === "sent1") {
      var sentence = slot("sent1");
      if (sentence) sentence.classList.add("is-selected");
    }
    if (id === "bold") {
      var bold = slot("title");
      if (bold) bold.classList.add("is-bold");
    }
    if (id === "bullets") slot("list");
    if (id === "h1") {
      var heading = slot("title");
      if (heading) heading.classList.add("is-heading");
    }
    if (id === "header") slot("header");
    if (id === "pnum" || id === "current") slot("pagenum");
    if (id === "en-ca" || id === "setlang" || id === "review") {
      var proof = slot("proof");
      if (proof && id === "en-ca") proof.textContent = "Proofing: English (Canada)";
    }
    if (id === "table" || id === "grid") slot("table");
    if (id === "headerrow") {
      var table = slot("table");
      if (table) table.classList.add("has-header");
    }
    if (id === "print" || id === "previewok" || id === "file") slot("preview");
    if (id === "pdf" || id === "savecopy") {
      var name = root.querySelector("[data-doc-name]");
      if (name) name.textContent = "notice-practice.pdf";
    }
    if ((id === "save" || id === "savebtn" || id === "docs") && appName === "word") {
      var saved = root.querySelector("[data-doc-name]");
      if (saved) saved.textContent = "hall-booking-practice.docx";
    }
    if (id === "to" && mine.to) field("to", mine.to);
    if ((id === "subject" || id === "subj") && mine.subject) field("subject", mine.subject);
    if (id === "body" && mine.body) field("body", mine.body);
    if (id === "newemail" || id === "reply") slot("compose");
    if (id === "send") {
      var sent = slot("sent");
      if (sent) sent.textContent = "Sent";
    }
    if (id === "mail") {
      slot("mail");
      if (sim === "outlook-open-nav") {
        var calNote = root.querySelector('[data-slot="calendar"]');
        if (calNote) calNote.hidden = true;
      }
    }
    if (id === "calendar") {
      slot("calendar");
      if (sim === "outlook-open-nav") {
        var mailNote = root.querySelector('[data-slot="mail"]');
        if (mailNote) mailNote.hidden = true;
      }
    }
    if (id === "attach" || id === "insert") slot("attached");
    if (id === "flag") {
      var msg = slot("msg");
      if (msg) msg.classList.add("is-flagged");
    }
    if (id === "newfolder" || id === "move") slot("folder");
    if (id === "people" || id === "newcontact" || id === "name") slot("contact");
    if (id === "newappt" || id === "reminder" || id === "title") slot("appt");
  }

  function setupSims() {
    document.querySelectorAll("[data-sim]").forEach(function (root) {
      var keyNode = root.querySelector(".sim-key");
      var config = { steps: [], values: {} };
      try { config = JSON.parse(keyNode.textContent); } catch (err) { config = { steps: [], values: {} }; }
      config.values = config.values || {};
      var index = 0;
      var seqAt = 0;
      var held = "";
      var formula = "";
      var selected = config.start || "A1";
      var committed = false;
      var prompt = root.querySelector("[data-sim-prompt]");
      var live = root.querySelector("[data-sim-feedback]");
      var status = root.querySelector("[data-sim-status]");
      function step() { return config.steps[index]; }
      function sequenceOf(current) {
        if (current.sequence && current.sequence.length) return current.sequence;
        return current.correct || [];
      }
      function move(ref, down, right) {
        var match = /^([A-Z]+)(\d+)$/.exec(ref || "");
        if (!match) return ref;
        var col = match[1].charCodeAt(0) + right;
        var row = Number(match[2]) + down;
        if (col < 65) col = 65;
        if (row < 1) row = 1;
        return String.fromCharCode(col) + row;
      }
      function paint() {
        var box = root.querySelector("[data-name-box]");
        var bar = root.querySelector("[data-formula-input]");
        if (box) box.textContent = selected;
        if (bar) bar.textContent = formula;
        root.querySelectorAll("[data-cell]").forEach(function (cell) {
          var ref = cell.getAttribute("data-cell");
          cell.classList.toggle("is-selected", ref === selected);
          var label = cell.querySelector("[data-cell-value]");
          if (label && Object.prototype.hasOwnProperty.call(config.values, ref)) label.textContent = config.values[ref];
        });
        if (status) status.textContent = held || "";
      }
      function finishSheet() {
        if (!config.finish) return;
        config.values[config.finish.cell] = config.finish.value;
        formula = config.finish.formula;
        selected = config.finish.cell;
        committed = true;
        paint();
      }
      function applyTap(id) {
        if (/^[A-Z]+\d+$/.test(id)) {
          selected = id;
          if (!committed && formula.charAt(0) === "=") formula += id;
        } else if (id === "equals") {
          formula = "=";
          committed = false;
        } else if (id === "plus") {
          formula += "+";
        } else if (id === "autosum") {
          formula = config.finish ? config.finish.formula : "=SUM(B2:B8)";
          committed = false;
        } else if (id === "enter" || id === "tab") {
          var typed = formula.replace(/\s+/g, "");
          if (config.finish && typed === config.finish.formula) finishSheet();
          else if (id === "enter") selected = move(selected, 1, 0);
          else selected = move(selected, 0, 1);
        }
        paint();
      }
      function show() {
        var current = step();
        root.querySelectorAll("[data-hotspot]").forEach(function (button) { button.classList.remove("is-target"); });
        live.textContent = held;
        live.className = held ? "feedback is-good" : "feedback";
        paint();
        if (!current) {
          finishSheet();
          prompt.textContent = "You finished this practice screen.";
          var showMe = root.querySelector("[data-sim-show]");
          if (showMe) showMe.hidden = true;
          var menu = root.querySelector("[data-sim-menu]");
          var empty = root.querySelector("[data-empty-grid]");
          if (config.revealGrid && empty) {
            empty.hidden = false;
            if (menu) menu.hidden = true;
            var first = empty.querySelector("[data-cell='A1']");
            if (first) first.classList.add("is-selected");
          }
          remember("sim:" + root.getAttribute("data-sim"), "simulation");
          return;
        }
        prompt.textContent = (held ? "Next: " : "") + (current.prompt || "");
      }
      function choose(id) {
        var current = step();
        if (!current) return;
        var seq = sequenceOf(current);
        var needed = seq[seqAt];
        if (id !== needed) {
          live.className = "feedback is-bad";
          live.textContent = current.fail || "Not quite. Try the next part of this step.";
          return;
        }
        applyTap(id);
        paintRich(root, id);
        seqAt += 1;
        if (seqAt < seq.length) {
          live.className = "feedback is-good";
          live.textContent = "Kept. Continue this step.";
          return;
        }
        held = current.pass || "That's right.";
        seqAt = 0;
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
          var seq = sequenceOf(current);
          var needed = seq[seqAt];
          root.querySelectorAll("[data-hotspot]").forEach(function (button) {
            button.classList.toggle("is-target", button.getAttribute("data-hotspot") === needed);
          });
        });
      }
      show();
    });
  }

  function setupOrder() {
    document.querySelectorAll("[data-order]").forEach(function (root) {
      var list = root.querySelector("[data-order-list]");
      var picked = null;
      list.addEventListener("click", function (event) {
        if (event.target.closest("button")) return;
        var item = event.target.closest("[data-order-item]");
        if (!item) return;
        if (!picked) {
          picked = item;
          item.classList.add("is-picked");
          return;
        }
        if (picked === item) {
          picked.classList.remove("is-picked");
          picked = null;
          return;
        }
        list.insertBefore(picked, item);
        picked.classList.remove("is-picked");
        picked = null;
      });
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
        var correct = key.correct || [];
        var ok = got.join(",") === correct.join(",");
        var live = root.querySelector(".feedback");
        live.hidden = false;
        live.className = ok ? "feedback is-good" : "feedback is-bad";
        if (ok) live.textContent = key.pass || "That's right.";
        else {
          var at = 0;
          while (at < correct.length && got[at] === correct[at]) at += 1;
          var should = "";
          Array.prototype.forEach.call(list.children, function (item) {
            if (item.getAttribute("data-order-item") === correct[at]) should = item.querySelector("span").textContent;
          });
          live.textContent = "Not quite. " + (should || "A step") + " still needs to move up.";
        }
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
          syncBack();
          var node = root.querySelector('[data-branch-node="' + next + '"]');
          if (node && !node.querySelector("[data-next]")) remember("branch:" + root.getAttribute("data-branch"), "branch");
        });
      });
      var back = root.querySelector("[data-branch-back]");
      function syncBack() {
        if (!back) return;
        var start = root.getAttribute("data-start");
        var current = root.querySelector("[data-branch-node]:not([hidden])");
        back.hidden = !current || current.getAttribute("data-branch-node") === start;
      }
      syncBack();
      if (back) {
        back.addEventListener("click", function () {
          var prev = stack.pop();
          if (prev) show(prev);
          syncBack();
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
