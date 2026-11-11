#!/usr/bin/env node
/** Attach production-value blocks to the existing Excel Basics lessons. */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const coursePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../data/courses/excel-basics-canada.json");
const course = JSON.parse(fs.readFileSync(coursePath, "utf8"));

function add(lessonNumber, sectionId, block) {
  const lesson = course.lessons.find((item) => item.number === lessonNumber);
  const section = lesson.sections.find((item) => item.id === sectionId);
  section.blocks = section.blocks || [];
  if (section.blocks.some((item) => item.id === block.id)) return;
  section.blocks.push(block);
}

const practice = "../../../practice/excel-basics-canada/lesson-2-starter.xlsx";

add(1, "grid", {
  type: "annotatedImage",
  id: "excel-grid-figure",
  diagram: "grid",
  alt: "A practice sheet. Cell A1 is the top-left cell.",
  callouts: [{ n: 1, label: "A1 is column A, row 1." }]
});
add(1, "workbook", {
  type: "simulation",
  id: "excel-blank-workbook",
  title: "Start a blank workbook",
  caption: "Practice screen — not the real Excel.",
  tools: [{ id: "blank", label: "Blank workbook" }],
  steps: [{
    id: "s1",
    prompt: "Tap the control that starts a blank workbook.",
    hotspots: [{ id: "blank", label: "Blank workbook" }],
    correct: ["blank"],
    pass: "A blank workbook is a new file with a sheet.",
    fail: "Look for the control labelled Blank workbook."
  }]
});
add(1, "address", {
  type: "check",
  id: "excel-workbook-check",
  prompt: "An Excel file is called a:",
  choices: [
    { id: "A", text: "Workbook" },
    { id: "B", text: "Single cell" }
  ],
  answer: "A",
  explain: "The lesson says an Excel file is a workbook and can contain sheets."
});

add(2, "enter", {
  type: "simulation",
  id: "excel-enter-tab",
  title: "Move after you type",
  caption: "Practice screen — not the real Excel.",
  tools: [
    { id: "Enter", label: "Enter" },
    { id: "Tab", label: "Tab" }
  ],
  steps: [
    {
      id: "s1",
      prompt: "Tap cell A1.",
      hotspots: [{ id: "A1", label: "Cell A1" }],
      correct: ["A1"],
      pass: "A1 is the top-left cell.",
      fail: "A1 is the first cell, not a number in column B."
    },
    {
      id: "s2",
      prompt: "Tap Enter. On this practice screen it stands for moving down.",
      hotspots: [{ id: "Enter", label: "Enter" }],
      correct: ["Enter"],
      pass: "Enter moves down. Tab moves to the right.",
      fail: "Enter is the labelled control, not another cell."
    }
  ]
});
add(2, "table", {
  type: "download",
  id: "excel-practice-expenses",
  href: practice,
  label: "Sample expense list (Excel workbook)",
  note: "Sample amounts only: Fuel 80, Feed 45, Supplies 25."
});
add(2, "tips", {
  type: "check",
  id: "excel-one-kind",
  prompt: "A simple list keeps one kind of information in each column.",
  choices: [
    { id: "A", text: "True" },
    { id: "B", text: "False" }
  ],
  answer: "A",
  explain: "The lesson's sample table puts names in one column and amounts in the other."
});

add(3, "borders", {
  type: "simulation",
  id: "excel-borders",
  title: "Borders and a header fill",
  caption: "Practice screen — not the real Excel.",
  tools: [
    { id: "Borders", label: "Borders" },
    { id: "Fill", label: "Header fill" }
  ],
  steps: [
    {
      id: "s1",
      prompt: "Tap cell B2, the first amount.",
      hotspots: [{ id: "B2", label: "Cell B2" }],
      correct: ["B2"],
      pass: "B2 is selected.",
      fail: "B2 is the cell with 80."
    },
    {
      id: "s2",
      prompt: "Tap Borders.",
      hotspots: [{ id: "Borders", label: "Borders" }],
      correct: ["Borders"],
      pass: "Borders are on the Home tab, in the Font group, in the real program.",
      fail: "Borders is the labelled control."
    }
  ]
});
add(3, "formats", {
  type: "annotatedImage",
  id: "excel-number-formats",
  diagram: "grid",
  alt: "A practice sheet. Number formats change how a number looks, not the lesson's advice about tax.",
  callouts: [{ n: 1, label: "Currency and date views can differ. This course does not set a tax format." }]
});
add(3, "formats", {
  type: "order",
  id: "excel-border-order",
  prompt: "Put these formatting steps in order.",
  items: [
    { id: "style", text: "Pick a border style" },
    { id: "open", text: "Open Borders" },
    { id: "select", text: "Select the cells" }
  ],
  correct: ["select", "open", "style"],
  pass: "Select the cells, open Borders, then pick a style."
});
add(3, "borders", {
  type: "check",
  id: "excel-borders-where",
  prompt: "Where does the lesson put Borders?",
  choices: [
    { id: "A", text: "Home tab, Font group" },
    { id: "B", text: "On the printed page only" }
  ],
  answer: "A",
  explain: "The lesson points to the Home tab for borders and fill."
});

