#!/usr/bin/env node
/**
 * Write real Excel Basics practice files and attach player-v2 fields
 * to data/courses/excel-basics-canada.json. Safe to run again:
 * sections are rebuilt from each lesson's original html field.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(demoRoot, "practice", "excel-basics-canada");
const coursePath = path.join(demoRoot, "data", "courses", "excel-basics-canada.json");

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
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
    local.writeUInt16LE(0, 8);
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

function xmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
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
          const ref = colName(c) + (r + 1);
          if (cell && typeof cell === "object" && cell.formula) {
            return `<c r="${ref}"><f>${xmlEscape(cell.formula)}</f></c>`;
          }
          if (typeof cell === "number") return `<c r="${ref}"><v>${cell}</v></c>`;
          if (cell == null || cell === "") return "";
          return `<c r="${ref}" t="inlineStr"><is><t>${xmlEscape(cell)}</t></is></c>`;
        })
        .join("");
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

function xlsx(rows) {
  const files = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`)
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Practice" sheetId="1" r:id="rId1"/></sheets>
</workbook>`)
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`)
    },
    { name: "xl/worksheets/sheet1.xml", data: Buffer.from(sheetXml(rows)) }
  ];
  return zipStore(files);
}

function csv(rows) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (cell && typeof cell === "object" && cell.formula) return "=" + cell.formula;
          const text = cell == null ? "" : String(cell);
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(",")
    )
    .join("\n") + "\n";
}

function splitAt(html, marker) {
  const index = html.indexOf(marker);
  if (index < 0) throw new Error("Could not split lesson html at: " + marker);
  return [html.slice(0, index), html.slice(index)];
}

const sample = [
  ["Item", "Amount"],
  ["Fuel", 80],
  ["Feed", 45],
  ["Supplies", 25]
];
const sampleSolved = sample.concat([["Total", { formula: "SUM(B2:B4)" }]]);

const packs = {
  1: {
    starter: [["", ""]],
    solved: [["A1", ""]]
  },
  2: { starter: [["Item", "Amount"]], solved: sample },
  3: { starter: sample, solved: sample },
  4: { starter: sample, solved: sampleSolved },
  5: { starter: sample, solved: sample }
};

function fileMeta(filename, rows, kind, solved) {
  const full = path.join(outDir, filename);
  const data = kind === "CSV" ? Buffer.from(csv(rows), "utf8") : xlsx(rows);
  fs.writeFileSync(full, data);
  return {
    href: "../../../practice/excel-basics-canada/" + filename,
    name: filename,
    bytes: data.length,
    kind,
    solved
  };
}

const course = JSON.parse(fs.readFileSync(coursePath, "utf8"));
fs.mkdirSync(outDir, { recursive: true });

const timeComment =
  "PLACEHOLDER for content writers: reading times are editor estimates so the player can show them. They are not in the source file. Replace them.";

function section(id, title, minutes, html, blocks) {
  return {
    id,
    title,
    minutes,
    minutesComment: timeComment,
    blocks: [{ type: "prose", html }].concat(blocks || [])
  };
}

const lessonPlans = {
  1: (html) => {
    const [grid, rest] = splitAt(html, "<p><strong>To start a blank workbook</strong>");
    const [start, address] = splitAt(rest, "<p>Each cell has an address");
    return [
      section("grid", "Cells, rows, and columns", 8, grid),
      section("workbook", "Workbooks and a blank sheet", 8, start),
      section("address", "Cell addresses", 7, address)
    ];
  },
  2: (html) => {
    const [steps, rest] = splitAt(html, "<p><strong>A simple practice table</strong>");
    const [table, tips] = splitAt(rest, "<p><strong>Tips:</strong>");
    return [
      section("enter", "Type in a cell", 8, steps),
      section("table", "The sample table", 8, table, [
        {
          type: "example",
          title: "Worked example: the sample table",
          problem: "Enter the sample table from this lesson: column A is Item, column B is Amount.",
          steps: [
            "Click an empty cell. On a new sheet, try A1.",
            "Type the header Item, press Tab, and type Amount.",
            "Press Enter and type the rows Fuel 80, Feed 45, and Supplies 25."
          ],
          result: "Column A has Item, Fuel, Feed, and Supplies. Column B has Amount, 80, 45, and 25.",
          comment:
            "PLACEHOLDER for content writers: this worked example only restates the sample table already in the lesson. Replace it with a fuller example."
        }
      ]),
      section("tips", "Tips while you type", 6, tips)
    ];
  },
  3: (html) => {
    const [borders, formats] = splitAt(html, "<p><strong>Number formats:</strong>");
    return [
      section("borders", "Borders and fill colour", 10, borders),
      section("formats", "Number formats", 10, formats)
    ];
  },
  4: (html) => {
    const [formulas, autosum] = splitAt(html, "<p><strong>AutoSum</strong>");
    return [
      section("formulas", "Formulas that start with =", 12, formulas, [
        {
          type: "example",
          title: "Worked example: order of operations",
          problem: "What does the formula =5+2*3 calculate?",
          steps: [
            "Start the formula with an equal sign.",
            "Remember that multiplication happens before addition.",
            "Multiply 2 by 3 first, then add 5."
          ],
          result: "The lesson states that =5+2*3 multiplies 2 and 3 first, then adds 5.",
          comment:
            "PLACEHOLDER for content writers: this worked example only restates the formula already in the lesson. Replace it with a fuller example."
        }
      ]),
      section("autosum", "AutoSum", 10, autosum, [
        {
          type: "example",
          title: "Worked example: add a column",
          problem: "Add the sample amounts 80, 45, and 25.",
          steps: [
            "Select the cell immediately below the column of numbers.",
            "On the Home tab, click AutoSum.",
            "Or type =SUM(B2:B4) if those amounts are in B2 through B4.",
            "Press Enter."
          ],
          result: "Excel adds the cells from B2 through B4.",
          comment:
            "PLACEHOLDER for content writers: this worked example only restates AutoSum and =SUM(B2:B4) from the lesson. Replace it with a fuller example."
        }
      ])
    ];
  },
  5: (html) => {
    const [save, print] = splitAt(html, "<p><strong>To print</strong>");
    return [section("save", "Save the workbook", 10, save), section("print", "Print or preview", 8, print)];
  }
};

const taskComment =
  "PLACEHOLDER for content writers: the task asks the learner to follow steps already in this lesson, using the practice file. Replace the wording with the full assignment.";

course.player = {
  version: 2,
  estimatedMinutes: 0,
  timeComment,
  outcomes: [
    "Open a blank workbook.",
    "Enter text and numbers in cells.",
    "Apply simple formatting.",
    "Write a basic formula that starts with an equal sign.",
    "Use AutoSum.",
    "Save or print the work."
  ],
  outcomesComment:
    "PLACEHOLDER for content writers: these outcomes repeat the course learning goals. Replace them if the goals change.",
  youNeed: [
    "Excel on the computer in front of you, or Excel for the web if your council approves a sign-in.",
    "The practice files linked in each lesson."
  ],
  youNeedComment:
    "PLACEHOLDER for content writers: the Excel item restates lesson 1. The practice-file item was added for the player demo."
};

course.finalExam = {
  requireAllLessons: true,
  passMark: 0.7,
  attemptLimit: 2,
  questions: course.finalQuiz.questions.map((question, index) => {
    const topics = [
      { topic: "Workbooks and sheets", review: "../lesson-1/" },
      { topic: "Cell addresses", review: "../lesson-1/" },
      { topic: "Entering data", review: "../lesson-2/" },
      { topic: "Formulas", review: "../lesson-4/" },
      { topic: "AutoSum", review: "../lesson-4/" },
      { topic: "Saving a workbook", review: "../lesson-5/" },
      { topic: "What this certificate is not", review: "../lesson-1/" }
    ];
    return Object.assign({}, question, topics[index]);
  })
};

let totalMinutes = 0;
course.lessons.forEach((lesson) => {
  const sections = lessonPlans[lesson.number](lesson.html);
  lesson.sections = sections;
  lesson.minutes = sections.reduce((sum, item) => sum + item.minutes, 0);
  lesson.minutesComment = timeComment;
  totalMinutes += lesson.minutes;
  const pack = packs[lesson.number];
  const base = "lesson-" + lesson.number;
  lesson.files = [
    fileMeta(base + "-starter.csv", pack.starter, "CSV", false),
    fileMeta(base + "-starter.xlsx", pack.starter, "Excel workbook", false),
    fileMeta(base + "-solved.xlsx", pack.solved, "Excel workbook", true)
  ];
  if (lesson.number === 2 || lesson.number === 4) {
    lesson.files.push(fileMeta(base + "-solved.csv", pack.solved, "CSV", true));
  }
  lesson.filesComment =
    "PLACEHOLDER for content writers: practice rows use the Item/Amount sample already in lesson 2 (Fuel 80, Feed 45, Supplies 25) or an empty sheet. Replace the files if the lesson changes.";
  lesson.assignment = {
    id: "lesson-" + lesson.number + "-task",
    title: "Practice: " + lesson.title,
    instructions:
      "<p>Open the starter practice file for this lesson. Follow the steps in the sections above. Then mark this practice done.</p>",
    selfCheck:
      "<p>Check your sheet against the solved practice file and against the steps in this lesson. The solved file is a sample, not a mark.</p>",
    comment: taskComment
  };
});
course.player.estimatedMinutes = totalMinutes;

fs.writeFileSync(coursePath, JSON.stringify(course, null, 2) + "\n");
console.log("Excel showcase updated. Estimated minutes:", totalMinutes);
console.log("Files in", path.relative(demoRoot, outDir));
