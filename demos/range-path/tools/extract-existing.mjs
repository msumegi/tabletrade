#!/usr/bin/env node
/**
 * One-time helper: read the original hand-built course HTML and write
 * data/courses/<slug>.json in the same shape as tools/md-to-course.mjs.
 * Run it only if you still have the original HTML. After build-pages.mjs,
 * the JSON files are the source.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const coursesDir = path.join(demoRoot, "courses");

const CERTIFICATE_NOTE =
  "It is not a college diploma, degree, trade ticket, professional licence, or immigration, legal, tax, or financial advice.";

const EXISTING = {
  "email-online-safety": CERTIFICATE_NOTE,
  "sin-cra-getting-paid": CERTIFICATE_NOTE,
  "winter-safety-rural-alberta": CERTIFICATE_NOTE
};

function decode(value) {
  return String(value)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function textOf(html) {
  return decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function attr(tag, name) {
  const match = tag.match(new RegExp("\\s" + name + '="([^"]*)"', "i"));
  return match ? decode(match[1]) : "";
}

function stripPrefix(url) {
  return url.replace(/^(?:\.\.\/)+/, "");
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function parseQuiz(html) {
  const questions = [];
  const chunks = html.split(/<li class="q"/).slice(1);
  chunks.forEach((chunk) => {
    const answer = (chunk.match(/^\s*data-answer="([^"]+)"/) || [])[1] || "";
    const legend = (chunk.match(/<legend>([\s\S]*?)<\/legend>/) || [])[1] || "";
    const choices = [];
    const choiceRe = /<input[^>]*value="([^"]+)"[^>]*>\s*<span>([\s\S]*?)<\/span>/g;
    let match;
    while ((match = choiceRe.exec(chunk))) {
      choices.push({ id: match[1], text: textOf(match[2]) });
    }
    const explain = (chunk.match(/<p class="explain"[^>]*>([\s\S]*?)<\/p>/) || [])[1] || "";
    questions.push({
      prompt: textOf(legend),
      choices,
      answer,
      explain: textOf(explain)
    });
  });
  return questions;
}

function extractCourse(slug) {
  const dir = path.join(coursesDir, slug);
  const index = read(path.join(dir, "index.html"));
  const title = textOf((index.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "");
  const lede = (index.match(/<p class="lede">([\s\S]*?)<\/p>/) || [])[1] || "";
  const summary = textOf(lede);
  const afterLede = index.split("</h1>")[1].split('class="progress-line"')[0];
  const paragraphs = [];
  const paraRe = /<p\b([^>]*)>([\s\S]*?)<\/p>/g;
  let para;
  while ((para = paraRe.exec(afterLede))) {
    paragraphs.push("<p" + para[1] + ">" + para[2].trim() + "</p>");
  }
  let media = null;
  const frame = index.match(/<div class="(frame[^"]*)">\s*(<img\b[^>]*>)/);
  if (frame) {
    const img = frame[2];
    const src = stripPrefix(attr(img, "src"));
    const srcset = attr(img, "srcset")
      .split(",")
      .map((part) => {
        const bits = part.trim().split(/\s+/);
        bits[0] = stripPrefix(bits[0]);
        return bits.join(" ");
      })
      .join(", ");
    media = {
      frameClass: frame[1],
      src,
      srcset,
      sizes: attr(img, "sizes"),
      width: Number(attr(img, "width")) || 0,
      height: Number(attr(img, "height")) || 0,
      alt: attr(img, "alt")
    };
  }

  const lessons = [];
  for (let number = 1; number <= 20; number += 1) {
    const lessonFile = path.join(dir, "lesson-" + number, "index.html");
    if (!fs.existsSync(lessonFile)) break;
    const lessonHtml = read(lessonFile);
    const lessonTitle = textOf((lessonHtml.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "");
    const prose = (lessonHtml.match(/<div class="prose">([\s\S]*?)<\/div>/) || [])[1] || "";
    const sources = [];
    const sourceBlock = (lessonHtml.match(/<ul class="sources">([\s\S]*?)<\/ul>/) || [])[1] || "";
    const linkRe = /<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
    let link;
    while ((link = linkRe.exec(sourceBlock))) {
      sources.push({ label: textOf(link[2].replace(/<span>[\s\S]*?<\/span>/g, "")), url: decode(link[1]) });
    }
    const quizFile = path.join(dir, "lesson-" + number, "quiz", "index.html");
    const quiz = fs.existsSync(quizFile) ? parseQuiz(read(quizFile)) : [];
    if (!prose.trim()) throw new Error(slug + " lesson " + number + " has no prose.");
    if (!quiz.length) throw new Error(slug + " lesson " + number + " has no quiz.");
    lessons.push({
      number,
      title: lessonTitle,
      html: prose.trim(),
      sources,
      quiz
    });
  }

  const finalHtml = read(path.join(dir, "final", "index.html"));
  const finalQuiz = { explain: "", questions: parseQuiz(finalHtml) };
  if (!finalQuiz.questions.length) throw new Error(slug + " final quiz is empty.");

  return {
    slug,
    title,
    summary,
    goals: summary,
    introHtml: paragraphs.join("\n"),
    certificateNote: EXISTING[slug],
    media,
    lessons,
    finalQuiz
  };
}

const slugs = Object.keys(EXISTING);
const outDir = path.join(demoRoot, "data", "courses");
fs.mkdirSync(outDir, { recursive: true });
slugs.forEach((slug) => {
  const course = extractCourse(slug);
  const outFile = path.join(outDir, slug + ".json");
  fs.writeFileSync(outFile, JSON.stringify(course, null, 2) + "\n");
  const questions = course.lessons.reduce((sum, lesson) => sum + lesson.quiz.length, 0);
  console.log(
    slug +
      ": " +
      course.lessons.length +
      " lessons, " +
      questions +
      " lesson questions, " +
      course.finalQuiz.questions.length +
      " final questions."
  );
});
