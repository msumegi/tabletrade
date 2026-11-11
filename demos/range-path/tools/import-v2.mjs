#!/usr/bin/env node
/* Load a v2 course markdown draft into data/courses/<slug>.json. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mdPath = process.argv[2];
if (!mdPath) {
  console.error("Usage: node import-v2.mjs <draft.md>");
  process.exit(1);
}

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return ~crc >>> 0;
}

function zipStore(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  files.forEach((file) => {
    const name = Buffer.from(file.name);
    const crc = crc32(file.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, file.data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(file.data.length, 20);
    cen.writeUInt32LE(file.data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += local.length + name.length + file.data.length;
  });
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat(parts.concat([centralBuf, end]));
}

function xml(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function colName(index) {
  let n = index + 1;
  let name = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    name = String.fromCharCode(65 + rem) + name;
    n = Math.floor((n - 1) / 26);
  }
  return name;
}

function sheetXml(rows) {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (cell === "" || cell == null) return "";
          const ref = colName(c) + (r + 1);
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          return `<c r="${ref}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function workbook(sheets) {
  const sheetFiles = sheets.map((sheet, index) => ({
    name: "xl/worksheets/sheet" + (index + 1) + ".xml",
    data: Buffer.from(sheetXml(sheet.rows))
  }));
  const overrides = sheetFiles
    .map((file) => `<Override PartName="/${file.name}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
    .join("");
  const rels = sheetFiles
    .map((file, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`)
    .join("");
  const sheetTags = sheets
    .map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join("");
  return zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${overrides}</Types>`) },
    { name: "_rels/.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { name: "xl/workbook.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetTags}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`) }
  ].concat(sheetFiles));
}

function inline(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2">$1</a>');
}

function mdToHtml(md) {
  const lines = md.replace(/\r/g, "").split("\n");
  const out = [];
  let para = [];
  let list = [];
  let ordered = false;
  function flushPara() {
    if (!para.length) return;
    out.push("<p>" + inline(para.join(" ")) + "</p>");
    para = [];
  }
  function flushList() {
    if (!list.length) return;
    const tag = ordered ? "ol" : "ul";
    out.push("<" + tag + ">" + list.map((item) => "<li>" + inline(item) + "</li>").join("") + "</" + tag + ">");
    list = [];
  }
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("%%BLOCK:")) {
      flushPara();
      flushList();
      if (trimmed.startsWith("%%BLOCK:")) out.push(trimmed);
      return;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      flushPara();
      ordered = false;
      list.push(trimmed.replace(/^[-*]\s+/, ""));
      return;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushPara();
      ordered = true;
      list.push(trimmed.replace(/^\d+\.\s+/, ""));
      return;
    }
    flushList();
    para.push(trimmed);
  });
  flushPara();
  flushList();
  return out.join("\n");
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "section";
}

function parseAnswerKey(md) {
  const key = {};
  const match = md.match(/<details>[\s\S]*?<\/details>/);
  if (!match) return key;
  const body = match[0];
  body.replace(/(\d+)\.\s+\*\*([A-D])\.?\*\*/g, (_, n, letter) => {
    if (!key[n]) key[n] = { answer: letter, explain: "" };
    return "";
  });
  body.replace(/(\d+)\.\s+\*\*([A-D])\.?\*\*\s+([^\n*]+)/g, (_, n, letter, explain) => {
    const clean = explain.trim();
    if (!clean || /^\d+\./.test(clean)) return "";
    key[n] = { answer: letter, explain: clean };
    return "";
  });
  body.replace(/^(\d+)\.\s+(?!\*\*)([^\n]+)/gm, (_, n, explain) => {
    if (key[n] && !key[n].explain) key[n].explain = explain.trim();
    return "";
  });
  return key;
}

