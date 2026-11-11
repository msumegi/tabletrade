#!/usr/bin/env node
/**
 * Build catalogue, course, lesson, quiz, and certificate pages from
 * data/registry.json and data/courses/*.json.
 *
 * Usage:
 *   node tools/build-pages.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { renderBlocks } from "./blocks.mjs";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://rangeroadtech.com/demos/range-path/";
const DISCLAIMER =
  "This course is general information for adult learners in Canada. It is not legal, tax, financial, medical, driving-instruction, or immigration advice. Always check official pages on Canada.ca, Alberta.ca, or your council staff for your situation.";
const MARK =
  '<svg class="mark" viewBox="0 0 32 32" width="32" height="32" aria-hidden="true"><rect width="32" height="32" rx="7" fill="#123c2e"/><path d="M6.5 23.5c4-8 7.2-8.4 10-3.6 2.2 3.8 4.6 3.2 9.2-8.4" fill="none" stroke="#f4efe4" stroke-width="2.4" stroke-linecap="round"/><circle cx="25.2" cy="11.2" r="2.1" fill="#e4c27a"/></svg>';

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function neededCorrect(total, ratio) {
  let count = 0;
  while (count < total && count / total < ratio) count += 1;
  return count;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

const brand = readJson(path.join(demoRoot, "data", "brand.json"));

function branded(title) {
  return title + " · " + brand.name;
}

function write(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
}

function replaceMarked(html, name, inner) {
  const start = "<!-- range-path:" + name + " -->";
  const end = "<!-- /range-path:" + name + " -->";
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from === -1 || to === -1 || to < from) {
    throw new Error("Missing marker " + name);
  }
  return html.slice(0, from + start.length) + "\n" + inner.trim() + "\n" + html.slice(to);
}

function prefixSrcset(srcset, prefix) {
  return srcset
    .split(",")
    .map((part) => {
      const bits = part.trim().split(/\s+/);
      if (!bits[0]) return "";
      bits[0] = prefix + bits[0].replace(/^(?:\.\.\/)+/, "");
      return bits.join(" ");
    })
    .filter(Boolean)
    .join(", ");
}

function page({ depth, title, description, canonical, nav, main, wide, courseId }) {
  const root = "../".repeat(depth);
  const canonicalUrl = SITE + canonical;
  return `<!DOCTYPE html>
<html lang="en-CA">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <meta name="theme-color" content="#123c2e">
  <meta name="application-name" content="${esc(brand.name)}">
  <meta name="description" content="${esc(description)}">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <meta property="og:site_name" content="${esc(brand.name)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:image" content="${SITE}og.jpg">
  <meta property="og:image:alt" content="${esc(brand.name)} — a grain terminal on the prairie in Edson, Alberta">
  <meta property="og:locale" content="en_CA">
  <link rel="icon" href="${root}favicon.svg" type="image/svg+xml">
  <link rel="icon" href="${root}favicon.png" type="image/png" sizes="32x32">
  <link rel="apple-touch-icon" href="${root}apple-touch.png">
  <link rel="stylesheet" href="${root}assets/site.css">
  <script>document.documentElement.classList.add("js");</script>
</head>
<body${courseId ? ` data-course-gate="${esc(courseId)}"` : ""}>
  <a class="skip" href="#main">Skip to content</a>
  <header class="site">
    <div class="site-bar">
      <a class="brand" href="${root}">
        ${MARK}
        <span class="brand-text"><span class="brand-name">${esc(brand.name)}</span><span class="brand-sub">Practical skills for rural adult learners</span></span>
      </a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    </div>
    <nav id="site-nav" class="is-collapsed" aria-label="Main">
      <div class="site-bar">${nav}</div>
    </nav>
  </header>
  <main id="main">
    <div class="${wide ? "wrap-wide" : "wrap"}">
${main}
      <p data-storage-note hidden>Progress could not be saved on this device. You can still read the course.</p>
    </div>
  </main>
  <footer class="site">
    <div class="wrap">
      <p class="disclaimer">${DISCLAIMER}</p>
      <p class="credit"><a href="https://rangeroadtech.com/" target="_blank" rel="noopener noreferrer">A product of Range Road Technologies.</a> · <a href="${root}privacy/">Privacy</a></p>
    </div>
  </footer>
  <script src="${root}assets/brand.js"></script>
  <script>
    (function () {
      var demo = /(?:\\?|&)demo=1(?:&|$)/.test(location.search);
      var staff = /\\/admin\\//.test(location.pathname);
      if (demo || staff) document.write('<script src="${root}assets/demo-seed.js"><\\/script>');
    })();
  </script>
  <script src="${root}assets/billing.js"></script>
  <script src="${root}assets/data.js"></script>
  <script src="${root}assets/report-fields.js"></script>
  <script src="${root}assets/catalogue.js"></script>
  <script src="${root}assets/player-blocks.js"></script>
  <script src="${root}assets/site.js"></script>
</body>
</html>
`;
}

function mainNav(root, current) {
  const items = [
    ["", "Home"],
    ["courses/", "Courses"],
    ["pricing/", "Pricing"],
    ["walkthrough/", "Walkthrough"],
    ["admin/?demo=1", "Staff demo"]
  ];
  return (
    "<ul>" +
    items
      .map(([href, label]) => {
        const on = current === href ? ' aria-current="page"' : "";
        return `<li><a href="${root}${href}"${on}>${label}</a></li>`;
      })
      .join("") +
    "</ul>"
  );
}

function lessonNav(root, courseHref, label) {
  return `<ul><li><a href="${root}courses/">Courses</a></li><li><a href="${courseHref}">${esc(label)}</a></li><li><a href="${root}privacy/">Privacy</a></li></ul>`;
}

function imageTag(media, prefix, eager) {
  if (!media || !media.src) return "";
  const src = prefix + media.src.replace(/^(?:\.\.\/)+/, "");
  const srcset = media.srcset ? ` srcset="${esc(prefixSrcset(media.srcset, prefix))}"` : "";
  const sizes = media.sizes ? ` sizes="${esc(media.sizes)}"` : "";
  const loading = eager ? ' fetchpriority="high"' : ' loading="lazy"';
  return `<div class="${esc(media.frameClass || "frame frame-wide")}"><img src="${esc(src)}"${srcset}${sizes} width="${Number(media.width) || 1280}" height="${Number(media.height) || 853}" alt="${esc(media.alt || "")}"${loading} decoding="async"></div>`;
}

function sourceList(sources) {
  if (!sources || !sources.length) return "";
  const items = sources
    .filter((source) => /^https?:\/\//i.test(source.url))
    .map(
      (source) =>
        `<li><a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.label)} <span>(opens in a new tab)</span></a></li>`
    )
    .join("\n");
  if (!items) return "";
  return `<h2>Official sources</h2>
<p>These links open official sites in a new tab.</p>
<ul class="sources">
${items}
</ul>`;
}

function quizForm({ course, part, partId, questions, nextUrl, nextLabel, certUrl }) {
  const items = questions
    .map((question, index) => {
      const name = "q" + (index + 1);
      const choices = question.choices
        .map(
          (choice) =>
            `<label class="option"><input type="radio" name="${name}" value="${esc(choice.id)}"> <span>${esc(choice.text)}</span></label>`
        )
        .join("\n");
      const explain = question.explain ? `<p class="explain" hidden>${esc(question.explain)}</p>` : `<p class="explain" hidden></p>`;
      return `<li class="q" data-answer="${esc(question.answer)}">
      <fieldset>
        <legend>${esc(question.prompt)}</legend>
        ${choices}
      </fieldset>
      ${explain}
    </li>`;
    })
    .join("\n");
  return `<form class="quiz" data-quiz data-course="${esc(course.slug)}" data-part="${part}" data-id="${esc(partId)}" data-next-url="${esc(nextUrl)}" data-next-label="${esc(nextLabel)}" data-cert-url="${esc(certUrl)}">
  <p class="quiz-progress">Question <span data-qnow>1</span> of <span>${questions.length}</span></p>
  <ol class="questions">${items}</ol>
  <div class="quiz-actions actions">
    <button type="button" class="btn" data-check>Check answer</button>
    <button type="button" class="btn" data-next hidden>Next question</button>
  </div>
  <div class="quiz-result" aria-live="polite"></div>
</form>`;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " bytes";
  const kb = bytes / 1024;
  return (kb >= 10 ? Math.round(kb) : Math.round(kb * 10) / 10) + " KB";
}

function isPlayerV2(course) {
  return course.lessons.some((lesson) => lesson.sections && lesson.sections.length);
}

function coursePlan(course) {
  if (!isPlayerV2(course) && !course.finalExam) return null;
  return {
    id: course.slug,
    requireAllLessons: Boolean(course.finalExam && course.finalExam.requireAllLessons),
    exam: Boolean(course.finalExam),
    attemptLimit: course.finalExam ? course.finalExam.attemptLimit || 2 : 0,
    statedHours: course.player && course.player.estimatedMinutes ? Math.round((course.player.estimatedMinutes / 60) * 10) / 10 : null,
    hoursLabel: (course.player && course.player.hoursLabel) || "",
    lessons: course.lessons.map((lesson, index) => ({
      n: index + 1,
      title: lesson.title,
      sections: (lesson.sections || []).map((section) => ({
        id: section.id,
        title: section.title,
        optional: /optional discussion/i.test(section.title || "")
      })),
      assignment: lesson.assignment ? lesson.assignment.id || "lesson-" + (index + 1) + "-task" : "",
      quiz: Boolean(lesson.quiz && lesson.quiz.length)
    }))
  };
}

function sectionNav(sections) {
  if (!sections.length) return "";
  const items = sections
    .map(
      (section, index) =>
        `<li><a href="#section-${esc(section.id)}" data-section-link="${index + 1}">${esc(section.title)}</a> <span class="meta">${section.minutes || 0} min</span></li>`
    )
    .join("");
  const next = sections[1] || sections[0];
  return `<div class="section-picker">
  <p class="section-now">Section <span data-section-now>1</span> of ${sections.length}</p>
  <p class="actions"><a class="btn btn-secondary" data-section-prev href="#section-${esc(sections[0].id)}">Previous section</a> <a class="btn" data-section-next href="#section-${esc(next.id)}">Next section</a></p>
  <details>
    <summary>Sections in this lesson</summary>
    <ol>${items}</ol>
  </details>
</div>`;
}

function filesBlock(files) {
  if (!files || !files.length) return "";
  const starters = files.filter((file) => !file.solved);
  const solved = files.filter((file) => file.solved);
  const item = (file) => {
    const label = file.label || (file.solved ? "Solved sample" : "Practice file");
    const saveAs = file.downloadName || file.name;
    const gated = file.solved ? ` data-solved-file hidden` : "";
    return `<li${gated}><a class="btn" href="${esc(file.href)}" download="${esc(saveAs)}">${esc(label)}</a> <span class="meta">${esc(file.kind || "File")} · ${formatBytes(file.bytes || 0)}</span></li>`;
  };
  return `<h2>Practice files</h2>
<p>Download a practice file and open it in Excel. Windows, Mac, and Excel for the web can look different. A solved file stays closed until you tick “I tried this” on the practice.</p>
<ul class="file-list">${starters.map(item).join("")}${solved.map(item).join("")}</ul>`;
}

function isCapstone(section) {
  return section.id === "capstone" || /^capstone/i.test(section.title || "");
}

function shareMinutes(lesson) {
  const sections = lesson.sections || [];
  const reading = sections.filter((section) => !isCapstone(section));
  const total = lesson.minutes || reading.length || 1;
  const count = reading.length || 1;
  const base = Math.floor(total / count);
  let extra = total - base * count;
  let index = 0;
  return sections.map((section) => {
    if (isCapstone(section)) return Object.assign({}, section, { minutes: 20, capstone: true });
    const minutes = base + (index < extra ? 1 : 0);
    index += 1;
    return Object.assign({}, section, { minutes });
  });
}

function sectionedLesson(course, lesson, number) {
  const timed = shareMinutes(lesson);
  const sections = timed
    .map((section, index) => {
      const blocks = section.blocks && section.blocks.length ? section.blocks : [{ type: "prose", html: section.html || "" }];
      const rendered = renderBlocks(blocks, { lessonNumber: number });
      rendered.unknown.forEach((type) => {
        console.warn(course.slug + " lesson " + number + ": no renderer for block type " + type);
      });
      const prev = index > 0 ? timed[index - 1] : null;
      const next = timed[index + 1];
      return `<section class="lesson-section longform reading" id="section-${esc(section.id)}">
  <h2>${esc(section.title)}</h2>
  <p class="meta">${section.capstone ? "About " + section.minutes + " minutes of practice." : "About " + (section.minutes || 0) + " " + (section.minutes === 1 ? "minute" : "minutes") + " to read, plus a short practice."}</p>
  <p class="actions no-print"><button type="button" class="btn btn-secondary" data-listen hidden>Listen to this section</button></p>
  ${rendered.html}
  <p class="actions">
    ${prev ? `<a class="btn btn-secondary" href="#section-${esc(prev.id)}">Previous section</a>` : ""}
    <button type="button" class="btn" data-read-section="${esc(section.id)}" data-lesson="${number}">Mark this section as read</button>
    ${next ? `<a class="btn" href="#section-${esc(next.id)}" data-read-section="${esc(section.id)}" data-lesson="${number}">Next section</a>` : ""}
  </p>
  <p class="meta" data-section-status="${esc(course.slug)}:${number}:${esc(section.id)}">Not read yet.</p>
</section>`;
    })
    .join("\n");
  const assignment = lesson.assignment
    ? renderBlocks([Object.assign({ type: "assignment" }, lesson.assignment)], { lessonNumber: number }).html
    : "";
  return `${sectionNav(timed)}
<p>This lesson is split into short sections. Read a section, mark it as read, then go to the next one. Your place is saved on this device.</p>
${sections}
${filesBlock(lesson.files)}
${assignment}
${lesson.cheatSheet ? renderBlocks([{ type: "cheatSheet", ...lesson.cheatSheet }], { lessonNumber: number }).html : ""}`;
}

function syllabusExtras(course, passLabel) {
  if (!course.player && !(course.comingSoon || []).length) return "";
  const outcomes = ((course.player && course.player.outcomes) || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  const need = ((course.player && course.player.youNeed) || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  const minutes = (course.lessons || []).reduce((sum, lesson) => sum + (lesson.minutes || 0), 0);
  const hours = minutes ? Math.round((minutes / 60) * 10) / 10 : 0;
  const attempts = course.finalExam ? course.finalExam.attemptLimit || 2 : 0;
  const later = (course.comingSoon || []).length;
  const practiceLabel = {
    "word-basics-canada": "practice documents",
    "outlook-workplace-email": "practice message files",
    "job-search-canada": "practice worksheets",
    "everyday-computers-smartphones": "practice checklists"
  };
  const included = {
    practiceFile: practiceLabel[course.slug] || "a practice workbook",
    checks: "in-lesson checks",
    assignment: "a practice task in each ready lesson",
    cheatSheets: "a cheat sheet you can print",
    final: "a " + passLabel + " final with " + attempts + " attempts",
    sampleCertificate: "a sample certificate"
  };
  const includeLine = (course.includes || []).map((key) => included[key] || key).join(", ");
  return `<section class="syllabus">
  <h2>Syllabus</h2>
  <p>You do not need a password or a payment to open these lessons. Your place is saved on this device only.</p>
  ${(course.player && course.player.hoursLabel) ? `<p><strong>${esc(course.player.hoursLabel)}</strong></p>` : hours ? `<p><strong>About ${hours} hours</strong> for the ${course.lessons.length} lessons (estimate).</p>` : ""}
  ${includeLine ? `<h3>What's included</h3><p>${esc(includeLine)}.</p>` : ""}
  ${(course.lessons || []).some((lesson) => (lesson.sections || []).some((section) => (section.blocks || []).some((block) => block.type === "cheatSheet"))) ? `<p><a href="cheat-sheet/">Print the course cheat sheet</a>. You can also save that page as a PDF from the print dialog.</p>` : ""}
  ${outcomes ? `<h3>Learning outcomes</h3><ul class="check">${outcomes}</ul>` : ""}
  ${need ? `<h3>What you need</h3><ul class="check">${need}</ul>` : ""}
  <h3>Final exam and certificate</h3>
  <p>The final exam covers all ${course.lessons.length} lessons. The pass mark is ${passLabel}. You have ${attempts} attempt${attempts === 1 ? "" : "s"}. There is no timer. The certificate means you passed the knowledge exam. It does not mean a tutor watched you do the task. It stays locked until you pass, and it is not an accredited credential.</p>
  <p class="actions"><button type="button" class="btn btn-secondary" data-reset-course="${esc(course.slug)}">Reset my progress for this course</button></p>
  <p id="reset-status" role="status"></p>
</section>`;
}

function examPage(course, passLabel, need, total) {
  const questions = course.finalExam.questions || [];
  const key = questions.map((question) => ({
    answer: question.answer,
    topic: question.topic || "",
    review: question.review || "../"
  }));
  const fields = questions
    .map((question, index) => {
      const choices = (question.choices || [])
        .map(
          (choice) =>
            `<label class="option"><input type="radio" name="e${index}" value="${esc(choice.id)}"> <span>${esc(choice.text)}</span></label>`
        )
        .join("");
      return `<fieldset class="q exam-q" data-exam-q="${index}" ${index ? "hidden" : ""}><legend>${esc(question.prompt)}</legend>${choices}</fieldset>`;
    })
    .join("");
  const attemptLimit = course.finalExam.attemptLimit || 2;
  return `<p id="exam-attempts" class="meta">Attempts remaining: ${attemptLimit} of ${attemptLimit}.</p>
<div id="exam-used" hidden>
  <h2 data-exam-used-title>No attempts left</h2>
  <p data-exam-used-copy>You have used every attempt. Ask council staff if you should have another try.</p>
  <p><a class="btn" href="../">Back to the syllabus</a></p>
</div>
<div id="exam-locked">
  <h2>Finish the lessons first</h2>
  <p>This exam stays closed until the required sections, lesson quizzes, and practice tasks are done. Optional discussions are not required. The pass mark is ${passLabel} (at least ${need} of ${total}). The sample certificate stays locked until you pass.</p>
  <div data-exam-remaining></div>
  <p><a class="btn" href="../">Back to the syllabus</a></p>
</div>
<div id="exam-open" hidden>
  <p>One question at a time. You can go back, then review every answer before you submit. Correct answers stay hidden. This exam allows ${attemptLimit} attempts. Your score stays on this device.</p>
  <form data-exam data-course="${esc(course.slug)}" data-pass="${course.finalExam.passMark || 0.7}" data-attempts="${attemptLimit}">
    <p data-exam-progress>Question 1 of ${questions.length}</p>
    ${fields}
    <div data-exam-review hidden></div>
    <p class="actions"><button type="button" class="btn btn-secondary" data-exam-back>Back</button> <button type="button" class="btn" data-exam-next>Next</button> <button type="submit" class="btn" data-exam-submit hidden>Submit exam</button></p>
    <div class="quiz-result" aria-live="polite"></div>
  </form>
</div>
<script type="application/json" id="exam-key">${JSON.stringify(key)}</script>`;
}

function buildCoursePages(course, entry, passMark) {
  const slug = course.slug;
  const dir = path.join(demoRoot, "courses", slug);
  fs.rmSync(dir, { recursive: true, force: true });
  const count = course.lessons.length;
  const finalCount = course.finalQuiz && course.finalQuiz.questions
    ? course.finalQuiz.questions.length
    : course.finalExam && course.finalExam.questions
      ? course.finalExam.questions.length
      : 0;
  const need = neededCorrect(finalCount, passMark);
  const passLabel = Math.round(passMark * 100) + "%";
  const navLabel = entry.navLabel || entry.shortTitle || course.title;
  const summary = course.summary || course.goals || "";
  const intro = course.introHtml
    ? course.introHtml
    : `<p class="lede">${esc(summary)}</p>${course.player && course.player.outcomes && course.player.outcomes.length ? "" : course.goals && course.goals !== summary ? "\n<p>" + esc(course.goals) + "</p>" : ""}`;

  const examMode = Boolean(course.finalExam && course.finalExam.questions && course.finalExam.questions.length);
  const finalCountShown = examMode ? course.finalExam.questions.length : finalCount;
  const needShown = neededCorrect(finalCountShown, examMode && course.finalExam.passMark ? course.finalExam.passMark : passMark);
  const lessonItems = course.lessons
    .map((lesson, index) => {
      const number = index + 1;
      const minutes = lesson.minutes ? ` · about ${lesson.minutes} min` : "";
      const sectionList = (lesson.sections || [])
        .map(
          (section) =>
            `<li><a href="lesson-${number}/#section-${esc(section.id)}">${esc(section.title)}</a> <span data-section-status="${esc(slug)}:${number}:${esc(section.id)}">Not read yet</span></li>`
        )
        .join("");
      return `<li><a href="lesson-${number}/">Lesson ${number} — ${esc(lesson.title)}</a><span class="meta">${minutes}</span><p class="status" data-status="${esc(slug)}:${number}">Not started</p>${sectionList ? `<ul>${sectionList}</ul>` : ""}</li>`;
    })
    .join("\n");
  const plan = coursePlan(course);
  const planScript = plan ? `<script type="application/json" id="learnhere-plan">${JSON.stringify(plan)}</script>` : "";
  const examNote = `Pass mark ${passLabel} (at least ${needShown} of ${finalCountShown}). ${examMode ? "Opens after every lesson is complete. " : ""}Unlocks the sample certificate.`;

  const courseMain = `<p class="crumbs"><a href="../../">Home</a><a href="../">Courses</a><span>${esc(course.title)}</span></p>
<div class="syllabus-top">
<div>
<h1>${esc(course.title)}</h1>
${intro}
<p class="actions"><a class="btn" data-continue="${esc(slug)}" data-base="" href="lesson-1/">Start lesson 1</a></p>
<p class="progress-line"><span>Your progress</span><span data-pct="${esc(slug)}">0% done</span></p><div class="bar" data-bar="${esc(slug)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Course progress"><span style="width:0%"></span></div>
${syllabusExtras(course, passLabel)}
</div>
${imageTag(course.media, "../../", true)}
</div>
<h2>Lessons</h2>
<ol class="lesson-list">
${lessonItems}
<li><a href="final/">${examMode ? "Final exam" : "Final quiz"}</a><p class="status" data-final-note="${esc(slug)}">${examNote} Pass mark ${passLabel} (at least ${needShown} of ${finalCountShown}). Unlocks the sample certificate. There is no timer.</p></li>
</ol>
<p class="meta">Pass the ${examMode ? "final exam" : "final quiz"} with ${passLabel} or more to open a sample certificate.</p>
${(course.badges || []).length ? `<h2>Milestones</h2><ul class="badge-list">${course.badges.map((badge) => `<li class="badge" data-badge="${esc(badge.id)}" data-label="${esc(badge.label)}" data-when="${esc(badge.when && badge.when.type || "")}" data-when-id="${esc(badge.when && badge.when.id || "")}" data-earned="false">${esc(badge.label)}</li>`).join("")}</ul>` : ""}
${planScript}`;

  write(
    path.join(dir, "index.html"),
    page({
      depth: 2,
      title: branded(course.title),
      description: summary,
      canonical: "courses/" + slug + "/",
      nav: mainNav("../../", "courses/"),
      courseId: slug,
      main: courseMain
    })
  );
  const sheets = [];
  (course.lessons || []).forEach((lesson, index) => {
    (lesson.sections || []).forEach((section) => {
      (section.blocks || []).forEach((block) => {
        if (block.type === "cheatSheet") sheets.push({ lesson: index + 1, title: block.title || lesson.title, items: block.items || [] });
      });
    });
  });
  if (sheets.length) {
    const body = sheets
      .map(
        (sheet) =>
          `<section><h2>Lesson ${sheet.lesson}. ${esc(sheet.title)}</h2><ul>${sheet.items.map((item) => "<li>" + esc(item) + "</li>").join("")}</ul></section>`
      )
      .join("\n");
    write(
      path.join(dir, "cheat-sheet", "index.html"),
      page({
        depth: 3,
        title: branded("Cheat sheet — " + course.title),
        description: "Printable steps for " + course.title + ".",
        canonical: "courses/" + slug + "/cheat-sheet/",
        nav: lessonNav("../../../", "../", navLabel),
        courseId: slug,
        main: `<p class="crumbs"><a href="../../../">Home</a><a href="../">${esc(course.title)}</a><span>Cheat sheet</span></p><h1>Cheat sheet</h1><p>Sample steps only. Use the browser print dialog to save a PDF.</p>${body}<p class="actions no-print"><button type="button" class="btn" onclick="window.print()">Print or save as PDF</button></p>`
      })
    );
  }

  course.lessons.forEach((lesson, index) => {
    const number = index + 1;
    const width = Math.round((number / count) * 100);
    const lessonBody = lesson.sections && lesson.sections.length
      ? sectionedLesson(course, lesson, number)
      : `<div class="prose">${lesson.html || ""}</div>`;
    const lessonMain = `<p class="crumbs"><a href="../../../">Home</a><a href="../../../courses/">Courses</a><a href="../">${esc(course.title)}</a><span class="crumb-here">Lesson ${number}</span></p>
<p class="step-label">Lesson ${number} of ${count}${lesson.minutes ? " · about " + lesson.minutes + " min to read" : ""}</p>
<div class="bar" role="progressbar" aria-valuemin="1" aria-valuemax="${count}" aria-valuenow="${number}" aria-label="Lesson ${number} of ${count}"><span style="width:${width}%"></span></div>
<h1>${esc(lesson.title)}</h1>
${lessonBody}
${sourceList(lesson.sources)}
<div class="actions">
  <a class="btn" href="quiz/">Take the quiz</a>
  <a class="btn btn-secondary" href="../">Back to course</a>
</div>`;
    write(
      path.join(dir, "lesson-" + number, "index.html"),
      page({
        depth: 3,
        title: branded("Lesson " + number + " — " + lesson.title),
        description: lesson.title,
        canonical: "courses/" + slug + "/lesson-" + number + "/",
        nav: lessonNav("../../../", "../", navLabel),
        courseId: slug,
        main: lessonMain
      })
    );

    const last = number === count;
    const quizMain = `<p class="crumbs"><a href="../../../../">Home</a><a href="../../../../courses/">Courses</a><a href="../../">${esc(course.title)}</a><a href="../">Lesson ${number}</a><span>Quiz</span></p>
<p class="step-label">Quiz · Lesson ${number} of ${count}</p>
<h1>${esc(lesson.title)}</h1>
<p>Choose an answer, then check it. Your score stays on this device.</p>
${quizForm({
  course,
  part: "lesson",
  partId: String(number),
  questions: lesson.quiz,
  nextUrl: last ? "../../final/" : "../../lesson-" + (number + 1) + "/",
  nextLabel: last ? (examMode ? "Go to the final exam" : "Go to the final quiz") : "Go to lesson " + (number + 1),
  certUrl: "../../../../certificate/?course=" + encodeURIComponent(slug)
})}
<p class="no-print"><a href="../">Back to the lesson</a></p>`;
    write(
      path.join(dir, "lesson-" + number, "quiz", "index.html"),
      page({
        depth: 4,
        title: branded("Quiz — Lesson " + number),
        description: "Short quiz for lesson " + number + " of " + course.title + ".",
        canonical: "courses/" + slug + "/lesson-" + number + "/quiz/",
        nav: lessonNav("../../../../", "../../", navLabel),
        courseId: slug,
        main: quizMain
      })
    );
  });

  const finalBody = examMode
    ? examPage(course, passLabel, needShown, finalCountShown)
    : `<p>You need at least ${need} out of ${finalCount}. A pass opens a sample certificate on this device.</p>
${quizForm({
  course,
  part: "final",
  partId: "final",
  questions: course.finalQuiz.questions,
  nextUrl: "../",
  nextLabel: "Back to course",
  certUrl: "../../../certificate/?course=" + encodeURIComponent(slug)
})}`;
  const finalMain = `<p class="crumbs"><a href="../../../">Home</a><a href="../../../courses/">Courses</a><a href="../">${esc(course.title)}</a><span class="crumb-here">${examMode ? "Final exam" : "Final quiz"}</span></p>
<p class="step-label">${examMode ? "Final exam" : "Final quiz"} · ${finalCountShown} questions · pass at ${passLabel}</p>
<h1>${examMode ? "Final exam" : "Final quiz"}</h1>
<p>${esc(course.title)}</p>
${finalBody}
<p><a href="../">Back to the course</a></p>
${planScript}`;
  write(
    path.join(dir, "final", "index.html"),
    page({
      depth: 3,
      title: branded((examMode ? "Final exam — " : "Final quiz — ") + course.title),
      description: "Final quiz for " + course.title + ". Pass mark " + passLabel + ".",
      canonical: "courses/" + slug + "/final/",
      nav: lessonNav("../../../", "../", navLabel),
      courseId: slug,
      main: finalMain
    })
  );
}

function lessonMeta(course) {
  const ready = course.lessons.length;
  const exam = course.finalExam && course.finalExam.questions ? course.finalExam.questions.length + "-question final" : "final quiz";
  return ready + " lessons · " + exam + " · certificate at 70%";
}

function homeCard(course) {
  return `<article class="card">
      <h3><a href="courses/${esc(course.slug)}/">${esc(course.title)}</a></h3>
      <p>${esc(course.summary || course.goals || "")}</p>
      <p class="meta">${lessonMeta(course)}</p>
      <a class="btn" data-continue="${esc(course.slug)}" data-resume="progress" data-base="courses/${esc(course.slug)}/" href="courses/${esc(course.slug)}/">Start this course</a>
    </article>`;
}

function catalogueCard(course) {
  const image = imageTag(course.media, "../", false);
  return `<article class="card">
  ${image}
  <h3><a href="${esc(course.slug)}/">${esc(course.title)}</a></h3>
  <p>${esc(course.summary || course.goals || "")}</p>
  <p class="meta">${lessonMeta(course)}</p>
  <p class="progress-line"><span>Your progress</span><span data-pct="${esc(course.slug)}">0% done</span></p><div class="bar" data-bar="${esc(course.slug)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Course progress"><span style="width:0%"></span></div>
  <a class="btn" href="${esc(course.slug)}/">Open course</a>
</article>`;
}

function ensureScript(html, root, file) {
  if (html.includes(root + file)) return html;
  const tag = '<script src="' + root + file + '"></script>';
  const catalogue = '<script src="' + root + 'catalogue.js"></script>';
  if (html.includes(catalogue)) return html.replace(catalogue, tag + "\n  " + catalogue);
  const site = '<script src="' + root + 'site.js"></script>';
  if (html.includes(site)) return html.replace(site, tag + "\n  " + site);
  return html;
}

function ensureDataScripts(html, root) {
  let out = html;
  ["brand.js", "billing.js", "data.js", "report-fields.js", "player-blocks.js"].forEach((file) => {
    out = ensureScript(out, root, file);
  });
  return out;
}

function previousBrandNames() {
  const names = [];
  const indexPath = path.join(demoRoot, "index.html");
  if (fs.existsSync(indexPath)) {
    const match = fs.readFileSync(indexPath, "utf8").match(/name="application-name" content="([^"]*)"/);
    if (match && match[1] && match[1] !== brand.name) names.push(match[1]);
  }
  if (brand.name !== "Range Path") names.push("Range Path");
  return names;
}

function rewriteBrandText(text, names) {
  let out = text;
  names.forEach((name) => {
    if (name && name !== brand.name) out = out.split(name).join(brand.name);
  });
  return out;
}

function rewriteBrandFiles() {
  const names = previousBrandNames();
  if (!names.length) return;
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === "practice" || entry.name === "node_modules") return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        return;
      }
      if (!/\.(html|js|mjs|json|md|css)$/.test(entry.name)) return;
      if (full.endsWith(path.join("data", "brand.json")) || full.endsWith("build-pages.mjs") || full.endsWith(path.join("assets", "brand.js"))) return;
      const text = fs.readFileSync(full, "utf8");
      const next = rewriteBrandText(text, names);
      if (next !== text) fs.writeFileSync(full, next);
    });
  }
  walk(demoRoot);
}

function stampBrand(html) {
  let out = html.split(brand.name + " (a Range Road Tech product)").join(brand.name + " (" + brand.domain + "), a Range Road Tech product");
  const application = `<meta name="application-name" content="${esc(brand.name)}">`;
  if (out.includes('name="application-name"')) {
    out = out.replace(/<meta name="application-name" content="[^"]*">/, application);
  } else {
    out = out.replace("<head>", "<head>\n  " + application);
  }
  const siteName = `<meta property="og:site_name" content="${esc(brand.name)}">`;
  if (out.includes('property="og:site_name"')) {
    out = out.replace(/<meta property="og:site_name" content="[^"]*">/, siteName);
  } else {
    out = out.replace('<meta property="og:title"', siteName + "\n  " + '<meta property="og:title"');
  }
  return out;
}

function stampBrandFiles() {
  function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
      if (entry.name === "practice" || entry.name === "node_modules") return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".html")) {
        const text = fs.readFileSync(full, "utf8");
        const next = stampBrand(text);
        if (next !== text) fs.writeFileSync(full, next);
      }
    });
  }
  walk(demoRoot);
}

function main() {
  rewriteBrandFiles();
  const seed = readJson(path.join(demoRoot, "data", "demo-store.json"));
  const reportFields = readJson(path.join(demoRoot, "data", "report-fields.json"));
  write(
    path.join(demoRoot, "assets", "brand.js"),
    "/* Generated by tools/build-pages.mjs from data/brand.json. Do not edit by hand. */\nwindow.COURSE_BRAND = " +
      JSON.stringify({ name: brand.name, domain: brand.domain }) +
      ";\n"
  );
  write(
    path.join(demoRoot, "assets", "report-fields.js"),
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.LEARNHERE_REPORT_FIELDS = " +
      JSON.stringify(reportFields) +
      ";\n"
  );
  write(
    path.join(demoRoot, "assets", "demo-seed.js"),
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.LEARNHERE_SEED = " +
      JSON.stringify(seed) +
      ";\n"
  );

  const registry = readJson(path.join(demoRoot, "data", "registry.json"));
  const passMark = typeof registry.passMark === "number" ? registry.passMark : 0.7;
  const courses = registry.courses.map((entry) => {
    const file = path.join(demoRoot, "data", "courses", entry.slug + ".json");
    if (!fs.existsSync(file)) throw new Error("Missing course file for " + entry.slug);
    const course = readJson(file);
    if (course.slug !== entry.slug) throw new Error("Slug mismatch in " + file);
    return { entry, course };
  });

  const catalogue = {
    passMark,
    courses: courses.map(({ entry, course }) => ({
      id: course.slug,
      title: course.title,
      shortTitle: entry.shortTitle || course.title,
      navLabel: entry.navLabel || entry.shortTitle || course.title,
      lessons: course.lessons.length,
      featured: entry.featured !== false && !entry.extra,
      extra: Boolean(entry.extra),
      certificateNote: course.certificateNote || "",
      plan: coursePlan(course)
    }))
  };
  write(
    path.join(demoRoot, "assets", "catalogue.js"),
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.LEARNHERE = " +
      JSON.stringify(catalogue, null, 2) +
      ";\n"
  );

  const known = new Set(courses.map(({ course }) => course.slug));
  const coursesDir = path.join(demoRoot, "courses");
  fs.readdirSync(coursesDir, { withFileTypes: true }).forEach((entry) => {
    if (entry.isDirectory() && !known.has(entry.name)) {
      fs.rmSync(path.join(coursesDir, entry.name), { recursive: true, force: true });
    }
  });
  courses.forEach(({ entry, course }) => buildCoursePages(course, entry, passMark));

  const featured = courses.filter(({ entry }) => entry.featured !== false && !entry.extra);
  const mainCourses = courses.filter(({ entry }) => !entry.extra);
  const extras = courses.filter(({ entry }) => entry.extra);

  const homeFile = path.join(demoRoot, "index.html");
  let home = fs.readFileSync(homeFile, "utf8");
  home = replaceMarked(home, "home-courses", featured.map(({ course }) => homeCard(course)).join("\n"));
  if (!home.includes('src="assets/catalogue.js"')) {
    home = home.replace('<script src="assets/site.js"></script>', '<script src="assets/catalogue.js"></script>\n  <script src="assets/site.js"></script>');
  }
  home = ensureDataScripts(home, "assets/");
  fs.writeFileSync(homeFile, home);

  const catalogueFile = path.join(demoRoot, "courses", "index.html");
  let catalogueHtml = fs.readFileSync(catalogueFile, "utf8");
  catalogueHtml = replaceMarked(catalogueHtml, "catalogue", mainCourses.map(({ course }) => catalogueCard(course)).join("\n"));
  const extraHtml = extras.length
    ? `<h2 class="section">Demo extra</h2>
<p>Still in this demo, after the main courses. Not featured on the home page.</p>
<div class="cards cols-3">
${extras.map(({ course }) => catalogueCard(course)).join("\n")}
</div>`
    : "";
  catalogueHtml = replaceMarked(catalogueHtml, "catalogue-extra", extraHtml);
  if (!catalogueHtml.includes('src="../assets/catalogue.js"')) {
    catalogueHtml = catalogueHtml.replace(
      '<script src="../assets/site.js"></script>',
      '<script src="../assets/catalogue.js"></script>\n  <script src="../assets/site.js"></script>'
    );
  }
  catalogueHtml = ensureDataScripts(catalogueHtml, "../assets/");
  fs.writeFileSync(catalogueFile, catalogueHtml);

  const certFile = path.join(demoRoot, "certificate", "index.html");
  let cert = fs.readFileSync(certFile, "utf8");
  const links = courses
    .filter(({ entry }) => entry.featured !== false && !entry.extra)
    .map(
      ({ course }) =>
        `<li><a href="../courses/${esc(course.slug)}/final/">${esc(course.title)} final quiz</a></li>`
    )
    .join("\n");
  const options = courses
    .map(
      ({ course }) =>
        `<option value="${esc(course.slug)}" data-note="${esc(course.certificateNote || "")}">${esc(course.title)}</option>`
    )
    .join("\n");
  cert = replaceMarked(cert, "cert-links", links);
  cert = replaceMarked(cert, "cert-options", options);
  if (!cert.includes('src="../assets/catalogue.js"')) {
    cert = cert.replace(
      '<script src="../assets/site.js"></script>',
      '<script src="../assets/catalogue.js"></script>\n  <script src="../assets/site.js"></script>'
    );
  }
  cert = ensureDataScripts(cert, "../assets/");
  fs.writeFileSync(certFile, cert);

  ["admin", "pricing", "privacy", "walkthrough"].forEach((folder) => {
    const file = path.join(demoRoot, folder, "index.html");
    let html = fs.readFileSync(file, "utf8");
    if (!html.includes('src="../assets/catalogue.js"')) {
      html = html.replace(
        '<script src="../assets/site.js"></script>',
        '<script src="../assets/catalogue.js"></script>\n  <script src="../assets/site.js"></script>'
      );
    }
    html = ensureDataScripts(html, "../assets/");
    fs.writeFileSync(file, html);
  });

  stampBrandFiles();
  console.log("Built " + courses.length + " courses.");
}

main();
