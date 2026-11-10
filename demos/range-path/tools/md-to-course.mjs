#!/usr/bin/env node
/**
 * Convert a Range Path course markdown file into data/courses/<slug>.json.
 *
 * Usage:
 *   node tools/md-to-course.mjs path/to/course.md --before email-online-safety --short "Short name" --nav "Nav"
 *   node tools/build-pages.mjs
 *
 * Pass --before email-online-safety to place the course after the newer
 * courses and before the original Email, SIN, and Winter courses. Pass
 * --after <slug> when it belongs beside a particular course. Without either
 * flag, the registry is left unchanged.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plain(value) {
  return String(value || "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatPlain(raw) {
  let html = esc(raw);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  return html;
}

function inline(raw) {
  const link = /\[([^\]]+)\]\((https?:[^)\s]+)\)/g;
  let html = "";
  let last = 0;
  let match;
  while ((match = link.exec(raw))) {
    html += formatChunk(raw.slice(last, match.index));
    html +=
      '<a href="' +
      esc(match[2]) +
      '" target="_blank" rel="noopener noreferrer">' +
      formatPlain(match[1]) +
      " <span>(opens in a new tab)</span></a>";
    last = match.index + match[0].length;
  }
  html += formatChunk(raw.slice(last));
  return html;
}

function formatChunk(raw) {
  const parts = String(raw).split(/(`[^`]*`)/g);
  return parts
    .map((part) => {
      if (part.length >= 2 && part.startsWith("`") && part.endsWith("`")) {
        return "<code>" + esc(part.slice(1, -1)) + "</code>";
      }
      return formatPlain(part);
    })
    .join("");
}

function isTableLine(line) {
  return /^\s*\|/.test(line);
}

function isSeparator(line) {
  return /^\s*\|?\s*:?-{3,}/.test(line) && !/[A-Za-z0-9]/.test(line);
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isUl(line) {
  return /^\s*[-*]\s+/.test(line);
}

function isOl(line) {
  return /^\s*\d+\.\s+/.test(line);
}

function tableHtml(rows) {
  if (!rows.length) return "";
  const row = (cells, tag) =>
    "<tr>" + cells.map((cell) => "<" + tag + ">" + inline(cell) + "</" + tag + ">").join("") + "</tr>";
  const head = row(rows[0], "th");
  const body = rows.slice(1).map((cells) => row(cells, "td")).join("");
  return "<table><thead>" + head + "</thead><tbody>" + body + "</tbody></table>";
}

function renderBlocks(lines) {
  const html = [];
  let i = 0;
  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed === "---" || /^\*\*About \d+ words\*\*$/.test(trimmed)) {
      i += 1;
      continue;
    }
    if (isTableLine(lines[i])) {
      const rows = [];
      while (i < lines.length && isTableLine(lines[i])) {
        if (!isSeparator(lines[i])) rows.push(splitRow(lines[i]));
        i += 1;
      }
      if (rows.length) html.push(tableHtml(rows));
      continue;
    }
    if (isUl(lines[i])) {
      const items = [];
      while (i < lines.length && isUl(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, "").trim());
        i += 1;
      }
      html.push("<ul>\n" + items.map((item) => "<li>" + inline(item) + "</li>").join("\n") + "\n</ul>");
      continue;
    }
    if (isOl(lines[i])) {
      const items = [];
      while (i < lines.length && isOl(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, "").trim());
        i += 1;
      }
      html.push("<ol>\n" + items.map((item) => "<li>" + inline(item) + "</li>").join("\n") + "\n</ol>");
      continue;
    }
    const para = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      lines[i].trim() !== "---" &&
      !isTableLine(lines[i]) &&
      !isUl(lines[i]) &&
      !isOl(lines[i])
    ) {
      para.push(lines[i].trim());
      i += 1;
    }
    html.push("<p>" + inline(para.join(" ")) + "</p>");
  }
  return html.join("\n");
}

function parseSources(lines) {
  const sources = [];
  const unparsed = [];
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed === "---") return;
    const labelled = trimmed.match(/^- (.+):\s+(https?:\/\/\S+)\s*$/);
    const bare = trimmed.match(/^- (https?:\/\/\S+)\s*$/);
    if (labelled) sources.push({ label: plain(labelled[1]), url: labelled[2] });
    else if (bare) sources.push({ label: bare[1], url: bare[1] });
    else unparsed.push(trimmed);
  });
  return { sources, unparsed };
}

function parseQuiz(lines) {
  const questions = [];
  let i = 0;
  while (i < lines.length) {
    const start = lines[i].trim().match(/^\*\*Q(\d+)\.\*\*\s*(.*)$/);
    if (!start) {
      i += 1;
      continue;
    }
    let prompt = start[2];
    i += 1;
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed === "---") {
        i += 1;
        continue;
      }
      if (/^\*\*Q\d+\.\*\*/.test(trimmed) || /^-\s+[A-Z]\)/.test(trimmed) || /^\*\*Answer:\*\*/.test(trimmed)) break;
      prompt += " " + trimmed;
      i += 1;
    }
    const choices = [];
    while (i < lines.length) {
      const choice = lines[i].trim().match(/^- ([A-Z])\)\s*(.*)$/);
      if (!choice) break;
      choices.push({ id: choice[1], text: plain(choice[2]) });
      i += 1;
    }
    let answer = "";
    let explain = "";
    while (i < lines.length) {
      const trimmed = lines[i].trim();
      if (/^\*\*Q\d+\.\*\*/.test(trimmed)) break;
      if (!trimmed || trimmed === "---") {
        i += 1;
        continue;
      }
      const answerMatch = trimmed.match(/^\*\*Answer:\*\*\s*([A-Z])/);
      if (answerMatch) {
        answer = answerMatch[1];
        i += 1;
        continue;
      }
      const explainMatch = trimmed.match(/^\*\*Explain:\*\*\s*(.*)$/);
      if (explainMatch) {
        explain = plain(explainMatch[1]);
        i += 1;
        while (i < lines.length) {
          const extra = lines[i].trim();
          if (!extra || extra === "---" || /^\*\*/.test(extra) || /^-\s+[A-Z]\)/.test(extra) || /^#{2,3}\s/.test(extra)) break;
          explain += " " + plain(extra);
          i += 1;
        }
        continue;
      }
      i += 1;
    }
    questions.push({ prompt: plain(prompt), choices, answer, explain });
  }
  return questions;
}

