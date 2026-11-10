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
  <meta name="description" content="${esc(description)}">
  <title>${esc(title)}</title>
  <link rel="canonical" href="${esc(canonicalUrl)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(canonicalUrl)}">
  <meta property="og:image" content="${SITE}og.jpg">
  <meta property="og:image:alt" content="Range Path — a grain terminal on the prairie in Edson, Alberta">
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
        <span class="brand-text"><span class="brand-name">Range Path</span><span class="brand-sub">Practical skills for rural adult learners</span></span>
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
      <p class="credit"><a href="https://rangeroadtech.com/" target="_blank" rel="noopener noreferrer">A Range Road Tech product</a> · <a href="${root}privacy/">Privacy</a></p>
    </div>
  </footer>
  <script src="${root}assets/demo-seed.js"></script>
  <script src="${root}assets/data.js"></script>
  <script src="${root}assets/catalogue.js"></script>
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
    ["admin/", "Staff demo"]
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
  return `<ul><li><a href="${root}courses/">Courses</a></li><li><a href="${courseHref}" aria-current="page">${esc(label)}</a></li><li><a href="${root}privacy/">Privacy</a></li></ul>`;
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
    lessons: course.lessons.map((lesson, index) => ({
      n: index + 1,
      title: lesson.title,
      sections: (lesson.sections || []).map((section) => section.id),
      assignment: lesson.assignment ? lesson.assignment.id || "lesson-" + (index + 1) + "-task" : "",
      quiz: Boolean(lesson.quiz && lesson.quiz.length)
    }))
  };
}

function sectionNav(sections) {
  const total = sections.reduce((sum, section) => sum + (section.minutes || 0), 0);
  const items = sections
    .map(
      (section) =>
        `<li><a href="#section-${esc(section.id)}">${esc(section.title)}</a> <span class="meta">${section.minutes || 0} min</span></li>`
    )
    .join("");
  return `<details class="section-nav">
  <summary>Sections in this lesson${total ? " · about " + total + " min" : ""}</summary>
  <ol>${items}</ol>
</details>`;
}

function filesBlock(files) {
  if (!files || !files.length) return "";
  const items = files
    .map((file) => {
      const label = file.solved ? "Solved sample" : "Starter file";
      return `<li><a class="btn" href="${esc(file.href)}" download>${esc(label)}: ${esc(file.name)}</a> <span class="meta">${esc(file.kind || "File")} · ${formatBytes(file.bytes || 0)}</span></li>`;
    })
    .join("");
  return `<h2>Practice files</h2>
<p>Download a file and open it in Excel. A solved file is a sample to compare with your work. It is not a mark.</p>
<ul class="file-list">${items}</ul>`;
}

