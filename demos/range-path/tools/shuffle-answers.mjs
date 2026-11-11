#!/usr/bin/env node
/* Spread correct answers across A–D. Stable for a given question. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LETTERS = ["A", "B", "C", "D", "E", "F"];
const SLUGS = [
  "excel-basics-canada",
  "everyday-computers-smartphones",
  "word-basics-canada",
  "job-search-canada",
  "outlook-workplace-email"
];

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

function targets(count, seed) {
  const deck = [];
  for (let i = 0; i < count; i += 1) deck.push(i % 4);
  return shuffle(deck, seed);
}

function place(question, target, seed) {
  const choices = question.choices || [];
  if (choices.length < 2 || !/^[A-F]$/.test(question.answer || "")) return;
  const correct = choices.find((choice) => choice.id === question.answer) || choices[0];
  const rest = shuffle(choices.filter((choice) => choice !== correct), seed);
  const slot = Math.min(target, choices.length - 1);
  const next = [];
  let r = 0;
  for (let i = 0; i < choices.length; i += 1) {
    next.push(i === slot ? correct : rest[r++]);
  }
  question.choices = next.map((choice, index) => Object.assign({}, choice, { id: LETTERS[index] }));
  question.answer = LETTERS[slot];
}

function spread(questions, seedKey) {
  const deck = targets(questions.length, hash(seedKey + ":deck"));
  questions.forEach((question, index) => {
    const seed = hash(seedKey + ":" + index + ":" + (question.prompt || ""));
    place(question, deck[index], seed);
  });
}

for (const slug of SLUGS) {
  const file = path.join(root, "data", "courses", slug + ".json");
  const course = JSON.parse(fs.readFileSync(file, "utf8"));
  if (course.finalExam && course.finalExam.questions) spread(course.finalExam.questions, slug + ":final");
  (course.lessons || []).forEach((lesson) => {
    if (lesson.quiz) spread(lesson.quiz, slug + ":lesson:" + lesson.number);
  });
  fs.writeFileSync(file, JSON.stringify(course, null, 2) + "\n");
  const counts = {};
  (course.finalExam.questions || []).forEach((q) => { counts[q.answer] = (counts[q.answer] || 0) + 1; });
  console.log(slug, JSON.stringify(counts));
}
