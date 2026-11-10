(function () {
  "use strict";

  var KEY = "rangepath.progress";
  var LESSONS = 5;

  function empty() {
    return { learnerName: "", councilName: "", courses: {} };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      var data = JSON.parse(raw);
      if (!data || typeof data !== "object") return empty();
      data.courses = data.courses || {};
      data.learnerName = data.learnerName || "";
      data.councilName = data.councilName || "";
      return data;
    } catch (err) {
      return empty();
    }
  }

  function save(data) {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch (err) {
      /* Private mode can block storage. The page still works. */
    }
  }

  function courseOf(data, id) {
    if (!data.courses[id]) data.courses[id] = { lessons: {}, final: null };
    if (!data.courses[id].lessons) data.courses[id].lessons = {};
    return data.courses[id];
  }

  function today() {
    var d = new Date();
    var z = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
  }

  function percent(correct, total) {
    if (!total) return 0;
    return Math.round((correct / total) * 100);
  }

  function catalogue() {
    var rp = window.RANGE_PATH;
    return rp && rp.courses && rp.courses.length ? rp.courses : null;
  }

  function courseMeta(id) {
    var list = catalogue();
    if (!list) return null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function lessonCount(id) {
    var meta = courseMeta(id);
    if (meta && meta.lessons) return meta.lessons;
    return LESSONS;
  }

  function passRatio() {
    var rp = window.RANGE_PATH;
    return rp && typeof rp.passMark === "number" ? rp.passMark : 0.7;
  }

  function neededCorrect(total) {
    var ratio = passRatio();
    var count = 0;
    while (count < total && count / total < ratio) count += 1;
    return count;
  }

  function coursePercent(data, id) {
    var course = data.courses[id];
    if (!course) return 0;
    var done = 0;
    var totalLessons = lessonCount(id);
    var lessons = course.lessons || {};
    for (var i = 1; i <= totalLessons; i++) {
      if (lessons[i] && lessons[i].done) done += 1;
    }
    if (course.final && course.final.passed) done += 1;
    return Math.round((done / (totalLessons + 1)) * 100);
  }

  function nextHref(data, id, base) {
    var course = data.courses[id] || { lessons: {} };
    var lessons = course.lessons || {};
    var totalLessons = lessonCount(id);
    for (var i = 1; i <= totalLessons; i++) {
      if (!lessons[i] || !lessons[i].done) return base + "lesson-" + i + "/";
    }
    if (!course.final || !course.final.passed) return base + "final/";
    return base + "../../certificate/?course=" + encodeURIComponent(id);
  }

  function paintProgress() {
    var data = load();
    document.querySelectorAll("[data-pct]").forEach(function (el) {
      var id = el.getAttribute("data-pct");
      var pct = coursePercent(data, id);
      el.textContent = pct + "% done";
      var bar = document.querySelector('[data-bar="' + id + '"]');
      var fill = bar ? bar.querySelector(":scope > span") : null;
      if (!fill && bar) fill = bar.querySelector("span");
      if (fill) fill.style.width = pct + "%";
      if (bar) bar.setAttribute("aria-valuenow", String(pct));
    });
    document.querySelectorAll("[data-status]").forEach(function (el) {
      var parts = el.getAttribute("data-status").split(":");
      var course = (data.courses[parts[0]] || {}).lessons || {};
      var row = course[parts[1]];
      el.textContent = row && row.done ? "Quiz saved · " + row.percent + "%" : "Not started";
    });
    var cont = document.querySelector("[data-continue]");
    if (cont) {
      var id = cont.getAttribute("data-continue");
      var base = cont.getAttribute("data-base") || "";
      var href = nextHref(data, id, base);
      cont.setAttribute("href", href);
      var course = data.courses[id];
      var any = course && course.lessons && Object.keys(course.lessons).length;
      if (course && course.final && course.final.passed && href.indexOf("certificate") !== -1) {
        cont.textContent = "Open the sample certificate";
      } else if (any) {
        cont.textContent = "Continue";
      }
    }
    var finalNote = document.querySelector("[data-final-note]");
    if (finalNote) {
      var fid = finalNote.getAttribute("data-final-note");
      var fin = data.courses[fid] && data.courses[fid].final;
      if (fin && fin.passed) {
        finalNote.textContent = "Final quiz passed on this device (" + fin.percent + "% on " + fin.date + ").";
      }
    }

    var hub = document.querySelector("#continue-all");
    if (hub) {
      var listed = catalogue();
      var order = listed || [
        { id: "email-online-safety", shortTitle: "Email & Online Safety", lessons: 5 },
        { id: "sin-cra-getting-paid", shortTitle: "SIN, CRA & getting paid", lessons: 5 },
        { id: "winter-safety-rural-alberta", shortTitle: "Winter safety", lessons: 5 }
      ];
      var target = null;
      var sum = 0;
      var steps = 0;
      order.forEach(function (item) {
        var id = item.id || item;
        var shortTitle = item.shortTitle || id;
        sum += coursePercent(data, id);
        steps += (item.lessons || lessonCount(id)) + 1;
        if (target) return;
        var href = nextHref(data, id, id + "/");
        if (href.indexOf("certificate") === -1) target = { href: href, id: id, shortTitle: shortTitle };
      });
      var summary = document.querySelector("#continue-summary");
      if (summary && order.length) {
        summary.textContent = Math.round(sum / order.length) + "% of the catalogue finished on this device (" + steps + " lessons and quizzes).";
      }
      if (!target) {
        var firstId = order[0].id || order[0];
        hub.setAttribute("href", firstId + "/");
        hub.textContent = "Review your courses";
      } else {
        hub.setAttribute("href", target.href);
        hub.textContent = "Continue: " + target.shortTitle;
      }
    }
    var nameField = document.querySelector("#learner-name-courses");
    if (nameField && nameField.getAttribute("data-bound") !== "true") {
      nameField.setAttribute("data-bound", "true");
      if (data.learnerName) nameField.value = data.learnerName;
      nameField.addEventListener("input", function () {
        var fresh = load();
        fresh.learnerName = nameField.value.trim();
        save(fresh);
      });
    }
  }

  function setupNav() {
    var toggle = document.querySelector(".nav-toggle");
    var nav = document.querySelector("#site-nav");
    if (!toggle || !nav) return;
    var mq = window.matchMedia("(min-width: 860px)");

    function close() {
      if (mq.matches) return;
      nav.classList.add("is-collapsed");
      toggle.setAttribute("aria-expanded", "false");
    }

    function open() {
      nav.classList.remove("is-collapsed");
      toggle.setAttribute("aria-expanded", "true");
    }

    function sync() {
      if (mq.matches) {
        nav.classList.remove("is-collapsed");
        toggle.setAttribute("aria-expanded", "false");
      } else if (toggle.getAttribute("aria-expanded") !== "true") {
        nav.classList.add("is-collapsed");
      }
    }

    sync();
    if (mq.addEventListener) mq.addEventListener("change", sync);
    toggle.addEventListener("click", function () {
      if (toggle.getAttribute("aria-expanded") === "true") {
        close();
        toggle.focus();
      } else {
        open();
      }
    });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        close();
        toggle.focus();
      }
    });
  }

  function setupQuiz() {
    var form = document.querySelector("[data-quiz]");
    if (!form) return;
    var items = Array.prototype.slice.call(form.querySelectorAll(".q"));
    var checkBtn = form.querySelector("[data-check]");
    var nextBtn = form.querySelector("[data-next]");
    var live = form.querySelector(".quiz-result");
    var nowEl = form.querySelector("[data-qnow]");
    var index = 0;
    var correct = 0;
    var courseId = form.getAttribute("data-course");
    var part = form.getAttribute("data-part");
    var partId = form.getAttribute("data-id");
    var nextUrl = form.getAttribute("data-next-url") || "";
    var certUrl = form.getAttribute("data-cert-url") || "";

  form.addEventListener("submit", function (event) { event.preventDefault(); });

  function show(i) {
    items.forEach(function (item, n) {
      if (n === i) item.removeAttribute("hidden");
      else item.setAttribute("hidden", "");
    });
    if (nowEl) nowEl.textContent = String(i + 1);
    checkBtn.hidden = false;
    nextBtn.hidden = true;
    var picked = items[i].querySelector("input:checked");
    if (items[i].getAttribute("data-locked") === "true") {
      checkBtn.hidden = true;
      nextBtn.hidden = false;
    }
    if (picked) picked.focus();
  }

  show(0);

  checkBtn.addEventListener("click", function () {
    var item = items[index];
    if (item.getAttribute("data-locked") === "true") return;
    var chosen = item.querySelector("input:checked");
    var box = item.querySelector(".feedback");
    if (!box) {
      box = document.createElement("p");
      box.className = "feedback";
      box.setAttribute("role", "status");
      item.appendChild(box);
    }
    if (!chosen) {
      box.className = "feedback is-bad";
      box.textContent = "Choose an answer, then check it.";
      item.scrollIntoView({ block: "start" });
      return;
    }
    var answer = item.getAttribute("data-answer");
    var explainEl = item.querySelector(".explain");
    var explain = explainEl ? explainEl.textContent.trim() : "";
    var rightLabel = item.querySelector('input[value="' + answer + '"]');
      var rightText = rightLabel ? rightLabel.parentElement.querySelector("span").textContent.trim() : answer;
      var ok = chosen.value === answer;
      if (ok) correct += 1;
      box.className = ok ? "feedback is-good" : "feedback is-bad";
      box.textContent = (ok ? "Correct." : "Not quite. The better answer is: " + rightText + ".") + (explain ? " " + explain : "");
      item.querySelectorAll("input").forEach(function (input) { input.disabled = true; });
      item.setAttribute("data-locked", "true");
      checkBtn.hidden = true;
      nextBtn.hidden = false;
      nextBtn.textContent = index === items.length - 1 ? "See my score" : "Next question";
      nextBtn.focus();
    });

    nextBtn.addEventListener("click", function () {
      if (index < items.length - 1) {
        index += 1;
        show(index);
        return;
      }
      finish();
    });

    function finish() {
      var total = items.length;
      var pct = percent(correct, total);
      var data = load();
      var course = courseOf(data, courseId);
      var passed = total > 0 && correct / total >= passRatio();
      if (part === "final") {
        var prev = course.final || {};
        var nowPassed = prev.passed || passed;
        course.final = {
          correct: Math.max(correct, prev.correct || 0),
          total: total,
          percent: Math.max(pct, prev.percent || 0),
          passed: nowPassed,
          date: prev.passed ? prev.date : (passed ? today() : "")
        };
      } else {
        course.lessons[partId] = { correct: correct, total: total, percent: pct, done: true };
      }
      save(data);
      paintProgress();

      items.forEach(function (item) { item.removeAttribute("hidden"); });
      form.querySelector(".quiz-progress").hidden = true;
      checkBtn.hidden = true;
      nextBtn.hidden = true;

      var heading = document.createElement("h2");
      heading.textContent = "You scored " + correct + " out of " + total + " (" + pct + "%).";
      var note = document.createElement("p");
      var actions = document.createElement("div");
      actions.className = "actions";

      if (part === "final") {
        if (passed) {
          note.textContent = "That meets the 70% mark. You can open a sample certificate. It confirms completion only and is not accredited.";
        } else if (prev.passed) {
          note.textContent = "This try was " + correct + "/" + total + ". You already passed at " + prev.percent + "% on this device.";
        } else {
          note.textContent = "You need 70% (at least " + neededCorrect(total) + " of " + total + ") for a certificate. Review the lessons and try again. Your score stays on this device.";
        }
        if (passed || prev.passed) {
          var link = document.createElement("a");
          link.className = "btn";
          link.href = certUrl;
          link.textContent = "Open the sample certificate";
          actions.appendChild(link);
        }
      } else {
        note.textContent = "Quiz saved on this device. The next step is ready when you are.";
        if (nextUrl) {
          var next = document.createElement("a");
          next.className = "btn";
          next.href = nextUrl;
          next.textContent = form.getAttribute("data-next-label") || "Continue";
          actions.appendChild(next);
        }
      }

      var retry = document.createElement("button");
      retry.type = "button";
      retry.className = "btn btn-secondary";
      retry.textContent = "Try this quiz again";
      retry.addEventListener("click", function () { window.location.reload(); });
      actions.appendChild(retry);

      live.replaceChildren(heading, note, actions);
      heading.tabIndex = -1;
      heading.focus();
    }
  }

  function setupWalkthrough() {
    var form = document.querySelector("#walkthrough-form");
    if (!form) return;
    var thanks = document.querySelector("#walkthrough-thanks");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.reportValidity()) return;
      form.reset();
      form.hidden = true;
      thanks.hidden = false;
      var title = thanks.querySelector("h2");
      if (title) {
        title.tabIndex = -1;
        title.focus();
      }
    });
  }

  function setupCertificate() {
    var locked = document.querySelector("#cert-locked");
    var ready = document.querySelector("#cert-ready");
    if (!locked || !ready) return;
    var learner = document.querySelector("#learner-name");
    var council = document.querySelector("#council-name");
    var coursePick = document.querySelector("#cert-course");
    var learnerOut = document.querySelector("#cert-learner");
    var councilOut = document.querySelector("#cert-council");
    var titleOut = document.querySelector("#cert-title");
    var dateOut = document.querySelector("#cert-date");
    var state = document.querySelector("#cert-state");
    var learnerEcho = document.querySelector("#learner-echo");
    var councilEcho = document.querySelector("#council-echo");
    var courseEcho = document.querySelector("#course-echo");
    var passedLinks = document.querySelector("#cert-passed-links");
    var data = load();
    var listed = catalogue();
    var order;
    var titles = {};
    if (listed) {
      order = listed.map(function (item) { return item.id; });
      listed.forEach(function (item) { titles[item.id] = item.title; });
      if (coursePick) {
        coursePick.textContent = "";
        listed.forEach(function (item) {
          var option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.title;
          if (item.certificateNote) option.setAttribute("data-note", item.certificateNote);
          coursePick.appendChild(option);
        });
      }
      var linkList = document.querySelector("#cert-course-links");
      if (linkList) {
        linkList.textContent = "";
        listed.forEach(function (item) {
          var li = document.createElement("li");
          var link = document.createElement("a");
          link.href = "../courses/" + encodeURIComponent(item.id) + "/final/";
          link.textContent = item.title + " final quiz";
          li.appendChild(link);
          linkList.appendChild(li);
        });
      }
    } else {
      order = ["email-online-safety", "sin-cra-getting-paid", "winter-safety-rural-alberta"];
      titles = {
        "email-online-safety": "Email & Online Safety Basics in Canada",
        "sin-cra-getting-paid": "Your SIN, CRA My Account & Getting Paid in Canada",
        "winter-safety-rural-alberta": "Winter Safety & Driving in Rural Alberta"
      };
    }

    function passedFinal(id) {
      var fin = data.courses[id] && data.courses[id].final;
      return fin && fin.passed ? fin : null;
    }

    var passedIds = order.filter(function (id) { return passedFinal(id); });
    var params = new URLSearchParams(window.location.search);
    var wanted = params.get("course");
    var showId = wanted && passedFinal(wanted) ? wanted : (!wanted && passedIds.length ? passedIds[0] : "");

    if (!showId) {
      ready.hidden = true;
      locked.hidden = false;
      if (wanted && passedIds.length && passedLinks) {
        var lead = document.querySelector("#cert-locked-lead");
        if (lead) lead.textContent = "That course is not passed on this device yet. Finish its final quiz first. You can open a certificate for a course you already passed.";
        passedLinks.textContent = "";
        passedIds.forEach(function (id) {
          var a = document.createElement("a");
          a.href = "?course=" + encodeURIComponent(id);
          a.textContent = titles[id];
          var p = document.createElement("p");
          p.appendChild(a);
          passedLinks.appendChild(p);
        });
      }
      return;
    }

    locked.hidden = true;
    ready.hidden = false;
    if (learner && data.learnerName) learner.value = data.learnerName;
    if (council && data.councilName) council.value = data.councilName;
    if (coursePick) {
      Array.prototype.slice.call(coursePick.options).forEach(function (option) {
        if (passedIds.indexOf(option.value) === -1) option.remove();
      });
      coursePick.value = showId;
    }

    function paint() {
      var name = (learner && learner.value.trim()) || "Sample Learner";
      var org = (council && council.value.trim()) || "EXAMPLE Community Adult Learning";
      if (learnerOut) learnerOut.textContent = name;
      if (councilOut) councilOut.textContent = org;
      if (learnerEcho) learnerEcho.textContent = name;
      if (councilEcho) councilEcho.textContent = org;
      var id = coursePick ? coursePick.value : showId;
      var option = coursePick ? coursePick.options[coursePick.selectedIndex] : null;
      var title = option ? option.textContent.trim() : (titles[id] || "");
      if (titleOut) titleOut.textContent = title;
      if (courseEcho) courseEcho.textContent = title;
      var limitOut = document.querySelector("#cert-limit");
      if (limitOut && option && option.getAttribute("data-note")) {
        limitOut.textContent = option.getAttribute("data-note");
      }
      var fin = passedFinal(id);
      if (dateOut) dateOut.textContent = fin && fin.date ? fin.date : "";
      if (state && fin) state.textContent = "Recorded on this device after a final quiz of " + fin.percent + "%. Still a sample. Not accredited.";
      if (learner) data.learnerName = learner.value.trim();
      if (council) data.councilName = council.value.trim();
      save(data);
    }

    ["input", "change"].forEach(function (type) {
      if (learner) learner.addEventListener(type, paint);
      if (council) council.addEventListener(type, paint);
      if (coursePick) coursePick.addEventListener(type, paint);
    });
    paint();

    var printBtn = document.querySelector("#print-cert");
    if (printBtn) printBtn.addEventListener("click", function () { window.print(); });
  }

  function setupAdmin() {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('[role="tab"]'));
    if (!tabs.length) return;
    function select(tab, focus) {
      var id = tab.getAttribute("aria-controls");
      tabs.forEach(function (item) {
        var on = item === tab;
        item.setAttribute("aria-selected", on ? "true" : "false");
        item.tabIndex = on ? 0 : -1;
      });
      document.querySelectorAll('[role="tabpanel"]').forEach(function (panel) {
        if (panel.id === id) panel.removeAttribute("hidden");
        else panel.setAttribute("hidden", "");
      });
      if (focus) tab.focus();
    }
    tabs.forEach(function (tab, index) {
      tab.addEventListener("click", function () { select(tab, false); });
      tab.addEventListener("keydown", function (event) {
        var next = null;
        if (event.key === "ArrowRight") next = tabs[(index + 1) % tabs.length];
        else if (event.key === "ArrowLeft") next = tabs[(index - 1 + tabs.length) % tabs.length];
        else if (event.key === "Home") next = tabs[0];
        else if (event.key === "End") next = tabs[tabs.length - 1];
        if (!next) return;
        event.preventDefault();
        select(next, true);
      });
    });
    select(tabs[0], false);

    var openBtn = document.querySelector("#open-draft");
    var dialog = document.querySelector("#draft-dialog");
    if (openBtn && dialog && typeof dialog.showModal === "function") {
      openBtn.addEventListener("click", function () { dialog.showModal(); });
      dialog.querySelectorAll("[data-close]").forEach(function (btn) {
        btn.addEventListener("click", function () { dialog.close(); });
      });
    }
    var copyBtn = document.querySelector("#copy-draft");
    var draft = document.querySelector("#draft-text");
    var copyStatus = document.querySelector("#copy-status");
    if (copyBtn && draft) {
      copyBtn.addEventListener("click", function () {
        var text = draft.value;
        var done = function () {
          if (copyStatus) copyStatus.textContent = "Draft copied. It stays on this device until you paste it somewhere else.";
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(function () {
            draft.focus();
            draft.select();
            if (copyStatus) copyStatus.textContent = "Select the draft and copy it from there.";
          });
        } else {
          draft.focus();
          draft.select();
          if (copyStatus) copyStatus.textContent = "Select the draft and copy it from there.";
        }
      });
    }
    var reset = document.querySelector("#restore-sample");
    var resetStatus = document.querySelector("#restore-status");
    if (reset) {
      reset.addEventListener("click", function () {
        select(tabs[0], false);
        if (resetStatus) resetStatus.textContent = "Sample data restored. These names are fictional and built into the page.";
      });
    }
  }

  document.documentElement.classList.add("js");
  setupNav();
  setupQuiz();
  setupWalkthrough();
  setupCertificate();
  setupAdmin();
  paintProgress();
})();