function sectionedLesson(course, lesson, number) {
  const sections = lesson.sections
    .map((section, index) => {
      const blocks = section.blocks && section.blocks.length ? section.blocks : [{ type: "prose", html: section.html || "" }];
      const rendered = renderBlocks(blocks, { lessonNumber: number });
      rendered.unknown.forEach((type) => {
        console.warn(course.slug + " lesson " + number + ": no renderer for block type " + type);
      });
      const prev = index > 0 ? lesson.sections[index - 1] : null;
      const next = lesson.sections[index + 1];
      return `<section class="lesson-section longform" id="section-${esc(section.id)}">
  <h2>${esc(section.title)}</h2>
  <p class="meta">About ${section.minutes || 0} min</p>
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
  return `${sectionNav(lesson.sections)}
<p>This lesson is split into short sections. Read a section, mark it as read, then go to the next one. Your place is saved on this device.</p>
${sections}
${filesBlock(lesson.files)}
${assignment}`;
}

function syllabusExtras(course, passLabel) {
  if (!course.player) return "";
  const outcomes = (course.player.outcomes || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  const need = (course.player.youNeed || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  const minutes = course.player.estimatedMinutes || 0;
  const hours = minutes ? Math.round((minutes / 60) * 10) / 10 : 0;
  const attempts = course.finalExam ? course.finalExam.attemptLimit || 2 : 0;
  return `<section class="syllabus">
  <h2>Syllabus</h2>
  <p>This page is the course outline. It shows how long to allow, what you will practise, and how the final exam works. Start at lesson 1, or continue where you left off.</p>
  ${hours ? `<p><strong>About ${hours} hours</strong> (${minutes} minutes) of reading and practice.</p>` : ""}
  ${outcomes ? `<h3>Learning outcomes</h3><ul class="check">${outcomes}</ul>` : ""}
  ${need ? `<h3>What you need</h3><ul class="check">${need}</ul>` : ""}
  <h3>Final exam and certificate</h3>
  <p>Finish every section, lesson quiz, and practice task. Then take the final exam. The pass mark is ${passLabel}. This course allows ${attempts} attempt${attempts === 1 ? "" : "s"}. The sample certificate stays locked until you pass. If every attempt is used, council staff can reset them from the staff demo. The certificate confirms completion only and is not an accredited credential.</p>
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
      return `<fieldset class="q"><legend>${esc(question.prompt)}</legend>${choices}</fieldset>`;
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
  <p>This is the final exam. It stays closed until every section, lesson quiz, and practice task is done. The pass mark is ${passLabel} (at least ${need} of ${total}). The sample certificate stays locked until you pass.</p>
  <ul data-exam-remaining></ul>
  <p><a class="btn" href="../">Back to the syllabus</a></p>
</div>
<div id="exam-open" hidden>
  <p>Answer every question, then submit. Correct answers stay hidden. After you submit, you will see your score and which topics to review. This exam allows ${attemptLimit} attempts. Your score stays on this device.</p>
  <form data-exam data-course="${esc(course.slug)}" data-pass="${course.finalExam.passMark || 0.7}" data-attempts="${attemptLimit}">
    ${fields}
    <p class="actions"><button type="submit" class="btn">Submit exam</button></p>
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
  const finalCount = course.finalQuiz.questions.length;
  const need = neededCorrect(finalCount, passMark);
  const passLabel = Math.round(passMark * 100) + "%";
  const navLabel = entry.navLabel || entry.shortTitle || course.title;
  const summary = course.summary || course.goals || "";
  const intro = course.introHtml
    ? course.introHtml
    : `<p class="lede">${esc(summary)}</p>${course.goals && course.goals !== summary ? "\n<p>" + esc(course.goals) + "</p>" : ""}`;

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
  const planScript = plan ? `<script type="application/json" id="rangepath-plan">${JSON.stringify(plan)}</script>` : "";

  const courseMain = `<p class="crumbs"><a href="../../">Home</a><a href="../">Courses</a><span>${esc(course.title)}</span></p>
${imageTag(course.media, "../../", true)}
<h1>${esc(course.title)}</h1>
${intro}
${syllabusExtras(course, passLabel)}
<p class="progress-line"><span>Your progress</span><span data-pct="${esc(slug)}">0% done</span></p><div class="bar" data-bar="${esc(slug)}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" aria-label="Course progress"><span style="width:0%"></span></div>
<p class="actions"><a class="btn" data-continue="${esc(slug)}" data-base="" href="lesson-1/">Start lesson 1</a></p>
<h2>Lessons</h2>
<ol class="lesson-list">
${lessonItems}
<li><a href="final/">${examMode ? "Final exam" : "Final quiz"}</a><p class="status" data-final-note="${esc(slug)}">Pass mark ${passLabel} (at least ${needShown} of ${finalCountShown}). ${examMode ? "Opens after every lesson is complete. " : ""}Unlocks the sample certificate.</p></li>
</ol>
<p class="meta">Pass the ${examMode ? "final exam" : "final quiz"} with ${passLabel} or more to open a sample certificate.</p>
${planScript}`;

  write(
    path.join(dir, "index.html"),
    page({
      depth: 2,
      title: course.title + " · Range Path",
      description: summary,
      canonical: "courses/" + slug + "/",
      nav: mainNav("../../", "courses/"),
      courseId: slug,
      main: courseMain
    })
  );

  course.lessons.forEach((lesson, index) => {
    const number = index + 1;
    const width = Math.round((number / count) * 100);
    const lessonBody = lesson.sections && lesson.sections.length
      ? sectionedLesson(course, lesson, number)
      : `<div class="prose">${lesson.html || ""}</div>`;
    const lessonMain = `<p class="crumbs"><a href="../../../">Home</a><a href="../../../courses/">Courses</a><a href="../">${esc(course.title)}</a><span class="crumb-here">Lesson ${number}</span></p>
<p class="step-label">Lesson ${number} of ${count}${lesson.minutes ? " · about " + lesson.minutes + " min" : ""}</p>
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
        title: "Lesson " + number + " — " + lesson.title + " · Range Path",
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
        title: "Quiz — Lesson " + number + " · Range Path",
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
      title: "Final quiz — " + course.title + " · Range Path",
      description: "Final quiz for " + course.title + ". Pass mark " + passLabel + ".",
      canonical: "courses/" + slug + "/final/",
      nav: lessonNav("../../../", "../", navLabel),
      courseId: slug,
      main: finalMain
    })
  );
}

function homeCard(course) {
  const count = course.lessons.length;
  return `<article class="card">
      <h3><a href="courses/${esc(course.slug)}/">${esc(course.title)}</a></h3>
      <p>${esc(course.summary || course.goals || "")}</p>
      <p class="meta">${count} lessons · final quiz · certificate at 70%</p>
      <a class="btn" data-continue="${esc(course.slug)}" data-resume="progress" data-base="courses/${esc(course.slug)}/" href="courses/${esc(course.slug)}/">Preview this course</a>
    </article>`;
}

function catalogueCard(course) {
  const count = course.lessons.length;
  const image = imageTag(course.media, "../", false);
  return `<article class="card">
  ${image}
  <h3><a href="${esc(course.slug)}/">${esc(course.title)}</a></h3>
  <p>${esc(course.summary || course.goals || "")}</p>
  <p class="meta">${count} short lessons</p>
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
  ["demo-seed.js", "data.js", "report-fields.js"].forEach((file) => {
    out = ensureScript(out, root, file);
  });
  return out;
}

function main() {
  const seed = readJson(path.join(demoRoot, "data", "demo-store.json"));
  const reportFields = readJson(path.join(demoRoot, "data", "report-fields.json"));
  write(
    path.join(demoRoot, "assets", "report-fields.js"),
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.RANGE_PATH_REPORT_FIELDS = " +
      JSON.stringify(reportFields) +
      ";\n"
  );
  write(
    path.join(demoRoot, "assets", "demo-seed.js"),
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.RANGE_PATH_SEED = " +
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
    "/* Generated by tools/build-pages.mjs. Do not edit by hand. */\nwindow.RANGE_PATH = " +
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

  console.log("Built " + courses.length + " courses.");
}

main();