function parseFinal(lines) {
  const questions = [];
  lines.forEach((line) => {
    const match = line.trim().match(/^\*\*F(\d+)\.\*\*\s+(.+?)\s+\*\*([TF])\*\*\s*$/);
    if (!match) return;
    const prompt = plain(match[2].replace(/\s*\(T\/F\)\s*$/, ""));
    questions.push({
      prompt,
      choices: [
        { id: "T", text: "True" },
        { id: "F", text: "False" }
      ],
      answer: match[3],
      explain: ""
    });
  });
  return questions;
}

function questionsFromLesson(title, html) {
  const text = html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 40 && sentence.length <= 280);
  const picked = [];
  [0, 0.34, 0.67, 1].forEach((fraction) => {
    if (!sentences.length) return;
    const index = Math.min(sentences.length - 1, Math.round((sentences.length - 1) * fraction));
    const sentence = sentences[index];
    if (sentence && picked.indexOf(sentence) === -1) picked.push(sentence);
  });
  return picked.slice(0, 4).map((sentence) => ({
    prompt: "True or false: " + sentence,
    choices: [
      { id: "A", text: "True" },
      { id: "B", text: "False" }
    ],
    answer: "A",
    explain: "The lesson says this: " + sentence,
    generated: true
  }));
}

function sectionKind(level, title) {
  const name = title.trim();
  if (level === 2 && /^Learning goals\b/i.test(name)) return "goals";
  if (level === 2 && /^Lesson\s+\d+\b/.test(name)) return "lesson";
  if (level === 3 && /^Official sources\b/i.test(name)) return "sources";
  if (level === 3 && /^Lesson\s+\d+\s+quiz\b/i.test(name)) return "quiz";
  if (level === 2 && /^Final quiz\b/i.test(name)) return "final";
  if (level === 3 && /^Final quiz explanations\b/i.test(name)) return "finalExplain";
  if (level === 2 && /^Certificate text\b/i.test(name)) return "certificate";
  if (level === 2 && /^Content notes\b/i.test(name)) return "notes";
  return "other";
}

function lessonTitle(heading) {
  const match = heading.match(/^Lesson\s+(\d+)\s+[—–-]\s+(.+)$/);
  if (!match) return { number: 0, title: heading.trim() };
  return { number: Number(match[1]), title: match[2].trim() };
}

function validateQuestion(question, label, errors) {
  if (!question.prompt) errors.push(label + " has an empty prompt.");
  if (!question.choices.length) errors.push(label + " has no choices.");
  const ids = question.choices.map((choice) => choice.id);
  if (ids.indexOf(question.answer) === -1) {
    errors.push(label + " answer " + (question.answer || "(blank)") + " is not one of " + ids.join(", ") + ".");
  }
}