add(4, "formulas", {
  type: "simulation",
  id: "excel-first-formula",
  title: "Write =B2+B3+B4",
  caption: "Practice screen — not the real Excel.",
  tools: [{ id: "formula", label: "Place =B2+B3+B4" }],
  steps: [{
    id: "s1",
    prompt: "Place the formula =B2+B3+B4.",
    hotspots: [{ id: "formula", label: "Place =B2+B3+B4" }],
    correct: ["formula"],
    pass: "That adds the three sample amounts. A simple formula starts with =.",
    fail: "Use the control that places =B2+B3+B4."
  }]
});
add(4, "formulas", {
  type: "workedExample",
  id: "excel-order-of-operations",
  title: "Order of operations",
  html: "<p>Microsoft's formula guidance, already used in this lesson, says multiplication happens before addition. The formula =5+2*3 multiplies 2 by 3 first, then adds 5.</p>"
});
add(4, "autosum", {
  type: "simulation",
  id: "excel-autosum",
  title: "Add a column with AutoSum",
  caption: "Practice screen — not the real Excel.",
  tools: [{ id: "AutoSum", label: "AutoSum" }],
  steps: [
    {
      id: "s1",
      prompt: "Tap cell B5, just under the numbers.",
      hotspots: [{ id: "B5", label: "Cell B5" }],
      correct: ["B5"],
      pass: "Good. AutoSum usually sits on the cell under a column of numbers.",
      fail: "B5 is the empty cell under 80, 45 and 25."
    },
    {
      id: "s2",
      prompt: "Tap AutoSum, then you would confirm it in the real program.",
      hotspots: [{ id: "AutoSum", label: "AutoSum" }],
      correct: ["AutoSum"],
      pass: "AutoSum can write =SUM(B2:B4) for those three amounts.",
      fail: "AutoSum is the labelled button."
    }
  ]
});
add(4, "autosum", {
  type: "annotatedImage",
  id: "excel-sum-figure",
  diagram: "sum",
  alt: "The formula bar shows =SUM(B2:B4) above the sample amounts.",
  callouts: [{ n: 1, label: "Formula bar showing =SUM(B2:B4)" }]
});
add(4, "formulas", {
  type: "check",
  id: "excel-equals",
  prompt: "Every simple Excel formula starts with:",
  choices: [
    { id: "A", text: "An equal sign (=)" },
    { id: "B", text: "A question mark" }
  ],
  answer: "A",
  explain: "The lesson says a simple formula begins with =."
});