function parseQuiz(md) {
  const key = parseAnswerKey(md);
  const body = md.replace(/<details>[\s\S]*?<\/details>/g, "").replace(/%%BLOCK:\d+%%/g, "");
  const chunks = body.split(/\*\*(\d+)\.\*\*\s*/).slice(1);
  const questions = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const n = chunks[i];
    const rest = chunks[i + 1] || "";
    const prompt = (rest.split("\n")[0] || "").trim();
    const choices = [];
    rest.replace(/^- ([A-D])\.\s+(.+)$/gm, (_, id, text) => {
      choices.push({ id, text: text.trim() });
      return "";
    });
    if (!prompt || choices.length < 2) continue;
    questions.push({
      prompt,
      choices,
      answer: (key[n] && key[n].answer) || "",
      explain: (key[n] && key[n].explain) || ""
    });
  }
  return questions;
}

function parseSources(md) {
  const sources = [];
  md.replace(/https?:\/\/[^\s)]+/g, (url) => {
    const line = md.split("\n").find((row) => row.includes(url)) || "";
    const label = line.replace(url, "").replace(/^[-*\s]+/, "").replace(/\*\*/g, "").split("—")[0].trim().replace(/:$/, "");
    sources.push({ label: label || url, url: url.replace(/[.,]$/, "") });
    return url;
  });
  return sources;
}

function tuneBlock(block) {
  if (block.type === "download") {
    const file = String(block.href || block.src || "").split("/").pop();
    block.href = "../../../media/practice/" + file;
    delete block.src;
  }
  if (block.type === "annotatedImage") {
    delete block.src;
    const id = block.id || "";
    if (/print/i.test(id)) block.diagram = "print";
    else if (/sum|formula|average|autosum/i.test(id)) block.diagram = "sum";
    else block.diagram = "grid";
  }
  if (block.note) block.note = String(block.note).replace(/\s*A copy also sits beside this draft at \S+\.?/, "");
  if (block.type === "simulation" && !block.caption) {
    block.caption = block.app && block.app !== "excel" ? "Practice screen — not the real app." : "Practice screen — not the real Excel.";
  }
  return block;
}

function blocksFrom(text, bank) {
  const html = mdToHtml(text);
  const pieces = html.split(/(%%BLOCK:\d+%%)/);
  const out = [];
  pieces.forEach((piece) => {
    const marker = piece.match(/^%%BLOCK:(\d+)%%$/);
    if (marker) {
      out.push(tuneBlock(bank[Number(marker[1])]));
      return;
    }
    const body = piece.trim();
    if (body) out.push({ type: "prose", html: body });
  });
  return out;
}

function extractBank(text) {
  const bank = [];
  const cleaned = text.replace(/\[INTERACTIVE\]\s*```json\s*([\s\S]*?)```/g, (_, json) => {
    bank.push(JSON.parse(json));
    return "\n\n%%BLOCK:" + (bank.length - 1) + "%%\n\n";
  });
  return { text: cleaned, bank };
}

