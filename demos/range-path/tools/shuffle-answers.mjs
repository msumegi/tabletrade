#!/usr/bin/env node
/* Spread correct answers across A–D. Stable for a given question. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const SLUGS = fs.readdirSync(path.join(root, "data", "courses")).filter((name) => name.endsWith(".json")).map((name) => name.replace(/\.json$/, ""));

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(list, seed) {
  const out = list.slice();
  const rand = rng(seed);
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    const swap = out[i];
    out[i] = out[j];
    out[j] = swap;
  }
  return out;
}

function place(question, target, seed) {
  const choices = question.choices || [];
  if (choices.length < 2 || !/^[A-F]$/.test(question.answer || "")) return;
  const correct = choices.find((choice) => choice.id === question.answer) || choices[0];
  const rest = shuffle(choices.filter((choice) => choice !== correct), seed);
  const next = [];
  let r = 0;
  for (let i = 0; i < choices.length; i += 1) {
    next.push(i === target ? correct : rest[r++]);
  }
  question.choices = next.map((choice, index) => Object.assign({}, choice, { id: LETTERS[index] }));
  question.answer = LETTERS[target];
}

function shuffleBinary(question, seed) {
  if (!/^[TF]$/.test(question.answer || "")) return;
  const choices = question.choices || [];
  if (choices.length !== 2) return;
  question.choices = rng(seed)() < 0.5 ? choices.slice() : choices.slice().reverse();
}

function spread(questions, seedKey) {
  const counts = [0, 0, 0, 0];
  questions.forEach((question, index) => {
    const width = Math.min(4, (question.choices || []).length);
    if (width < 2 || !/^[A-F]$/.test(question.answer || "")) return;
    const seed = hash(seedKey + ":" + index + ":" + (question.prompt || ""));
    const order = shuffle([...Array(width).keys()], seed);
    const min = Math.min(...order.map((slot) => counts[slot]));
    const best = order.find((slot) => counts[slot] === min);
    counts[best] += 1;
    place(question, best, seed);
  });
}

for (const slug of SLUGS) {
  const file = path.join(root, "data", "courses", slug + ".json");
  const course = JSON.parse(fs.readFileSync(file, "utf8"));
  if (course.finalExam && course.finalExam.questions) spread(course.finalExam.questions, slug + ":final");
  if (course.finalQuiz && course.finalQuiz.questions) {
    course.finalQuiz.questions.forEach((question, index) => shuffleBinary(question, hash(slug + ":final-quiz:" + index)));
    spread(course.finalQuiz.questions, slug + ":final-quiz");
  }
  (course.lessons || []).forEach((lesson) => {
    (lesson.quiz || []).forEach((question, index) => shuffleBinary(question, hash(slug + ":lesson:" + lesson.number + ":" + index)));
    if (lesson.quiz) spread(lesson.quiz, slug + ":lesson:" + lesson.number);
  });
  fs.writeFileSync(file, JSON.stringify(course, null, 2) + "\n");
}