add(5, "save", {
  type: "simulation",
  id: "excel-save-print",
  title: "Save, then look at a preview",
  caption: "Practice screen — not the real Excel.",
  tools: [
    { id: "Save", label: "Save" },
    { id: "Print", label: "Print preview" }
  ],
  steps: [
    {
      id: "s1",
      prompt: "Tap Save. In the real program, the first save asks where to put the file.",
      hotspots: [{ id: "Save", label: "Save" }],
      correct: ["Save"],
      pass: "Saving keeps the workbook. A practice name is expense-list-practice.",
      fail: "Save is the labelled control."
    },
    {
      id: "s2",
      prompt: "Tap Print preview.",
      hotspots: [{ id: "Print", label: "Print preview" }],
      correct: ["Print"],
      pass: "Look at the preview before you print on a shared printer.",
      fail: "Print preview is the other labelled control."
    }
  ]
});
add(5, "print", {
  type: "annotatedImage",
  id: "excel-print-figure",
  diagram: "print",
  alt: "A practice print preview named expense-list-practice.",
  callouts: [{ n: 1, label: "Preview before you print." }]
});
add(5, "print", {
  type: "order",
  id: "excel-save-print-order",
  prompt: "Put these save-and-print steps in order.",
  items: [
    { id: "print", text: "Print after you have checked the preview" },
    { id: "preview", text: "Look at the preview" },
    { id: "save", text: "Save the workbook with a clear name" }
  ],
  correct: ["save", "preview", "print"],
  pass: "Save first so you do not print an older version."
});
add(5, "save", {
  type: "check",
  id: "excel-autorecovery",
  prompt: "AutoRecovery is a substitute for saving the workbook.",
  choices: [
    { id: "A", text: "True" },
    { id: "B", text: "False" }
  ],
  answer: "B",
  explain: "The lesson says to save your own copy. AutoRecovery is not the same as Save."
});
add(5, "print", {
  type: "branch",
  id: "excel-print-unsaved",
  start: "n1",
  nodes: {
    n1: {
      text: "You have not saved. You want a paper copy. What do you do first?",
      choices: [
        { id: "print", label: "Print now", next: "n2" },
        { id: "save", label: "Save, then preview", next: "n3" }
      ]
    },
    n2: {
      text: "You might print an older copy, or lose the new numbers if the program closes. Go back and save first.",
      choices: [{ id: "back", label: "Try another choice", next: "n1" }]
    },
    n3: {
      text: "Save first, look at the preview, then print. This practice screen is not your printer.",
      end: true
    }
  }
});

const sheets = {
  1: ["A workbook is the Excel file.", "A sheet is a page in that file.", "A cell is one box.", "A1 is column A, row 1."],
  2: ["Click a cell, then type.", "Enter moves down.", "Tab moves right.", "Do not add a space after a number."],
  3: ["Select the cells first.", "Borders are on the Home tab.", "Fill colour can mark a header.", "A number format changes how a number looks."],
  4: ["A simple formula starts with =.", "Add with +, subtract with -, multiply with *, divide with /.", "AutoSum usually goes under a column of numbers.", "SUM(B2:B4) adds those three cells."],
  5: ["Ctrl+S saves.", "Ctrl+P opens print.", "Look at the preview first.", "On a shared printer, check the preview before you print."]
};
course.lessons.forEach((lesson) => {
  lesson.cheatSheet = {
    id: "excel-l" + lesson.number + "-sheet",
    title: lesson.title + " — take-home steps",
    items: sheets[lesson.number]
  };
});

const task = course.lessons.find((lesson) => lesson.number === 4);
task.assignment.tasks = [
  "Type the three sample amounts in B2, B3 and B4",
  "In B5, use AutoSum or type =SUM(B2:B4)",
  "Check that B5 shows 150"
];
task.assignment.answerKey = "<p>B5 should be 150, because 80 + 45 + 25 = 150.</p>";

course.comingSoon = [
  { number: 6, title: "Coming soon" },
  { number: 7, title: "Coming soon" },
  { number: 8, title: "Coming soon" },
  { number: 9, title: "Coming soon" },
  { number: 10, title: "Coming soon" }
];
course.badges = [
  { id: "first-formula", label: "Wrote a formula", when: { type: "simulationComplete", id: "excel-first-formula" } },
  { id: "final-pass", label: "Passed the final", when: { type: "finalPassed" } }
];
course.player = course.player || {};
course.player.hoursEstimate = null;
course.includes = ["practiceFile", "checks", "assignment", "cheatSheets", "final", "sampleCertificate"];

const extra = [
  {
    prompt: "The sample amounts 80, 45 and 25 add to 150.",
    choices: [{ id: "T", text: "True" }, { id: "F", text: "False" }],
    answer: "T",
    topic: "The sample total",
    review: "../lesson-4/"
  },
  {
    prompt: "A simple formula can start with a question mark.",
    choices: [{ id: "T", text: "True" }, { id: "F", text: "False" }],
    answer: "F",
    topic: "How a formula starts",
    review: "../lesson-4/"
  }
];
extra.forEach((question) => {
  const bank = course.finalExam.questions;
  if (!bank.some((item) => item.prompt === question.prompt)) bank.push(question);
});

fs.writeFileSync(coursePath, JSON.stringify(course, null, 2) + "\n");
console.log("Excel showcase blocks attached.");
