#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function splitExample(html) {
  const paras = [];
  const steps = [];
  const re = /<p>([\s\S]*?)<\/p>|<ul>([\s\S]*?)<\/ul>|<ol>([\s\S]*?)<\/ol>/g;
  let match;
  while ((match = re.exec(html))) {
    if (match[1] != null) paras.push(match[1]);
    if (match[2] || match[3]) {
      String(match[2] || match[3]).replace(/<li>([\s\S]*?)<\/li>/g, (_, item) => {
        steps.push(item);
        return "";
      });
    }
  }
  if (!paras.length && !steps.length) return { problem: html, steps: [], result: "" };
  if (steps.length) return { problem: paras[0] || "", steps, result: paras.slice(1).join(" ") };
  if (paras.length === 1) return { problem: paras[0], steps: [], result: paras[0] };
  return { problem: paras[0], steps: paras.slice(1, -1), result: paras[paras.length - 1] };
}

function firstSection(lesson) {
  return (lesson.sections || []).find((section) => !/optional discussion/i.test(section.title || "")) || lesson.sections[0];
}

const excelLesson = [1, 1, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6, 6, 7, 7, 7, 8, 8, 8, 9, 9, 10, 10];

function reviewFor(course, question, index) {
  let lessonNumber = 0;
  const named = String(question.explain || "").match(/Lesson\s+(\d+)/i);
  if (named) lessonNumber = Number(named[1]);
  else if (course.slug === "excel-basics-canada") lessonNumber = excelLesson[index] || 1;
  else lessonNumber = Math.min(10, Math.floor(index / 3) + 1);
  const lesson = course.lessons[lessonNumber - 1] || course.lessons[0];
  const section = firstSection(lesson);
  return {
    topic: "Lesson " + lesson.number + " — " + (section ? section.title : lesson.title),
    review: "../lesson-" + lesson.number + "/#section-" + (section ? section.id : "")
  };
}

for (const slug of ["excel-basics-canada", "everyday-computers-smartphones"]) {
  const file = path.join(root, "data", "courses", slug + ".json");
  const course = JSON.parse(fs.readFileSync(file, "utf8"));
  course.lessons.forEach((lesson) => {
    lesson.sections.forEach((section) => {
      if (!/worked example/i.test(section.title || "")) return;
      const example = (section.blocks || []).find((block) => block.type === "workedExample");
      const prose = (section.blocks || []).filter((block) => block.type === "prose").map((block) => block.html).join("");
      if (!example) return;
      const parsed = splitExample(prose.replace(/<p><strong>Progress:<\/strong>[\s\S]*?<\/p>/g, ""));
      example.problem = parsed.problem;
      example.steps = parsed.steps;
      example.result = parsed.result;
      example.html = "";
      section.blocks = [example].concat((section.blocks || []).filter((block) => block.type !== "prose" && block !== example));
    });
    lesson.sections.forEach((section) => {
      (section.blocks || []).forEach((block) => {
        if (block.html) block.html = block.html.replace(/<p><strong>Progress:<\/strong>[\s\S]*?<\/p>/g, "");
      });
    });
  });
  course.finalExam.questions.forEach((question, index) => {
    const review = reviewFor(course, question, index);
    question.topic = review.topic;
    question.review = review.review;
  });
  fs.writeFileSync(file, JSON.stringify(course, null, 2) + "\n");
  console.log(slug, "examples", course.lessons.reduce((n, lesson) => n + lesson.sections.filter((s) => /worked example/i.test(s.title)).length, 0));
}

const storePath = path.join(root, "data", "demo-store.json");
const store = JSON.parse(fs.readFileSync(storePath, "utf8"));
const deep = new Set(["excel-basics-canada", "everyday-computers-smartphones"]);
store.enrollments.forEach((row) => {
  if (!deep.has(row.courseId)) return;
  const wasComplete = row.lessonsTotal && row.lessonsCompletedCount >= row.lessonsTotal;
  row.lessonsTotal = 10;
  if (wasComplete || row.status === "completed") row.lessonsCompletedCount = 10;
});
fs.writeFileSync(storePath, JSON.stringify(store, null, 2) + "\n");
console.log("seed lessons updated");