export function parseCourseMarkdown(markdown, fileName) {
  const lines = String(markdown).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const warnings = [];
  const titleLine = lines.find((line) => /^#\s+Course:/.test(line.trim()));
  const slugLine = lines.find((line) => /^\*\*Slug:\*\*/.test(line.trim()));
  if (!titleLine) throw new Error("Missing '# Course:' title in " + fileName);
  if (!slugLine) throw new Error("Missing '**Slug:**' in " + fileName);
  const title = titleLine.trim().replace(/^#\s+Course:\s*/, "").trim();
  const slugMatch = slugLine.match(/`([^`]+)`/);
  if (!slugMatch) throw new Error("Slug is not in backticks in " + fileName);
  const slug = slugMatch[1].trim();

  let disclaimer = "";
  const disclaimerLine = lines.find((line) => /^\*\*Disclaimer:\*\*/.test(line.trim()));
  if (disclaimerLine) disclaimer = plain(disclaimerLine.trim().replace(/^\*\*Disclaimer:\*\*\s*/, ""));

  const sections = [];
  let current = null;
  lines.forEach((line) => {
    const heading = line.match(/^(#{2,3})\s+(.+?)\s*$/);
    if (heading) {
      current = { level: heading[1].length, title: heading[2].trim(), lines: [] };
      sections.push(current);
      return;
    }
    if (current) current.lines.push(line);
  });

  let goals = "";
  const lessons = [];
  let finalQuestions = [];
  let finalExplain = "";
  let certificateNote = "";
  let builderNotes = "";
  let currentLesson = null;

  sections.forEach((section) => {
    const kind = sectionKind(section.level, section.title);
    if (kind === "goals") {
      goals = plain(renderBlocks(section.lines).replace(/<[^>]+>/g, " "));
      return;
    }
    if (kind === "lesson") {
      const parsed = lessonTitle(section.title);
      currentLesson = {
        number: parsed.number,
        title: parsed.title,
        html: renderBlocks(section.lines),
        sources: [],
        quiz: []
      };
      lessons.push(currentLesson);
      return;
    }
    if (kind === "sources") {
      if (!currentLesson) {
        warnings.push("Official sources appeared before a lesson: " + section.title);
        return;
      }
      const parsed = parseSources(section.lines);
      currentLesson.sources = parsed.sources;
      parsed.unparsed.forEach((line) => warnings.push("Unparsed source line in lesson " + currentLesson.number + ": " + line));
      return;
    }
    if (kind === "quiz") {
      if (!currentLesson) {
        warnings.push("Quiz appeared before a lesson: " + section.title);
        return;
      }
      const expected = (section.lines.join("\n").match(/\*\*Q\d+\.\*\*/g) || []).length;
      currentLesson.quiz = parseQuiz(section.lines);
      if (currentLesson.quiz.length !== expected) {
        warnings.push(
          "Lesson " + currentLesson.number + " quiz parsed " + currentLesson.quiz.length + " of " + expected + " questions."
        );
      }
      return;
    }
    if (kind === "final") {
      const expected = (section.lines.join("\n").match(/\*\*F\d+\.\*\*/g) || []).length;
      finalQuestions = parseFinal(section.lines);
      if (finalQuestions.length !== expected) {
        warnings.push("Final quiz parsed " + finalQuestions.length + " of " + expected + " questions.");
      }
      return;
    }
    if (kind === "finalExplain") {
      finalExplain = plain(section.lines.filter((line) => line.trim() && line.trim() !== "---").join(" "));
      return;
    }
    if (kind === "certificate") {
      section.lines.forEach((line) => {
        const text = plain(line.replace(/^>\s?/, ""));
        if (/^It is not\b/.test(text)) certificateNote = text;
      });
      return;
    }
    if (kind === "notes") {
      builderNotes = section.lines
        .map((line) => line.trim())
        .filter((line) => line && line !== "---")
        .join("\n");
      return;
    }
    if (section.title && section.lines.some((line) => line.trim())) {
      warnings.push("Skipped section: " + section.title);
    }
  });

  const errors = [];
  if (!goals) errors.push("Learning goals are missing.");
  if (!lessons.length) errors.push("No lessons found.");
  lessons.forEach((lesson) => {
    if (!lesson.html || lesson.html.replace(/<[^>]+>/g, "").trim().length < 40) {
      errors.push("Lesson " + lesson.number + " body is missing or too short.");
    }
    if (!lesson.quiz.length) {
      lesson.quiz = questionsFromLesson(lesson.title, lesson.html);
      if (lesson.quiz.length) {
        warnings.push(
          "Lesson " + lesson.number + " had no quiz in the source. Wrote " + lesson.quiz.length + " true/false questions using only that lesson's sentences."
        );
      } else {
        errors.push("Lesson " + lesson.number + " has no quiz and no sentences to write one from.");
      }
    }
    lesson.quiz.forEach((question, index) => validateQuestion(question, "Lesson " + lesson.number + " Q" + (index + 1), errors));
  });
  if (!finalQuestions.length) errors.push("Final quiz is missing.");
  finalQuestions.forEach((question, index) => {
    question.explain = finalExplain;
    validateQuestion(question, "Final F" + (index + 1), errors);
  });
  if (!certificateNote) warnings.push("No 'It is not…' certificate sentence found.");

  if (errors.length) {
    const error = new Error(errors.join(" "));
    error.warnings = warnings;
    throw error;
  }

  return {
    slug,
    title,
    summary: goals,
    goals,
    certificateNote,
    lessons: lessons.map((lesson) => ({
      number: lesson.number,
      title: lesson.title,
      html: lesson.html,
      sources: lesson.sources,
      quiz: lesson.quiz
    })),
    finalQuiz: {
      explain: finalExplain,
      questions: finalQuestions
    },
    keptBack: {
      sourceDisclaimer: disclaimer,
      builderNotes,
      reason:
        "The source disclaimer is not shown on the page. Each page keeps the existing Range Path footer disclaimer once. Builder notes are for authors and are not shown to learners."
    },
    warnings
  };
}

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return "";
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(name + " needs a value.");
  }
  return value;
}

function insertRegistry(slug, shortTitle, navLabel, before, after) {
  const file = path.join(demoRoot, "data", "registry.json");
  const registry = JSON.parse(fs.readFileSync(file, "utf8"));
  const existing = registry.courses.findIndex((course) => course.slug === slug);
  if (existing !== -1) {
    console.log("Registry already lists " + slug + ". Left that entry where it is.");
    return;
  }
  const entry = { slug, shortTitle, navLabel, featured: true };
  let index = registry.courses.length;
  if (before) {
    index = registry.courses.findIndex((course) => course.slug === before);
    if (index === -1) throw new Error("Registry has no course named " + before + ".");
  } else if (after) {
    index = registry.courses.findIndex((course) => course.slug === after);
    if (index === -1) throw new Error("Registry has no course named " + after + ".");
    index += 1;
  }
  registry.courses.splice(index, 0, entry);
  fs.writeFileSync(file, JSON.stringify(registry, null, 2) + "\n");
  console.log("Added " + slug + " to data/registry.json at position " + (index + 1) + ".");
}

function main() {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("Usage: node tools/md-to-course.mjs path/to/course.md [--before slug | --after slug] [--short \"Short name\"] [--nav \"Nav\"]");
    process.exit(1);
  }
  let before = "";
  let after = "";
  let shortTitle = "";
  let navLabel = "";
  try {
    before = readFlag(process.argv, "--before");
    after = readFlag(process.argv, "--after");
    shortTitle = readFlag(process.argv, "--short");
    navLabel = readFlag(process.argv, "--nav");
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
  if (before && after) {
    console.error("Use either --before or --after, not both.");
    process.exit(1);
  }
  const markdown = fs.readFileSync(file, "utf8");
  let course;
  try {
    course = parseCourseMarkdown(markdown, path.basename(file));
  } catch (error) {
    console.error(error.message);
    if (error.warnings) error.warnings.forEach((warning) => console.error("Warning: " + warning));
    process.exit(1);
  }
  const outDir = path.join(demoRoot, "data", "courses");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, course.slug + ".json");
  const warnings = course.warnings || [];
  delete course.warnings;
  fs.writeFileSync(outFile, JSON.stringify(course, null, 2) + "\n");
  console.log("Wrote " + path.relative(demoRoot, outFile));
  console.log(
    course.lessons.length +
      " lessons, " +
      course.lessons.reduce((sum, lesson) => sum + lesson.quiz.length, 0) +
      " lesson questions, " +
      course.finalQuiz.questions.length +
      " final questions."
  );
  warnings.forEach((warning) => console.log("Warning: " + warning));
  const label = shortTitle || course.title.replace(/\s*\([^)]*\)\s*$/, "").trim();
  const nav = navLabel || label;
  if (before || after) {
    try {
      insertRegistry(course.slug, label, nav, before, after);
    } catch (error) {
      console.error(error.message);
      process.exit(1);
    }
  } else {
    console.log(
      "Not added to the registry. Re-run with --before email-online-safety to place it ahead of the original courses, then run node tools/build-pages.mjs."
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