let markdown = fs.readFileSync(mdPath, "utf8").replace(/\r/g, "");
markdown = markdown.replace(/LearnHere/g, "LearnHere");
const { text, bank } = extractBank(markdown);
const parts = text.split(/\n(?=## )/);
const preamble = parts[0];
const meta = (() => {
  let found = {};
  markdown.replace(/```json\s*([\s\S]*?)```/g, (_, json) => {
    try {
      const obj = JSON.parse(json);
      if (obj && obj.slug) found = obj;
    } catch (err) {
      /* interactive blocks are parsed later */
    }
    return "";
  });
  return found;
})();
const outcomes = [];
const outcomeBlock = preamble.split("## What you will learn")[1] || "";
(outcomeBlock.split("## ")[0] || "").replace(/^\d+\.\s+(.+)$/gm, (_, line) => {
  outcomes.push(line.trim());
  return "";
});
const hoursMatch = preamble.match(/Estimated learner hours:\*\* about \*\*([^*]+)\*\*/);
const hoursLabel = hoursMatch
  ? "About " + hoursMatch[1].trim() + " hours (estimate, including practice and the exam). Each lesson’s reading time is shorter; the rest is practice."
  : "About 20 hours (estimate, including practice and the exam).";
const disclaimer = (preamble.match(/> \*\*What this course is not\.\*\*([\s\S]*?)(?:\n\n|$)/) || [])[0] || "";
const oldPath = path.join(demoRoot, "data", "courses", meta.slug + ".json");
const previous = fs.existsSync(oldPath) ? JSON.parse(fs.readFileSync(oldPath, "utf8")) : {};

const lessons = [];
let finalExam = null;
let capstone = null;

parts.slice(1).forEach((part) => {
  const titleLine = part.split("\n")[0].replace(/^##\s+/, "").trim();
  if (/^Certificate|^Builder notes/i.test(titleLine)) return;
  if (/final exam/i.test(titleLine) && !/^Lesson/i.test(titleLine)) {
    finalExam = {
      passMark: 0.7,
      attemptLimit: 2,
      requireAllLessons: true,
      questions: parseQuiz(part)
    };
    return;
  }
  if (/^Capstone/i.test(titleLine)) {
    capstone = part;
    return;
  }
  const lessonMatch = titleLine.match(/^Lesson\s+(\d+)\.\s+(.+)$/);
  if (!lessonMatch) return;
  const chunks = part.split(/\n(?=### )/);
  const intro = chunks[0];
  const minutesMatch = intro.match(/About\s+(\d+)\s+minutes/);
  const lesson = {
    number: Number(lessonMatch[1]),
    title: lessonMatch[2].trim(),
    minutes: minutesMatch ? Number(minutesMatch[1]) : 8,
    sections: [],
    sources: [],
    quiz: []
  };
  chunks.slice(1).forEach((chunk) => {
    const heading = chunk.split("\n")[0].replace(/^###\s+/, "").trim();
    const body = chunk.split("\n").slice(1).join("\n");
    if (/quiz/i.test(heading)) {
      lesson.quiz = parseQuiz(body);
      return;
    }
    if (/official sources/i.test(heading)) {
      lesson.sources = parseSources(body);
      return;
    }
    const details = body.match(/<details>\s*<summary>([\s\S]*?)<\/summary>([\s\S]*?)<\/details>/);
    const withoutDetails = body.replace(/<details>[\s\S]*?<\/details>/g, "");
    const blocks = blocksFrom(withoutDetails, bank);
    if (/^Self-check/i.test(heading) && details) {
      lesson.assignment = {
        id: "self-check-" + lesson.number,
        title: "Self-check",
        html: mdToHtml(withoutDetails),
        answerKey: mdToHtml(details[2])
      };
      return;
    }
    if (/^Worked example/i.test(heading)) {
      blocks.unshift({ type: "workedExample", title: heading, html: "" });
    }
    lesson.sections.push({
      id: slugify(heading),
      title: heading.replace(/\.\s+/, ". ").replace(/^Chapter \d+\.\s+/, ""),
      minutes: 4,
      blocks
    });
  });
  lessons.push(lesson);
});

bank.filter((block) => block && block.type === "assignment").forEach((block) => {
  const last = lessons[lessons.length - 1];
  if (last) last.assignment = tuneBlock(block);
});

if (capstone && lessons.length) {
  const last = lessons[lessons.length - 1];
  const assignment = bank.find((block) => block && block.type === "assignment");
  if (assignment) last.assignment = tuneBlock(assignment);
  last.sections.push({
    id: "capstone",
    title: "Capstone",
    minutes: 20,
    blocks: blocksFrom(capstone.replace(/^##[^\n]*\n/, ""), bank).filter((block) => block.type !== "assignment")
  });
}

const downloads = [];
function walk(node) {
  if (!node || typeof node !== "object") return;
  if (node.type === "download" && node.href) downloads.push(node.href.split("/").pop());
  Object.values(node).forEach(walk);
}
lessons.forEach(walk);

const course = {
  slug: meta.slug,
  title: previous.title || meta.slug,
  summary: outcomes.slice(0, 2).join(" "),
  goals: outcomes.join(" "),
  certificateNote: previous.certificateNote || "The certificate confirms you passed the knowledge exam. It is not accredited, and a tutor did not watch you do the task.",
  disclaimer: disclaimer.replace(/^>\s?/gm, "").trim(),
  includes: Array.from(new Set((meta.includes || []).concat(downloads.length ? ["practiceFile"] : []))),
  badges: meta.badges || [],
  player: { outcomes, youNeed: [], hoursLabel, readAloud: true },
  finalExam,
  lessons,
  media: previous.media || null
};
delete course.comingSoon;

const titleMatch = preamble.match(/^#\s+(.+)$/m);
if (titleMatch) course.title = titleMatch[1].replace(/\s+—\s+v2 draft$/, "").trim();

fs.writeFileSync(oldPath, JSON.stringify(course, null, 2) + "\n");
console.log(course.slug, "lessons", lessons.length, "final", finalExam && finalExam.questions.length, "badges", (course.badges || []).length);

const practiceDir = path.join(demoRoot, "media", "practice");
fs.mkdirSync(practiceDir, { recursive: true });
if (course.slug === "excel-basics-canada") {
  const file = workbook([
    {
      name: "Hours",
      rows: [
        ["Day", "Hours worked", "Notes"],
        ["Mon", 6, "Community hall setup"],
        ["Tue", 4, "Office desk"],
        ["Wed", 7.5, "Market stall"],
        ["Thu", 0, "Day off"],
        ["Fri", 5, "Library shift"],
        ["Sat", 3, "Extra shift"],
        ["Sun", 0, "Day off"],
        ["Total", "", ""],
        ["", "", ""],
        ["Sample data only. Not a real person's hours, pay, or spending.", "", ""]
      ]
    },
    {
      name: "Household",
      rows: [
        ["Item", "Store", "Amount (CAD)", "Category"],
        ["Milk 2 litre", "Co-op", 5.49, "Groceries"],
        ["Bread", "Co-op", 3.29, "Groceries"],
        ["Fuel", "Cardlock", 80, "Vehicle"],
        ["Feed", "Farm supply", 45, "Farm"],
        ["Phone card", "Hardware", 25, "Household"],
        ["Total", "", "", ""],
        ["Sample data only. Not a real person's hours, pay, or spending.", "", "", ""]
      ]
    },
    {
      name: "Practice",
      rows: [["Use this sheet for try-it tasks. Sample data only."]]
    }
  ]);
  fs.writeFileSync(path.join(practiceDir, "Excel-Basics-Practice-Sample-Only.xlsx"), file);
  console.log("wrote workbook", file.length);
}
if (course.slug === "everyday-computers-smartphones") {
  fs.writeFileSync(
    path.join(practiceDir, "everyday-computers-files-checklist.txt"),
    "File-and-folder practice checklist\nSample only. Do not type a password.\n\n1. On a computer, open File Explorer. On a phone, open the Files app (or the name the phone maker uses).\n2. Find Documents, Downloads, or a folder a tutor showed you.\n3. Save a practice note with a name you can search for later, such as practice-note.\n4. Close it, then find it again by that name.\n5. On a shared computer, do not delete files you did not create. Ask a tutor first.\n"
  );
  fs.writeFileSync(
    path.join(practiceDir, "everyday-computers-wifi-checklist.txt"),
    "Before you connect to Wi-Fi\nSample only. Do not type a real Wi-Fi password into this course.\n\n1. Open Settings, then Network and internet, then Internet (on many Android phones). On Windows, use the network icon on the taskbar.\n2. Join a network you already know. A lock icon means the network asks for a password.\n3. Type the password only in the real device prompt, not in a practice screen.\n4. Pause before you use a public network for banking, mail, or other private tasks.\n5. If you joined the wrong name, forget that network and ask a tutor.\n"
  );
  console.log("wrote checklists");
}
