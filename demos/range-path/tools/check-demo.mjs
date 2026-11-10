#!/usr/bin/env node
/** Check the built LearnHere demo: links, quizzes, disclaimer, noindex. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DISCLAIMER =
  "This course is general information for adult learners in Canada. It is not legal, tax, financial, medical, driving-instruction, or immigration advice. Always check official pages on Canada.ca, Alberta.ca, or your council staff for your situation.";
const SHORT = "Demo. Sample data. Not accredited.";
const errors = [];

function walk(dir, files = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === "node_modules") return;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  });
  return files;
}

function rel(file) {
  return path.relative(root, file);
}

const htmlFiles = walk(root).filter((file) => file.endsWith(".html"));
const registry = JSON.parse(fs.readFileSync(path.join(root, "data", "registry.json"), "utf8"));

htmlFiles.forEach((file) => {
  const html = fs.readFileSync(file, "utf8");
  const name = rel(file);
  if (!html.includes('content="noindex, nofollow"') && !html.includes("content='noindex, nofollow'")) {
    errors.push(name + " is missing noindex");
  }
  if (/Adult Learning Subscription/i.test(html)) errors.push(name + " says Adult Learning Subscription");
  if (/coming soon/i.test(html)) errors.push(name + " says coming soon");
  if (/Later, not in this demo/.test(html)) errors.push(name + " still has a Later label");
  const longCount = html.split(DISCLAIMER).length - 1;
  const shortCount = html.split(SHORT).length - 1;
  const learning = name.startsWith("courses") || name.startsWith("certificate");
  if (learning) {
    if (longCount !== 1) errors.push(name + " has the learning disclaimer " + longCount + " times");
    if (shortCount) errors.push(name + " also has the short disclaimer");
  } else if (longCount + shortCount !== 1) {
    errors.push(name + " should have one disclaimer (long " + longCount + ", short " + shortCount + ")");
  }
  const hrefs = html.match(/href="([^"]+)"/g) || [];
  hrefs.forEach((raw) => {
    const href = raw.slice(6, -1);
    if (!href || href.startsWith("#") || href.startsWith("https://") || href.startsWith("http://") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    const clean = href.split("#")[0].split("?")[0];
    if (!clean) return;
    const target = path.normalize(path.join(path.dirname(file), clean));
    const asFile = target.endsWith(path.sep) || !path.extname(target) ? path.join(target, "index.html") : target;
    if (!asFile.startsWith(root)) {
      errors.push(name + " links outside the demo: " + href);
      return;
    }
    if (!fs.existsSync(asFile)) errors.push(name + " broken link " + href);
  });
});

registry.courses.forEach((entry) => {
  const file = path.join(root, "data", "courses", entry.slug + ".json");
  if (!fs.existsSync(file)) {
    errors.push("Missing data for " + entry.slug);
    return;
  }
  const course = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!fs.existsSync(path.join(root, "courses", entry.slug, "index.html"))) {
    errors.push("Missing course page " + entry.slug);
  }
  course.lessons.forEach((lesson, index) => {
    const number = index + 1;
    const lessonPage = path.join(root, "courses", entry.slug, "lesson-" + number, "index.html");
    const quizPage = path.join(root, "courses", entry.slug, "lesson-" + number, "quiz", "index.html");
    if (!fs.existsSync(lessonPage)) errors.push(entry.slug + " missing lesson " + number);
    if (!fs.existsSync(quizPage)) errors.push(entry.slug + " missing quiz " + number);
    if (!lesson.quiz || !lesson.quiz.length) errors.push(entry.slug + " lesson " + number + " has no questions");
    (lesson.quiz || []).forEach((question, qIndex) => {
      const ids = (question.choices || []).map((choice) => choice.id);
      if (ids.indexOf(question.answer) === -1) {
        errors.push(entry.slug + " lesson " + number + " Q" + (qIndex + 1) + " has a bad answer");
      }
      if (question.generated) {
        errors.push(entry.slug + " lesson " + number + " Q" + (qIndex + 1) + " was generated because the source had no quiz");
      }
    });
  });
  const finals = course.finalQuiz && course.finalQuiz.questions ? course.finalQuiz.questions : [];
  if (finals.length < 1) errors.push(entry.slug + " has no final quiz");
  finals.forEach((question, index) => {
    const ids = question.choices.map((choice) => choice.id);
    if (ids.indexOf(question.answer) === -1) errors.push(entry.slug + " final Q" + (index + 1) + " has a bad answer");
  });
  const finalPage = path.join(root, "courses", entry.slug, "final", "index.html");
  if (!fs.existsSync(finalPage)) errors.push(entry.slug + " missing final page");
});

const home = fs.readFileSync(path.join(root, "index.html"), "utf8");
registry.courses.forEach((entry) => {
  const linked = home.includes("courses/" + entry.slug + "/");
  if (entry.extra && linked) errors.push("Home features extra course " + entry.slug);
  if (!entry.extra && entry.featured !== false && !linked) errors.push("Home is missing " + entry.slug);
});

if (!fs.existsSync(path.join(root, "assets", "catalogue.js"))) errors.push("Missing assets/catalogue.js");
if (!fs.existsSync(path.join(root, "assets", "data.js"))) errors.push("Missing assets/data.js");
if (!fs.existsSync(path.join(root, "data", "demo-store.json"))) errors.push("Missing data/demo-store.json");
if (!fs.existsSync(path.join(root, "data", "report-fields.json"))) errors.push("Missing data/report-fields.json");

walk(path.join(root, "assets"))
  .filter((file) => file.endsWith(".js") && path.basename(file) !== "data.js")
  .forEach((file) => {
    const source = fs.readFileSync(file, "utf8");
    if (source.includes("localStorage")) errors.push(path.relative(root, file) + " touches localStorage");
  });

if (errors.length) {
  errors.forEach((error) => console.error(error));
  process.exit(1);
}
console.log("Checked " + htmlFiles.length + " pages and " + registry.courses.length + " courses.");
