(function () {
  "use strict";

  var LESSONS = 5;

  function empty() {
    return { learnerName: "", councilName: "", courses: {} };
  }

  function store() {
    return window.RangePathData || null;
  }

  function load() {
    var api = store();
    if (!api) return empty();
    var view = api.getLearnerView();
    if (!view || typeof view !== "object") return empty();
    view.courses = view.courses || {};
    view.learnerName = view.learnerName || "";
    view.councilName = view.councilName || "";
    return view;
  }

  function save(data) {
    var api = store();
    if (!api) return;
    var ok = api.saveLearnerView(data);
    document.querySelectorAll("[data-storage-note]").forEach(function (el) {
      el.hidden = ok !== false && api.storageOk();
    });
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

  function planOf(id) {
    var meta = courseMeta(id);
    if (meta && meta.plan) return meta.plan;
    var node = document.getElementById("rangepath-plan");
    if (!node) return null;
    try {
      var plan = JSON.parse(node.textContent);
      if (plan && plan.id === id) return plan;
    } catch (err) {
      return null;
    }
    return null;
  }

  function lessonRow(data, id, number) {
    var course = data.courses[id];
    var lessons = course && course.lessons ? course.lessons : {};
    return lessons[number] || lessons[String(number)] || {};
  }

  function sectionRead(row, sectionId) {
    return Boolean(row.sections && row.sections[sectionId]);
  }

  function lessonReady(data, id, item) {
    var row = lessonRow(data, id, item.n);
    var sections = item.sections || [];
    for (var i = 0; i < sections.length; i++) {
      if (!sectionRead(row, sections[i])) return false;
    }
    if (item.quiz && !row.done) return false;
    if (item.assignment && !row.assignment) return false;
    return true;
  }

  function lessonsReady(data, id) {
    var plan = planOf(id);
    if (!plan || !plan.requireAllLessons) return true;
    for (var i = 0; i < plan.lessons.length; i++) {
      if (!lessonReady(data, id, plan.lessons[i])) return false;
    }
    return true;
  }

  function hasProgress(data, id) {
    var course = data.courses[id];
    if (!course) return false;
    if (course.final && (course.final.passed || course.final.percent)) return true;
    var lessons = course.lessons || {};
    var keys = Object.keys(lessons);
    for (var i = 0; i < keys.length; i++) {
      var row = lessons[keys[i]];
      if (!row) continue;
      if (row.done || row.assignment) return true;
      if (row.sections && Object.keys(row.sections).length) return true;
    }
    return false;
  }

  function coursePercent(data, id) {
    var course = data.courses[id];
    if (!course) return 0;
    var plan = planOf(id);
    if (plan) {
      var total = 0;
      var done = 0;
      plan.lessons.forEach(function (item) {
        var row = lessonRow(data, id, item.n);
        (item.sections || []).forEach(function (sectionId) {
          total += 1;
          if (sectionRead(row, sectionId)) done += 1;
        });
        if (item.quiz) {
          total += 1;
          if (row.done) done += 1;
        }
        if (item.assignment) {
          total += 1;
          if (row.assignment) done += 1;
        }
      });
      if (plan.exam) {
        total += 1;
        if (course.final && course.final.passed && lessonsReady(data, id)) done += 1;
      }
      if (!total) return 0;
      return Math.round((done / total) * 100);
    }
    var finished = 0;
    var totalLessons = lessonCount(id);
    var lessons = course.lessons || {};
    for (var i = 1; i <= totalLessons; i++) {
      if (lessons[i] && lessons[i].done) finished += 1;
    }
    if (course.final && course.final.passed) finished += 1;
    return Math.round((finished / (totalLessons + 1)) * 100);
  }

  function nextHref(data, id, base) {
    var course = data.courses[id] || { lessons: {} };
    var plan = planOf(id);
    if (plan) {
      for (var p = 0; p < plan.lessons.length; p++) {
        var item = plan.lessons[p];
        var row = lessonRow(data, id, item.n);
        var sections = item.sections || [];
        for (var s = 0; s < sections.length; s++) {
          if (!sectionRead(row, sections[s])) return base + "lesson-" + item.n + "/#section-" + sections[s];
        }
        if (item.quiz && !row.done) return base + "lesson-" + item.n + "/quiz/";
        if (item.assignment && !row.assignment) return base + "lesson-" + item.n + "/#" + item.assignment;
      }
      if (!course.final || !course.final.passed || !lessonsReady(data, id)) return base + "final/";
      return base + "../../certificate/?course=" + encodeURIComponent(id);
    }
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
      var plan = planOf(parts[0]);
      var item = null;
      if (plan) {
        for (var n = 0; n < plan.lessons.length; n++) {
          if (String(plan.lessons[n].n) === parts[1]) item = plan.lessons[n];
        }
      }
      if (item) {
        el.textContent = lessonReady(data, parts[0], item) ? "Lesson complete" : (hasProgress(data, parts[0]) ? "In progress" : "Not started");
      } else {
        var course = (data.courses[parts[0]] || {}).lessons || {};
        var row = course[parts[1]];
        el.textContent = row && row.done ? "Quiz saved · " + row.percent + "%" : "Not started";
      }
    });
    document.querySelectorAll("[data-section-status]").forEach(function (el) {
      var parts = el.getAttribute("data-section-status").split(":");
      var row = lessonRow(data, parts[0], parts[1]);
      var read = sectionRead(row, parts[2]);
      el.textContent = read ? "Read" : "Not read yet";
    });
    document.querySelectorAll("[data-assignment-status]").forEach(function (el) {
      var gate = document.querySelector("[data-course-gate]");
      var lessonMark = document.querySelector("[data-read-section]");
      var id = gate ? gate.getAttribute("data-course-gate") : "";
      var lessonNumber = lessonMark ? lessonMark.getAttribute("data-lesson") : "";
      if (!id || !lessonNumber) return;
      var row = lessonRow(data, id, lessonNumber);
      el.textContent = row.assignment ? "Marked done on this device." : "Not marked done yet.";
    });
    var cont = document.querySelector("[data-continue]");
    if (cont) {
      var id = cont.getAttribute("data-continue");
      var base = cont.getAttribute("data-base") || "";
      var href = nextHref(data, id, base);
      var started = hasProgress(data, id);
      var resumeOnly = cont.getAttribute("data-resume") === "progress";
      if (!resumeOnly || started) cont.setAttribute("href", href);
      var course = data.courses[id];
      if (course && course.final && course.final.passed && lessonsReady(data, id) && href.indexOf("certificate") !== -1) {
        cont.textContent = "Open the sample certificate";
      } else if (started) {
        cont.textContent = "Continue where you left off";
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
          date: prev.passed ? prev.date : (passed ? today() : ""),
          at: new Date().toISOString()
        };
      } else {
        var row = course.lessons[partId] || {};
        row.correct = correct;
        row.total = total;
        row.percent = pct;
        row.done = true;
        if (!row.quizAt) row.quizAt = new Date().toISOString();
        course.lessons[partId] = row;
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
      if (!fin || !fin.passed) return null;
      if (!lessonsReady(data, id)) return null;
      return fin;
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

  function currentCourseId() {
    var gate = document.querySelector("[data-course-gate]");
    if (gate) return gate.getAttribute("data-course-gate");
    var exam = document.querySelector("[data-exam]");
    if (exam) return exam.getAttribute("data-course");
    var quiz = document.querySelector("[data-quiz]");
    if (quiz) return quiz.getAttribute("data-course");
    return "";
  }

  function gateCourse() {
    var api = store();
    var id = currentCourseId();
    if (!api || !id) return;
    var user = api.getSessionUser();
    var result = api.canAccess(user, { id: id });
    var allowed = result === true || Boolean(result && result.allowed);
    document.documentElement.setAttribute("data-access-checked", allowed ? "true" : "false");
    if (result && result.accessState) document.documentElement.setAttribute("data-access-state", result.accessState);
    if (allowed) return;
    var main = document.getElementById("main");
    if (main) {
      main.textContent = "";
      var note = document.createElement("p");
      note.textContent = result && result.reason ? result.reason : "This course is not available for this council right now.";
      main.appendChild(note);
    }
  }

  function setupRoleSwitcher() {
    var api = store();
    var header = document.querySelector("header.site");
    if (!api || !header || document.getElementById("role-switch")) return;
    var user = api.getSessionUser();
    var bar = document.createElement("div");
    bar.id = "role-switch";
    bar.className = "role-switch";
    bar.innerHTML = "<p class=\"role-label\">Demo only. This does not sign you in.</p>";
    var learnerBtn = document.createElement("button");
    learnerBtn.type = "button";
    learnerBtn.textContent = "Learner";
    learnerBtn.setAttribute("aria-pressed", user && user.role === "learner" ? "true" : "false");
    var staffBtn = document.createElement("button");
    staffBtn.type = "button";
    staffBtn.textContent = "Council staff";
    staffBtn.setAttribute("aria-pressed", user && user.role !== "learner" ? "true" : "false");
    function choose(id) {
      api.setSession(id);
      window.location.reload();
    }
    learnerBtn.addEventListener("click", function () { choose("user-demo-learner"); });
    staffBtn.addEventListener("click", function () { choose("user-staff"); });
    bar.appendChild(learnerBtn);
    bar.appendChild(staffBtn);
    var stateLabel = document.createElement("p");
    stateLabel.className = "role-label";
    stateLabel.textContent = "Demo payment state. This does not charge a card or change a real subscription.";
    bar.appendChild(stateLabel);
    var orgId = (user && user.orgId) || "org-example";
    var org = api.getOrg(orgId);
    [
      ["active", "Active"],
      ["past_due_grace", "Grace"],
      ["restricted", "Restricted"],
      ["cancelled", "Ended"]
    ].forEach(function (pair) {
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = pair[1];
      button.setAttribute("aria-pressed", org && org.accessState === pair[0] ? "true" : "false");
      button.addEventListener("click", function () {
        api.setAccessState(orgId, pair[0]);
        window.location.reload();
      });
      bar.appendChild(button);
    });
    header.insertAdjacentElement("afterend", bar);
    paintAccessBanner();
  }

  function paintAccessBanner() {
    var api = store();
    if (!api) return;
    var user = api.getSessionUser();
    var id = currentCourseId() || "excel-basics-canada";
    var result = api.canAccess(user, { id: id });
    if (!result || result === true || !result.accessState || result.accessState === "active") return;
    if (result.accessState === "past_due_grace" && user && user.role === "learner") return;
    var banner = document.createElement("p");
    banner.id = "access-banner";
    banner.className = "access-banner";
    banner.textContent = result.accessState === "past_due_grace"
      ? "Demo only. Payment for this period did not go through. Learners still have access. This is not a real invoice."
      : "Demo only. " + (result.reason || "");
    var role = document.getElementById("role-switch");
    if (role) role.insertAdjacentElement("afterend", banner);
  }

  function setupPlayer() {
    var id = currentCourseId();
    document.querySelectorAll("[data-read-section]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var sectionId = btn.getAttribute("data-read-section");
        var lessonNumber = btn.getAttribute("data-lesson");
        if (!id || !sectionId || !lessonNumber) return;
        var data = load();
        var course = courseOf(data, id);
        course.lessons[lessonNumber] = course.lessons[lessonNumber] || {};
        course.lessons[lessonNumber].sections = course.lessons[lessonNumber].sections || {};
        if (!course.lessons[lessonNumber].sections[sectionId]) {
          course.lessons[lessonNumber].sections[sectionId] = new Date().toISOString();
          save(data);
        }
        paintProgress();
      });
    });
    document.querySelectorAll("[data-assignment-done]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var lessonMark = document.querySelector("[data-read-section]");
        var lessonNumber = lessonMark ? lessonMark.getAttribute("data-lesson") : "";
        if (!id || !lessonNumber) return;
        var data = load();
        var course = courseOf(data, id);
        course.lessons[lessonNumber] = course.lessons[lessonNumber] || {};
        course.lessons[lessonNumber].assignment = true;
        course.lessons[lessonNumber].assignmentAt = new Date().toISOString();
        save(data);
        paintProgress();
      });
    });
    var reset = document.querySelector("[data-reset-course]");
    if (reset) {
      reset.addEventListener("click", function () {
        var api = store();
        var user = api && api.getSessionUser();
        if (!api || !user) return;
        api.resetCourseProgress(user.id, reset.getAttribute("data-reset-course"));
        var status = document.getElementById("reset-status");
        if (status) status.textContent = "Progress for this course was cleared on this device.";
        paintProgress();
      });
    }
  }

  function setupExam() {
    var form = document.querySelector("[data-exam]");
    if (!form) return;
    var api = store();
    var id = form.getAttribute("data-course");
    var locked = document.getElementById("exam-locked");
    var open = document.getElementById("exam-open");
    var remaining = document.querySelector("[data-exam-remaining]");
    var plan = planOf(id);
    var data = load();
    var missing = [];
    if (plan && plan.requireAllLessons) {
      plan.lessons.forEach(function (item) {
        if (!lessonReady(data, id, item)) missing.push(item);
      });
    }
    if (missing.length) {
      if (open) open.hidden = true;
      if (locked) locked.hidden = false;
      if (remaining) {
        remaining.textContent = "";
        missing.forEach(function (item) {
          var li = document.createElement("li");
          var link = document.createElement("a");
          link.href = "../lesson-" + item.n + "/";
          link.textContent = "Lesson " + item.n + " — " + item.title;
          li.appendChild(link);
          remaining.appendChild(li);
        });
      }
      return;
    }
    var limit = (plan && plan.attemptLimit) || Number(form.getAttribute("data-attempts")) || 2;
    var finalRow = data.courses[id] && data.courses[id].final;
    var used = finalRow && finalRow.attempts ? finalRow.attempts.length : 0;
    var left = Math.max(0, limit - used);
    var attemptNote = document.getElementById("exam-attempts");
    if (attemptNote) attemptNote.textContent = "Attempts remaining: " + left + " of " + limit + ".";
    function showUsed(title, copy) {
      if (locked) locked.hidden = true;
      if (open) open.hidden = true;
      var panel = document.getElementById("exam-used");
      if (!panel) return;
      panel.hidden = false;
      var heading = panel.querySelector("[data-exam-used-title]");
      var body = panel.querySelector("[data-exam-used-copy]");
      if (heading) heading.textContent = title;
      if (body) body.textContent = copy;
    }
    if (finalRow && finalRow.passed) {
      showUsed("You already passed", "This exam is finished on this device. Open the sample certificate from the syllabus. Staff can reset attempts from the staff demo if a new try is needed.");
      return;
    }
    if (used >= limit) {
      showUsed("No attempts left", "You have used all " + limit + " attempts and the exam is not passed. Council staff can see that on the staff demo and can reset the attempts. This is sample data on this device.");
      return;
    }
    if (locked) locked.hidden = true;
    if (open) open.hidden = false;
    var keyNode = document.getElementById("exam-key");
    var key = [];
    try { key = JSON.parse(keyNode.textContent); } catch (err) { key = []; }
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var correct = 0;
      var missed = [];
      var unanswered = false;
      key.forEach(function (item, index) {
        var chosen = form.querySelector('input[name="e' + index + '"]:checked');
        if (!chosen) {
          unanswered = true;
          return;
        }
        if (chosen.value === item.answer) correct += 1;
        else missed.push(item);
      });
      var live = form.querySelector(".quiz-result");
      if (unanswered) {
        live.textContent = "Answer every question, then submit.";
        return;
      }
      var total = key.length;
      var pct = percent(correct, total);
      var ratio = Number(form.getAttribute("data-pass")) || passRatio();
      var passed = total > 0 && correct / total >= ratio;
      var fresh = load();
      var course = courseOf(fresh, id);
      var prev = course.final || {};
      var attempts = (prev.attempts || []).slice();
      if (attempts.length >= limit) {
        live.textContent = "No attempts left. Ask council staff to reset the exam.";
        return;
      }
      var at = new Date().toISOString();
      attempts.push({ at: at, correct: correct, total: total, percent: pct, passed: passed });
      course.final = {
        correct: correct,
        total: total,
        percent: pct,
        passed: passed,
        date: passed ? today() : "",
        at: at,
        attempts: attempts
      };
      save(fresh);
      paintProgress();
      var leftNow = Math.max(0, limit - attempts.length);
      if (attemptNote) attemptNote.textContent = "Attempts remaining: " + leftNow + " of " + limit + ".";
      var heading = document.createElement("h2");
      heading.textContent = "You scored " + correct + " out of " + total + " (" + pct + "%).";
      var note = document.createElement("p");
      if (passed) note.textContent = "That meets the pass mark. You can open the sample certificate.";
      else if (leftNow > 0) note.textContent = "That is under the pass mark. Attempts remaining: " + leftNow + ".";
      else note.textContent = "That is under the pass mark, and no attempts are left. Council staff can reset the exam from the staff demo.";
      var topics = document.createElement("div");
      if (missed.length) {
        var title = document.createElement("p");
        title.textContent = "Topics to review:";
        topics.appendChild(title);
        var list = document.createElement("ul");
        missed.forEach(function (item) {
          var li = document.createElement("li");
          var link = document.createElement("a");
          link.href = item.review || "../";
          link.textContent = item.topic || "Review this lesson";
          li.appendChild(link);
          list.appendChild(li);
        });
        topics.appendChild(list);
      }
      var actions = document.createElement("div");
      actions.className = "actions";
      if (passed) {
        var link = document.createElement("a");
        link.className = "btn";
        link.href = "../../../certificate/?course=" + encodeURIComponent(id);
        link.textContent = "Open the sample certificate";
        actions.appendChild(link);
      }
      if (!passed && leftNow > 0) {
        var again = document.createElement("button");
        again.type = "button";
        again.className = "btn btn-secondary";
        again.textContent = "Try the exam again";
        again.addEventListener("click", function () { window.location.reload(); });
        actions.appendChild(again);
      }
      live.replaceChildren(heading, note, topics, actions);
    });
  }

  function csvCell(value) {
    var text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function reportCell(field, learner, enrollment, report) {
    var cert = null;
    (report.certificates || []).forEach(function (row) {
      if (row.learnerId === learner.id && row.courseId === enrollment.courseId) cert = row;
    });
    var exam = null;
    var last = enrollment.lastActivityAt || "";
    (report.progress || []).forEach(function (row) {
      if (row.learnerId !== learner.id || row.courseId !== enrollment.courseId) return;
      if (row.at && (!last || row.at > last)) last = row.at;
      if (row.itemId === "exam:final") exam = row;
    });
    var stated = "";
    var catalogue = window.RANGE_PATH;
    if (catalogue && catalogue.courses) {
      catalogue.courses.forEach(function (course) {
        if (course.id === enrollment.courseId && course.plan && course.plan.statedHours != null) stated = course.plan.statedHours;
      });
    }
    if (field.name === "learner_code") return learner.learnerCode || learner.id;
    if (field.name === "course_id") return enrollment.courseId;
    if (field.name === "course_title") {
      var title = enrollment.courseId;
      if (window.RANGE_PATH && window.RANGE_PATH.courses) {
        window.RANGE_PATH.courses.forEach(function (course) {
          if (course.id === enrollment.courseId) title = course.title || title;
        });
      }
      return title;
    }
    if (field.name === "course_started_at") return enrollment.startedAt || "";
    if (field.name === "last_activity_at") return last;
    if (field.name === "completed") return cert ? "yes" : "no";
    if (field.name === "completion_date") return cert ? String(cert.issuedAt).slice(0, 10) : "";
    if (field.name === "stated_hours") return stated;
    if (field.name === "final_exam_passed") return exam && exam.detail && exam.detail.passed ? "yes" : "no";
    if (field.name === "final_exam_score") return exam && exam.detail && exam.detail.percent != null ? exam.detail.percent : "";
    if (field.name === "final_exam_attempts") return exam && exam.detail && exam.detail.attempts ? exam.detail.attempts.length : "";
    if (field.name === "certificate_id") return cert ? cert.id : "";
    if (field.name === "display_name") return learner.name || "";
    return learner[field.name] || "";
  }

  function downloadReportCsv(report) {
    var fields = window.RANGE_PATH_REPORT_FIELDS || { required: [], optional: [] };
    var optional = {};
    (fields.optional || []).forEach(function (field) { optional[field.name] = true; });
    var columns = (fields.required || []).concat(fields.optional || []);
    var lines = [columns.map(function (field) {
      return csvCell(field.label + (optional[field.name] ? " (optional)" : ""));
    }).join(",")];
    (report.enrollments || []).forEach(function (enrollment) {
      var learner = null;
      (report.learners || []).forEach(function (person) {
        if (person.id === enrollment.learnerId) learner = person;
      });
      if (!learner) return;
      lines.push(columns.map(function (field) {
        return csvCell(reportCell(field, learner, enrollment, report));
      }).join(","));
    });
    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "range-path-example-report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function setupDashboard() {
    var mount = document.getElementById("org-report");
    if (!mount) return;
    var api = store();
    if (!api) return;
    var user = api.getSessionUser();
    mount.textContent = "";
    if (!user || (user.role !== "org-staff" && user.role !== "org-admin" && user.role !== "platform-owner")) {
      var note = document.createElement("p");
      note.textContent = "This dashboard is for council staff. Use the demo role switch and choose Council staff. Learners only see their own course progress.";
      mount.appendChild(note);
      return;
    }
    var report = api.getOrgReport(user.role === "platform-owner" ? user.orgId || "org-example" : user.orgId);
    if (report.error) {
      var err = document.createElement("p");
      err.textContent = report.error;
      mount.appendChild(err);
      return;
    }
    var names = {
      "everyday-computers-smartphones": "Everyday computers",
      "excel-basics-canada": "Excel basics",
      "word-basics-canada": "Word basics",
      "job-search-canada": "Job search"
    };
    var leadIds = Object.keys(names);
    var month = new Date().toISOString().slice(0, 7);
    var classCode = (report.classes && report.classes[0] && report.classes[0].code) || "";
    var lead = document.createElement("p");
    var sub = report.subscription;
    var capText = report.seatCap == null ? "No seat cap. The active-learner count is for reporting only." : "Optional seat cap: " + report.seatCap + ".";
    lead.textContent = "Example data for " + (report.org ? report.org.name : "this council") + ". These people are not real. Each learner has their own record. A class code is not a shared login. Subscription provider: " + (sub ? sub.provider : "none") + ", status: " + (sub ? sub.status : "") + ". " + capText + " Class code: " + classCode + ". Active learners in " + month + ": " + report.activeSeatsThisMonth + ". Winter Safety is a demo extra and is not in this sample.";
    mount.appendChild(lead);
    if (report.classes && report.classes.length) {
      var classLine = document.createElement("p");
      var today = new Date().toISOString().slice(0, 10);
      classLine.textContent = "Class codes: " + report.classes.map(function (row) {
        var ended = row.endsOn && row.endsOn < today;
        return row.code + (ended ? " ended " + row.endsOn : " open until " + (row.endsOn || "further notice"));
      }).join("; ") + ".";
      mount.appendChild(classLine);
    }
    if (report.invoices && report.invoices.length) {
      var invoice = report.invoices[0];
      var invoiceLine = document.createElement("p");
      invoiceLine.textContent = "Example invoice " + invoice.number + ". Provider: " + invoice.provider + ". Status: " + invoice.status + ". CA$" + invoice.amountDue + ". Not a live charge.";
      mount.appendChild(invoiceLine);
    }
    var stats = document.createElement("ul");
    stats.className = "stats";
    leadIds.forEach(function (courseId) {
      var count = report.certificates.filter(function (row) { return row.courseId === courseId; }).length;
      var li = document.createElement("li");
      li.className = "stat";
      var strong = document.createElement("strong");
      strong.textContent = String(count);
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" Completed " + names[courseId]));
      stats.appendChild(li);
    });
    mount.appendChild(stats);
    var rosterTitle = document.createElement("h2");
    rosterTitle.textContent = "Learners enrolled";
    mount.appendChild(rosterTitle);
    var list = document.createElement("ul");
    list.className = "roster";
    report.learners.forEach(function (learner) {
      var item = document.createElement("li");
      var title = document.createElement("h3");
      title.textContent = learner.name + (learner.example ? " (example)" : "");
      item.appendChild(title);
      var enrolled = report.enrollments.filter(function (row) { return row.learnerId === learner.id; });
      var bits = enrolled.map(function (row) {
        var cert = report.certificates.filter(function (entry) {
          return entry.learnerId === learner.id && entry.courseId === row.courseId;
        })[0];
        var label = names[row.courseId] || row.courseId;
        if (cert) return label + " completed " + String(cert.issuedAt).slice(0, 10);
        var started = report.progress.some(function (entry) {
          return entry.learnerId === learner.id && entry.courseId === row.courseId;
        });
        return label + (started ? " in progress" : " not completed");
      });
      var line = document.createElement("p");
      line.textContent = bits.length ? bits.join("; ") : "No enrolments";
      item.appendChild(line);
      list.appendChild(item);
    });
    mount.appendChild(list);
    var certs = document.createElement("h2");
    certs.textContent = "Certificate records";
    mount.appendChild(certs);
    var certList = document.createElement("ul");
    certList.className = "roster";
    report.certificates.forEach(function (row) {
      var learner = report.learners.filter(function (person) { return person.id === row.learnerId; })[0];
      var li = document.createElement("li");
      var h3 = document.createElement("h3");
      h3.textContent = learner ? learner.name : row.learnerId;
      var p = document.createElement("p");
      p.textContent = String(row.issuedAt).slice(0, 10) + " · " + (names[row.courseId] || row.courseId);
      var meta = document.createElement("p");
      meta.className = "meta";
      meta.textContent = row.id + " · example";
      li.appendChild(h3);
      li.appendChild(p);
      li.appendChild(meta);
      certList.appendChild(li);
    });
    mount.appendChild(certList);
    var locksTitle = document.createElement("h2");
    locksTitle.textContent = "Exam attempts used up";
    mount.appendChild(locksTitle);
    var locks = report.examLocks || [];
    var locksCopy = document.createElement("p");
    locksCopy.textContent = locks.length
      ? "These example learners have used every exam attempt and have not passed. Resetting attempts is a demo action on this device."
      : "No learner in this council has used every exam attempt.";
    mount.appendChild(locksCopy);
    locks.forEach(function (lock) {
      var row = document.createElement("p");
      row.textContent = lock.learnerName + " (" + (lock.learnerCode || lock.learnerId) + ") used " + lock.attempts + " of " + lock.limit + " attempts on " + (names[lock.courseId] || lock.courseId) + " and has not passed.";
      var resetAttempts = document.createElement("button");
      resetAttempts.type = "button";
      resetAttempts.className = "btn btn-secondary";
      resetAttempts.textContent = "Reset exam attempts (demo)";
      resetAttempts.addEventListener("click", function () {
        api.resetExamAttempts(lock.learnerId, lock.courseId);
        window.location.reload();
      });
      mount.appendChild(row);
      mount.appendChild(resetAttempts);
    });
    var exportActions = document.createElement("p");
    exportActions.className = "actions";
    var csvBtn = document.createElement("button");
    csvBtn.type = "button";
    csvBtn.className = "btn";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", function () { downloadReportCsv(report); });
    var printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-secondary";
    printBtn.textContent = "Print report";
    printBtn.addEventListener("click", function () { window.print(); });
    exportActions.appendChild(csvBtn);
    exportActions.appendChild(printBtn);
    mount.appendChild(exportActions);
    var restore = document.createElement("button");
    restore.type = "button";
    restore.className = "btn btn-secondary";
    restore.textContent = "Restore example data";
    restore.addEventListener("click", function () {
      api.resetStore();
      window.location.reload();
    });
    var actions = document.createElement("p");
    actions.className = "actions";
    actions.appendChild(restore);
    mount.appendChild(actions);
  }

  document.documentElement.classList.add("js");
  setupRoleSwitcher();
  gateCourse();
  setupNav();
  setupPlayer();
  setupExam();
  setupQuiz();
  setupWalkthrough();
  setupCertificate();
  setupAdmin();
  setupDashboard();
  paintProgress();
})();
