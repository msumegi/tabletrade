(function () {
  "use strict";

  var LESSONS = 5;

  function empty() {
    return { learnerName: "", councilName: "", courses: {} };
  }

  function store() {
    return window.LearnHereData || window.RangePathData || null;
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
    var rp = window.LEARNHERE;
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
    var rp = window.LEARNHERE;
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
    var node = document.getElementById("learnhere-plan");
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

  function sectionIdOf(section) {
    return section && section.id ? section.id : section;
  }

  function sectionRead(row, sectionId) {
    return Boolean(row.sections && row.sections[sectionIdOf(sectionId)]);
  }

  function lessonReady(data, id, item) {
    var row = lessonRow(data, id, item.n);
    var sections = item.sections || [];
    for (var i = 0; i < sections.length; i++) {
      if (sections[i] && sections[i].optional) continue;
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
        (item.sections || []).forEach(function (section) {
          if (section && section.optional) return;
          total += 1;
          if (sectionRead(row, section)) done += 1;
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
          if (sections[s] && sections[s].optional) continue;
          if (!sectionRead(row, sections[s])) return base + "lesson-" + item.n + "/#section-" + sectionIdOf(sections[s]);
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
        steps += item.lessons || lessonCount(id);
        if (target) return;
        var href = nextHref(data, id, id + "/");
        if (href.indexOf("certificate") === -1) target = { href: href, id: id, shortTitle: shortTitle };
      });
      var summary = document.querySelector("#continue-summary");
      if (summary && order.length) {
        summary.textContent = Math.round(sum / order.length) + "% of the catalogue finished on this device (" + steps + " lessons).";
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
      box.textContent = (ok ? "That's right. " : "Not quite. ") + (explain || (ok ? "" : "The better answer is: " + rightText + "."));
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
      note.textContent = (result && result.reason ? result.reason : "This course is not available for this council right now.") + " Your progress on this device is still saved.";
      main.appendChild(note);
    }
  }

  function demoOn() {
    return /(?:\?|&)demo=1(?:&|$)/.test(window.location.search);
  }

  function setupRoleSwitcher() {
    document.querySelectorAll('a[href$="admin/"]').forEach(function (link) {
      if (!demoOn()) link.hidden = true;
    });
    if (!demoOn()) return;
    var api = store();
    var footer = document.querySelector("footer.site .wrap, footer.site .wrap-wide");
    if (!api || !footer || document.getElementById("demo-controls")) return;
    var user = api.getSessionUser();
    var details = document.createElement("details");
    details.id = "demo-controls";
    details.className = "demo-controls no-print";
    if (demoOn()) details.open = true;
    var summary = document.createElement("summary");
    summary.textContent = "Demo controls";
    details.appendChild(summary);
    var bar = document.createElement("div");
    bar.id = "role-switch";
    bar.className = "role-switch";
    bar.innerHTML = "<p class=\"role-label\">Demo only. This does not sign you in, and it does not erase saved progress.</p>";
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
    details.appendChild(bar);
    footer.appendChild(details);
    document.querySelectorAll('a[href$="admin/"]').forEach(function (link) {
      var staff = user && user.role !== "learner";
      if (!staff && !demoOn()) link.hidden = true;
    });
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
    var main = document.getElementById("main");
    if (main) main.insertAdjacentElement("afterbegin", banner);
    banner.textContent += " Your progress on this device is still saved.";
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
        var api = store();
        var who = api && api.getSessionUser ? api.getSessionUser() : null;
        if (api && who && api.saveProgress) {
          api.saveProgress({
            learnerId: who.id,
            courseId: id,
            itemId: "assignment:" + (btn.getAttribute("data-assignment-done") || lessonNumber),
            kind: "assignment",
            status: "done",
            at: new Date().toISOString()
          });
        }
        paintProgress();
        document.querySelectorAll("[data-solved-file]").forEach(function (item) { item.hidden = false; });
      });
    });
    if (id) {
      var saved = load();
      var bits = (window.location.pathname || "").match(/lesson-(\d+)/);
      var lessonNumber = bits ? bits[1] : "";
      var row = lessonNumber ? lessonRow(saved, id, lessonNumber) : {};
      if (row.assignment) {
        document.querySelectorAll("[data-solved-file]").forEach(function (item) { item.hidden = false; });
      }
    }
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

  function setupExamPager(form) {
    var questions = Array.prototype.slice.call(form.querySelectorAll("[data-exam-q]"));
    if (!questions.length) return;
    var progress = form.querySelector("[data-exam-progress]");
    var back = form.querySelector("[data-exam-back]");
    var next = form.querySelector("[data-exam-next]");
    var review = form.querySelector("[data-exam-review]");
    var submit = form.querySelector("[data-exam-submit]");
    var at = 0;
    var reviewing = false;
    function paint() {
      questions.forEach(function (question, index) { question.hidden = reviewing || index !== at; });
      if (review) review.hidden = !reviewing;
      if (progress) progress.textContent = reviewing ? "Review your answers" : "Question " + (at + 1) + " of " + questions.length;
      if (back) back.hidden = !reviewing && at === 0;
      if (next) {
        next.hidden = reviewing;
        next.textContent = at === questions.length - 1 ? "Review answers" : "Next";
      }
      if (submit) submit.hidden = !reviewing;
      if (reviewing && review) {
        review.textContent = "";
        var list = document.createElement("ol");
        questions.forEach(function (question, index) {
          var chosen = question.querySelector("input:checked");
          var legend = question.querySelector("legend");
          var li = document.createElement("li");
          li.textContent = (legend ? legend.textContent : "Question " + (index + 1)) + " — " + (chosen ? chosen.value : "Not answered");
          list.appendChild(li);
        });
        review.appendChild(list);
      }
    }
    if (back) back.addEventListener("click", function () {
      if (reviewing) { reviewing = false; at = questions.length - 1; }
      else if (at > 0) at -= 1;
      paint();
    });
    if (next) next.addEventListener("click", function () {
      if (at < questions.length - 1) at += 1;
      else reviewing = true;
      paint();
    });
    paint();
  }

  function setupSectionPicker() {
    var picker = document.querySelector(".section-picker");
    if (!picker) return;
    var links = Array.prototype.slice.call(document.querySelectorAll("[data-section-link]"));
    var sections = Array.prototype.slice.call(document.querySelectorAll(".lesson-section"));
    var now = picker.querySelector("[data-section-now]");
    var prev = picker.querySelector("[data-section-prev]");
    var next = picker.querySelector("[data-section-next]");
    function show(index) {
      if (!sections.length) return;
      if (index < 0) index = 0;
      if (index >= sections.length) index = sections.length - 1;
      if (now) now.textContent = String(index + 1);
      links.forEach(function (link, i) {
        if (i === index) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
      if (prev) prev.setAttribute("href", "#" + sections[Math.max(0, index - 1)].id);
      if (next) next.setAttribute("href", "#" + sections[Math.min(sections.length - 1, index + 1)].id);
    }
    function current() {
      var found = 0;
      sections.forEach(function (section, index) {
        var box = section.getBoundingClientRect();
        if (box.top < 160) found = index;
      });
      return found;
    }
    show(current());
    window.addEventListener("scroll", function () { show(current()); }, { passive: true });
    window.addEventListener("hashchange", function () { show(current()); });
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
        var row = lessonRow(data, id, item.n);
        (item.sections || []).forEach(function (section) {
          if (section && section.optional) return;
          if (!sectionRead(row, section)) {
            missing.push({ lesson: item.n, href: "../lesson-" + item.n + "/#section-" + sectionIdOf(section), text: "Mark “" + (section.title || sectionIdOf(section)) + "” as read" });
          }
        });
        if (item.quiz && !row.done) missing.push({ lesson: item.n, href: "../lesson-" + item.n + "/quiz/", text: "Finish the quiz" });
        if (item.assignment && !row.assignment) missing.push({ lesson: item.n, href: "../lesson-" + item.n + "/#" + item.assignment, text: "Tick I tried this on the practice" });
      });
    }
    var attemptNoteEarly = document.getElementById("exam-attempts");
    if (missing.length) {
      if (open) open.hidden = true;
      if (locked) locked.hidden = false;
      if (attemptNoteEarly) attemptNoteEarly.hidden = true;
      if (remaining) {
        remaining.textContent = "";
        var count = document.createElement("p");
        count.textContent = missing.length + (missing.length === 1 ? " required item is" : " required items are") + " left before the exam.";
        remaining.appendChild(count);
        var next = document.createElement("p");
        next.className = "actions";
        var nextLink = document.createElement("a");
        nextLink.className = "btn";
        nextLink.href = missing[0].href;
        nextLink.textContent = "Next thing to do";
        next.appendChild(nextLink);
        remaining.appendChild(next);
        var groups = {};
        missing.forEach(function (item) {
          groups[item.lesson] = groups[item.lesson] || [];
          groups[item.lesson].push(item);
        });
        Object.keys(groups).forEach(function (lesson) {
          var details = document.createElement("details");
          var summary = document.createElement("summary");
          summary.textContent = "Lesson " + lesson + ": " + groups[lesson].length + (groups[lesson].length === 1 ? " thing" : " things");
          details.appendChild(summary);
          var list = document.createElement("ul");
          groups[lesson].forEach(function (item) {
            var li = document.createElement("li");
            var link = document.createElement("a");
            link.href = item.href;
            link.textContent = item.text;
            li.appendChild(link);
            list.appendChild(li);
          });
          details.appendChild(list);
          remaining.appendChild(details);
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
    if (attemptNoteEarly) attemptNoteEarly.hidden = false;
    setupExamPager(form);
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

  function reportFields() {
    return (window.LEARNHERE_REPORT_FIELDS && window.LEARNHERE_REPORT_FIELDS.fields) || [];
  }

  function productName() {
    var config = window.COURSE_BRAND;
    return config && config.name ? config.name : "";
  }

  function sampleBanner() {
    return (window.LEARNHERE_REPORT_FIELDS && window.LEARNHERE_REPORT_FIELDS.sampleBanner) || "Sample data, not real learners";
  }

  function rowExportValue(field, row) {
    var map = {
      learner_code: row.learnerCode,
      display_name: row.displayName,
      course_id: row.courseId,
      course_title: row.courseTitle,
      calp_category_tag: row.calpCategoryTag,
      opportunity_type: row.opportunityType,
      reporting_period_start: row.reportingPeriodStart,
      reporting_period_end: row.reportingPeriodEnd,
      course_started_at: row.courseStartedAt ? String(row.courseStartedAt).slice(0, 10) : "",
      last_activity_at: row.lastActivityAt ? String(row.lastActivityAt).slice(0, 10) : "",
      lessons_completed_count: row.lessonsCompletedCount,
      lessons_total: row.lessonsTotal,
      completed: row.completed ? "yes" : "no",
      stated_course_hours: row.statedCourseHours,
      estimated_time_on_task_hours: row.estimatedTimeOnTaskHours,
      final_exam_passed: row.finalExamPassed ? "yes" : "no",
      final_exam_score: row.finalExamScore,
      final_exam_attempts: row.finalExamAttempts,
      certificate_id: row.certificateId,
      certificate_issued_at: row.certificateIssuedAt ? String(row.certificateIssuedAt).slice(0, 10) : "",
      gender: row.gender,
      age_group: row.ageGroup,
      previous_schooling: row.previousSchooling,
      learner_profile: row.learnerProfile,
      pulse_skills_used_in_daily_life: row.pulseSkillsUsedInDailyLife,
      pulse_progress_toward_goal: row.pulseProgressTowardGoal,
      pulse_increased_confidence: row.pulseIncreasedConfidence,
      pulse_program_relevant: row.pulseProgramRelevant,
      pulse_felt_welcome: row.pulseFeltWelcome
    };
    return map[field.name] == null ? "" : map[field.name];
  }

  function humanEnum(value) {
    var map = {
      basic_digital_skills: "Basic digital skills",
      skills_for_learning: "Skills for learning",
      adult_literacy: "Adult literacy",
      numeracy: "Numeracy",
      english_language_learning: "English language learning",
      community_capacity_building: "Community capacity building",
      other: "Other",
      not_applied: "Not applied",
      ongoing: "Ongoing learning opportunity",
      one_time: "One-time activity",
      undecided: "Not decided yet",
      prefer_not_to_say: "Prefer not to say",
      gender: "Gender",
      ageGroup: "Age group",
      previousSchooling: "Previous schooling",
      learnerProfile: "Learner profile",
      pulseSkillsUsedInDailyLife: "Uses the skills in daily life",
      pulseProgressTowardGoal: "Progress toward a goal",
      pulseIncreasedConfidence: "Increased confidence",
      pulseProgramRelevant: "Program felt relevant",
      pulseFeltWelcome: "Felt welcome",
      yes: "Yes",
      no: "No",
      "not collected": "Not collected"
    };
    return map[value] || value;
  }

  function downloadReportCsv(report) {
    var lines = [csvCell(sampleBanner())];
    lines.push(["Reporting period", report.period.from.slice(0, 10), report.period.to.slice(0, 10)].map(csvCell).join(","));
    lines.push(["Unique learner codes", report.totals.uniqueLearners].map(csvCell).join(","));
    lines.push(["Learner codes who started", report.activeLearners].map(csvCell).join(","));
    lines.push(["Starts", report.totals.starts].map(csvCell).join(","));
    lines.push(["Completions", report.totals.completions].map(csvCell).join(","));
    lines.push(["Completion rate", report.totals.completionRate + "%"].map(csvCell).join(","));
    lines.push(["Stated hours for ready lessons", report.totals.statedHours].map(csvCell).join(","));
    lines.push(["Estimated hours from progress", report.totals.estimatedHours].map(csvCell).join(","));
    lines.push(["Certificates", report.totals.certificates].map(csvCell).join(","));
    lines.push([]);
    lines.push(["Course", "Category", "Type", "Learners", "Starts", "Completions", "Stated hours", "Estimated hours"].map(csvCell).join(","));
    (report.courses || []).forEach(function (course) {
      lines.push([course.courseTitle, humanEnum(course.calpCategoryTag), humanEnum(course.opportunityType), course.learners, course.starts, course.completions, course.statedHoursTotal, course.estimatedHoursTotal].map(csvCell).join(","));
    });
    lines.push([]);
    lines.push(["Demographic totals"].map(csvCell).join(","));
    Object.keys(report.demographicTotals || {}).forEach(function (key) {
      var counts = report.demographicTotals[key];
      Object.keys(counts).forEach(function (value) {
        lines.push([humanEnum(key), humanEnum(value), counts[value]].map(csvCell).join(","));
      });
    });
    lines.push([]);
    lines.push(["After-course question totals"].map(csvCell).join(","));
    Object.keys(report.pulseTotals || {}).forEach(function (key) {
      var item = report.pulseTotals[key];
      Object.keys(item.counts || {}).forEach(function (value) {
        if (!value) return;
        lines.push([humanEnum(key), humanEnum(value), item.counts[value]].map(csvCell).join(","));
      });
    });
    lines.push([]);
    lines.push(["Progress by learner code"].map(csvCell).join(","));
    lines.push(["Learner code", "Course", "Started", "Lessons finished", "Lessons total", "Completed", "Exam passed", "Exam score", "Certificate id"].map(csvCell).join(","));
    (report.rows || []).forEach(function (row) {
      lines.push([row.learnerCode, row.courseTitle, row.courseStartedAt ? String(row.courseStartedAt).slice(0, 10) : "", row.lessonsCompletedCount, row.lessonsTotal, row.completed ? "yes" : "no", row.finalExamPassed ? "yes" : "no", row.finalExamScore, row.certificateId].map(csvCell).join(","));
    });
    var blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "learnhere-sample-report.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function tallyText(counts) {
    return Object.keys(counts || {}).map(function (key) { return humanEnum(key) + " " + counts[key]; }).join(", ");
  }

  function paintDashboard(mount, report) {
    mount.textContent = "";
    var banner = document.createElement("p");
    banner.className = "sample-banner";
    banner.textContent = sampleBanner();
    mount.appendChild(banner);

    var screen = document.createElement("div");
    screen.className = "report-screen";
    var totals = report.totals || {};
    var summary = document.createElement("ul");
    summary.className = "stats";
    [
      [String(report.activeLearners || 0), "Learner codes who started"],
      [String(totals.starts || 0), "Course starts"],
      [String(totals.completions || 0), "Completions"],
      [String(totals.statedHours || 0), "Stated hours"],
      [String(totals.estimatedHours || 0), "Estimated hours"],
      [String(totals.certificates || 0), "Certificates"]
    ].forEach(function (pair) {
      var li = document.createElement("li");
      li.className = "stat";
      var strong = document.createElement("strong");
      strong.textContent = pair[0];
      li.appendChild(strong);
      li.appendChild(document.createTextNode(" " + pair[1]));
      summary.appendChild(li);
    });
    screen.appendChild(summary);
    var seat = document.createElement("p");
    seat.textContent = report.seatNote + (report.seatCap == null ? " No operational cap is set." : " Optional cap: " + report.seatCap + ".");
    screen.appendChild(seat);

    var courseTitle = document.createElement("h2");
    courseTitle.textContent = "Progress by course";
    screen.appendChild(courseTitle);
    var courseList = document.createElement("div");
    courseList.className = "report-cards";
    (report.courses || []).forEach(function (course) {
      var card = document.createElement("article");
      card.className = "report-card";
      var h3 = document.createElement("h3");
      h3.textContent = course.courseTitle;
      var body = document.createElement("p");
      body.textContent = "Category: " + humanEnum(course.calpCategoryTag || "not set") + ". " + humanEnum(course.opportunityType || "undecided") + ". " + course.learners + " learner codes, " + course.starts + " starts, " + course.completions + " completions (" + course.completionRate + "%). Stated hours " + course.statedCourseHours + " for the lessons that are ready. Estimated hours from progress: " + course.estimatedHoursTotal + ".";
      card.appendChild(h3);
      card.appendChild(body);
      courseList.appendChild(card);
    });
    if (!(report.courses || []).length) {
      var empty = document.createElement("p");
      empty.textContent = "No sample enrolments in this course and date range.";
      courseList.appendChild(empty);
    }
    screen.appendChild(courseList);

    var peopleTitle = document.createElement("h2");
    peopleTitle.textContent = "Learners enrolled";
    screen.appendChild(peopleTitle);
    var people = {};
    (report.rows || []).forEach(function (row) {
      if (!people[row.learnerCode]) people[row.learnerCode] = { name: row.displayName, code: row.learnerCode, rows: [] };
      people[row.learnerCode].rows.push(row);
    });
    var roster = document.createElement("div");
    roster.className = "report-cards";
    Object.keys(people).forEach(function (code) {
      var person = people[code];
      var card = document.createElement("article");
      card.className = "report-card";
      var h3 = document.createElement("h3");
      h3.textContent = person.name + " · " + person.code;
      card.appendChild(h3);
      person.rows.forEach(function (row) {
        var line = document.createElement("p");
        var state = row.completed ? "Completed" : (row.started ? "In progress" : "Enrolled, not started");
        line.textContent = row.courseTitle + " — " + state + ". Lessons " + row.lessonsCompletedCount + " of " + row.lessonsTotal + ". Estimated hours " + (row.estimatedTimeOnTaskHours == null ? "not calculated" : row.estimatedTimeOnTaskHours) + ".";
        card.appendChild(line);
      });
      roster.appendChild(card);
    });
    screen.appendChild(roster);

    var certTitle = document.createElement("h2");
    certTitle.textContent = "Certificates issued";
    screen.appendChild(certTitle);
    var certs = document.createElement("div");
    certs.className = "report-cards";
    (report.rows || []).filter(function (row) { return row.certificateId; }).forEach(function (row) {
      var card = document.createElement("article");
      card.className = "report-card";
      var h3 = document.createElement("h3");
      h3.textContent = row.displayName + " · " + row.learnerCode;
      var p = document.createElement("p");
      p.textContent = String(row.certificateIssuedAt).slice(0, 10) + " · " + row.courseTitle + " · " + row.certificateId;
      card.appendChild(h3);
      card.appendChild(p);
      certs.appendChild(card);
    });
    screen.appendChild(certs);

    var demoTitle = document.createElement("h2");
    demoTitle.textContent = "Optional demographics (totals)";
    screen.appendChild(demoTitle);
    var demo = document.createElement("p");
    var demoTotals = report.demographicTotals || {};
    demo.textContent = "Gender: " + tallyText(demoTotals.gender) + ". Age group: " + tallyText(demoTotals.ageGroup) + ". Previous schooling: " + tallyText(demoTotals.previousSchooling) + ". Learner profile: " + tallyText(demoTotals.learnerProfile) + ".";
    screen.appendChild(demo);

    var pulseTitle = document.createElement("h2");
    pulseTitle.textContent = "Optional after-course questions";
    screen.appendChild(pulseTitle);
    var pulseNames = {
      pulseSkillsUsedInDailyLife: "1.2 a Uses the skill in daily life",
      pulseProgressTowardGoal: "1.2 b Progress toward a goal",
      pulseIncreasedConfidence: "1.2 c Increased confidence",
      pulseProgramRelevant: "2.2 a Program felt relevant",
      pulseFeltWelcome: "2.2 b Felt welcome"
    };
    Object.keys(pulseNames).forEach(function (key) {
      var item = (report.pulseTotals || {})[key] || { counts: {}, percentYes: null };
      var p = document.createElement("p");
      p.textContent = pulseNames[key] + ": " + tallyText(item.counts) + (item.percentYes == null ? "" : ". Yes among yes/no answers: " + item.percentYes + "%.");
      screen.appendChild(p);
    });
    mount.appendChild(screen);

    var printed = document.createElement("article");
    printed.className = "funder-print";
    printed.innerHTML = "<p class=\"sample-banner\"></p><h1></h1><p class=\"report-period\"></p><h2>Summary</h2><ul class=\"report-totals\"></ul><h2>Per course</h2><div class=\"table-scroll\"><table class=\"report-table\"><thead><tr><th>Course</th><th>Category</th><th>Type</th><th>Learners</th><th>Starts</th><th>Completions</th><th>Rate</th><th>Stated hours</th><th>Estimated hours</th></tr></thead><tbody></tbody></table></div><h2>Notes</h2><p class=\"report-notes\"></p>";
    printed.querySelector("h1").textContent = productName() + " funder report";
    printed.querySelector(".sample-banner").textContent = sampleBanner();
    printed.querySelector(".report-period").textContent = "Reporting period " + report.period.from.slice(0, 10) + " to " + report.period.to.slice(0, 10) + ". Sample grant period " + report.grantPeriod.start + " to " + report.grantPeriod.end + ". These dates are a sample selection, not an official funder calendar.";
    var totalList = printed.querySelector(".report-totals");
    [
      "Unique learner codes: " + totals.uniqueLearners,
      "Learner codes who started a course: " + report.activeLearners,
      "Starts: " + totals.starts,
      "Completions: " + totals.completions + " (" + totals.completionRate + "%)",
      "Certificates: " + totals.certificates,
      "Stated hours for completions: " + totals.statedHours + " (placeholder estimate)",
      "Estimated hours from progress: " + totals.estimatedHours + " (placeholder, not a timer)"
    ].forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      totalList.appendChild(li);
    });
    var tbody = printed.querySelector("tbody");
    (report.courses || []).forEach(function (course) {
      var tr = document.createElement("tr");
      [course.courseTitle, course.calpCategoryTag, course.opportunityType, course.learners, course.starts, course.completions, course.completionRate + "%", course.statedHoursTotal, course.estimatedHoursTotal].forEach(function (value) {
        var td = document.createElement("td");
        td.textContent = value == null ? "" : String(value);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    printed.querySelector(".report-notes").textContent = report.draft;
    mount.appendChild(printed);

    if ((report.examLocks || []).length) {
      var lockTitle = document.createElement("h2");
      lockTitle.className = "no-print";
      lockTitle.textContent = "Exam attempts used up";
      mount.appendChild(lockTitle);
      report.examLocks.forEach(function (lock) {
        var p = document.createElement("p");
        p.className = "no-print";
        p.textContent = lock.learnerName + " (" + lock.learnerCode + ") used " + lock.attempts + " of " + lock.limit + " attempts on " + lock.courseId + " and has not passed.";
        var button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-secondary no-print";
        button.textContent = "Reset exam attempts (demo)";
        button.addEventListener("click", function () {
          store().resetExamAttempts(lock.learnerId, lock.courseId);
          window.location.reload();
        });
        mount.appendChild(p);
        mount.appendChild(button);
      });
    }
  }

  function focusCertificate() {
    var list = document.getElementById("cert-course-links");
    if (!list) return;
    var course = "";
    try { course = new URLSearchParams(window.location.search).get("course") || ""; } catch (err) { course = ""; }
    var items = Array.prototype.slice.call(list.querySelectorAll("li"));
    if (!course) {
      list.hidden = true;
      var note = document.createElement("p");
      note.textContent = "Open the certificate from the course you passed. This page then shows that course only.";
      list.insertAdjacentElement("beforebegin", note);
      return;
    }
    items.forEach(function (item) {
      var link = item.querySelector("a");
      var href = link ? link.getAttribute("href") || "" : "";
      item.hidden = href.indexOf("/" + course + "/") === -1;
    });
    var select = document.getElementById("cert-course");
    if (select) {
      Array.prototype.slice.call(select.options).forEach(function (option) {
        if (option.value !== course) option.remove();
      });
    }
  }

  function setupDashboard() {
    var mount = document.getElementById("org-report");
    if (!mount) return;
    var api = store();
    if (!api || !api.getSampleReport) return;
    var user = api.getSessionUser();
    if ((!user || user.role === "learner") && !demoOn()) {
      mount.textContent = "";
      var closed = document.createElement("p");
      closed.textContent = demoOn()
        ? "This page is for council staff. In this demo, open the address with ?demo=1 and choose Council staff. A learner session does not show the roster, the CSV, or exam resets."
        : "This page is for council staff. Staff sign-in comes later. A learner session does not show the roster, the CSV, or exam resets.";
      mount.appendChild(closed);
      return;
    }
    var grant = api.getSampleReport();
    var filters = document.createElement("form");
    filters.className = "report-filters no-print";
    filters.innerHTML = "<label>Course <select name=\"course\"><option value=\"\">All courses</option></select></label><label>From <input name=\"from\" type=\"date\"></label><label>To <input name=\"to\" type=\"date\"></label>";
    var select = filters.querySelector("select");
    (grant.assignments || []).forEach(function (assignment) {
      var option = document.createElement("option");
      option.value = assignment.courseId;
      option.textContent = assignment.courseTitle;
      select.appendChild(option);
    });
    filters.querySelector("[name=from]").value = grant.grantPeriod.start;
    filters.querySelector("[name=to]").value = grant.grantPeriod.end;
    mount.parentNode.insertBefore(filters, mount);
    function render() {
      var report = api.getSampleReport({
        from: filters.querySelector("[name=from]").value,
        to: filters.querySelector("[name=to]").value,
        courseId: select.value
      });
      paintDashboard(mount, report);
      mount._report = report;
    }
    filters.addEventListener("change", render);
    var actions = document.createElement("p");
    actions.className = "actions no-print";
    var csvBtn = document.createElement("button");
    csvBtn.type = "button";
    csvBtn.className = "btn";
    csvBtn.textContent = "Download CSV";
    csvBtn.addEventListener("click", function () { downloadReportCsv(mount._report); });
    var printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.className = "btn btn-secondary";
    printBtn.textContent = "Print report";
    printBtn.addEventListener("click", function () { window.print(); });
    actions.appendChild(csvBtn);
    actions.appendChild(printBtn);
    mount.parentNode.insertBefore(actions, mount);
    render();
  }

  document.documentElement.classList.add("js");
  setupRoleSwitcher();
  gateCourse();
  setupNav();
  setupPlayer();
  setupSectionPicker();
  setupExam();
  focusCertificate();
  setupQuiz();
  setupWalkthrough();
  setupCertificate();
  setupAdmin();
  setupDashboard();
  paintProgress();
})();
