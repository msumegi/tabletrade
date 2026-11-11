/**
 * Course-player block renderers.
 *
 * Add a block type by registering a function in `renderers`.
 * The course JSON then uses `{ "type": "your-type", ...fields }`.
 * Unknown types are skipped and reported by the build.
 */
export function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function prose(block) {
  return `<div class="block" data-block="prose">${block.html || ""}</div>`;
}

function example(block) {
  const steps = (block.steps || [])
    .map((step) => "<li>" + esc(step) + "</li>")
    .join("");
  return `<aside class="block block-example" data-block="example">
  <h3>${esc(block.title || "Worked example")}</h3>
  <p class="block-label">Problem</p>
  <p>${esc(block.problem || "")}</p>
  <p class="block-label">Steps</p>
  <ol>${steps}</ol>
  <p class="block-label">Result</p>
  <p>${esc(block.result || "")}</p>
</aside>`;
}

function assignment(block, ctx) {
  const id = block.id || "lesson-" + (ctx.lessonNumber || 1) + "-task";
  const tasks = (block.tasks || []).map((task) => "<li>" + esc(task) + "</li>").join("");
  const body = (block.instructions || block.html || "") + (tasks ? "<ol>" + tasks + "</ol>" : "");
  const answer = block.answerKey || block.selfCheck || "";
  return `<section class="block block-assignment" data-block="assignment" data-block-id="${esc(id)}" id="${esc(id)}">
  <h2>${esc(block.title || "Assignment")}</h2>
  <p class="block-prompt">Try this before you open the sample answer.</p>
  <div class="block-body">${body}</div>
  <p class="actions"><button type="button" class="btn" data-assignment-done="${esc(id)}">I tried this</button></p>
  <p class="block-status" data-assignment-status="${esc(id)}">Not marked done yet.</p>
  ${check({ title: "Show a sample answer", body: answer, prompt: "The sample answer stays closed until you open it." })}
</section>`;
}

function check(block) {
  if (block.choices && block.choices.length) {
    const choices = block.choices
      .map((choice) => `<label class="option"><input type="radio" name="${esc(block.id || "check")}" value="${esc(choice.id)}"> <span>${esc(choice.text)}</span></label>`)
      .join("");
    const key = JSON.stringify({ answer: block.answer || "", explain: block.explain || "" });
    return `<form class="block block-instant" data-block="check" data-check="${esc(block.id || "")}" id="${esc(block.id || "")}">
  <fieldset class="q"><legend>${esc(block.prompt || "")}</legend>${choices}</fieldset>
  <p class="actions"><button type="submit" class="btn">Check my answer</button></p>
  <p class="feedback" role="status" hidden></p>
  <script type="application/json" class="check-key">${key}</script>
</form>`;
  }
  const body = block.body || block.html || "";
  return `<aside class="block block-check" data-block="check">
  <p class="block-prompt">${esc(block.prompt || "Try it first.")}</p>
  <details>
    <summary>${esc(block.title || "Show the check")}</summary>
    <div class="block-body">${body}</div>
  </details>
</aside>`;
}

function marker(n, x, y) {
  return `<circle cx="${x}" cy="${y}" r="11" fill="#123c2e"/><text x="${x}" y="${y + 4}" text-anchor="middle" fill="#fff" font-size="12" font-family="Georgia, serif">${n}</text>`;
}

function svgWrap(body) {
  return `<svg viewBox="0 0 360 220" role="img" width="100%">${body}</svg>`;
}

function sceneSvg(block) {
  const id = block.id || "";
  const ink = "#1b1914";
  const line = "#123c2e";
  if (id === "word-window-parts") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="16" y="16" width="328" height="22" fill="#e7f0eb" stroke="${line}"/>
      <text x="24" y="31" font-size="12" fill="${ink}">hall-booking — Word</text>
      <text x="250" y="31" font-size="11" fill="${ink}">Save Undo</text>
      <text x="24" y="54" font-size="12" fill="${ink}">File</text>
      <text x="70" y="54" font-size="12" fill="${ink}">Home</text>
      <rect x="16" y="64" width="328" height="120" fill="#fff" stroke="${line}"/>
      <text x="28" y="90" font-size="13" fill="${ink}">Type here</text>
      <text x="300" y="200" font-size="12" fill="${ink}">100%</text>
      ${marker(1, 200, 16)}${marker(2, 300, 16)}${marker(3, 40, 48)}${marker(4, 110, 48)}${marker(5, 180, 100)}${marker(6, 330, 200)}`);
  }
  if (id === "word-header-margins") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="50" y="24" width="260" height="172" fill="none" stroke="${line}" stroke-dasharray="4 3"/>
      <rect x="70" y="40" width="220" height="140" fill="#fff" stroke="${line}"/>
      <text x="80" y="58" font-size="11" fill="${ink}">Community notice — practice</text>
      <text x="80" y="86" font-size="14" fill="${ink}">Saturday market</text>
      <text x="250" y="168" font-size="12" fill="${ink}">1</text>
      ${marker(1, 40, 110)}${marker(2, 200, 36)}${marker(3, 280, 168)}${marker(4, 160, 90)}`);
  }
  if (id === "word-alt-text") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="20" y="30" width="150" height="100" fill="#e7f0eb" stroke="${line}"/>
      <text x="36" y="84" font-size="12" fill="${ink}">Hall photo</text>
      <rect x="190" y="30" width="150" height="120" fill="#fff" stroke="${line}"/>
      <text x="200" y="54" font-size="12" fill="${ink}">Alt text</text>
      <text x="200" y="78" font-size="11" fill="${ink}">Ramp beside the door</text>
      <text x="200" y="130" font-size="11" fill="${ink}">Decorative</text>
      ${marker(1, 90, 24)}${marker(2, 320, 50)}${marker(3, 320, 130)}`);
  }
  if (id === "outlook-window-parts") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="28" font-size="12" fill="${ink}">Mail</text>
      <text x="70" y="28" font-size="12" fill="${ink}">Calendar</text>
      <text x="140" y="28" font-size="12" fill="${ink}">People</text>
      <text x="200" y="28" font-size="12" fill="${ink}">Tasks</text>
      <rect x="16" y="40" width="90" height="160" fill="#e7f0eb" stroke="${line}"/>
      <text x="24" y="64" font-size="12" fill="${ink}">Inbox</text>
      <rect x="114" y="40" width="110" height="160" fill="#fff" stroke="${line}"/>
      <text x="122" y="64" font-size="11" fill="${ink}">Jordan</text>
      <rect x="232" y="40" width="112" height="160" fill="#fff" stroke="${line}"/>
      <text x="240" y="64" font-size="11" fill="${ink}">Reading</text>
      ${marker(1, 36, 16)}${marker(2, 100, 16)}${marker(3, 160, 16)}${marker(4, 230, 16)}${marker(5, 50, 70)}${marker(6, 280, 80)}`);
  }
  if (id === "outlook-phishing-signs") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="36" font-size="12" fill="${ink}">From: acc0unts@mail.test</text>
      <text x="16" y="68" font-size="12" fill="${ink}">Subject: Account Rest</text>
      <text x="16" y="110" font-size="12" fill="${ink}">Act in 24 hours or we close it</text>
      <text x="16" y="150" font-size="12" fill="${ink}">Do not call the number on your card</text>
      ${marker(1, 330, 32)}${marker(2, 330, 64)}${marker(3, 330, 106)}${marker(4, 330, 146)}`);
  }
  if (id === "jobsearch-search-parts") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="28" font-size="14" fill="${ink}">Job Bank</text>
      <rect x="16" y="40" width="200" height="28" fill="#fff" stroke="${line}"/>
      <text x="24" y="58" font-size="12" fill="${ink}">Job title</text>
      <rect x="16" y="78" width="200" height="28" fill="#fff" stroke="${line}"/>
      <text x="24" y="96" font-size="12" fill="${ink}">Place</text>
      <text x="16" y="140" font-size="12" fill="${ink}">Hours</text>
      <text x="80" y="140" font-size="12" fill="${ink}">Benefits</text>
      <text x="160" y="140" font-size="12" fill="${ink}">Salary</text>
      ${marker(1, 240, 54)}${marker(2, 240, 92)}${marker(3, 40, 150)}`);
  }
  if (id === "jobsearch-posting-parts") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="36" font-size="14" fill="${ink}">Weekend Attendant</text>
      <text x="16" y="58" font-size="12" fill="${ink}">Sampletown Community Centre</text>
      <text x="16" y="90" font-size="12" fill="${ink}">Weekends · Sampletown</text>
      <text x="16" y="122" font-size="12" fill="${ink}">Greet visitors · set up tables</text>
      <text x="16" y="164" font-size="12" fill="${ink}">How to apply · sample closing date</text>
      ${marker(1, 320, 40)}${marker(2, 320, 86)}${marker(3, 320, 118)}${marker(4, 320, 160)}`);
  }
  if (id === "phones-parts-of-screen") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="16" y="18" width="110" height="184" rx="14" fill="#f4efe4" stroke="${line}" stroke-width="2"/>
      <rect x="28" y="36" width="86" height="120" fill="#fff" stroke="${line}"/>
      <circle cx="71" cy="176" r="8" fill="none" stroke="${line}" stroke-width="2"/>
      <rect x="150" y="48" width="190" height="120" rx="6" fill="#f4efe4" stroke="${line}" stroke-width="2"/>
      <rect x="162" y="60" width="166" height="78" fill="#fff" stroke="${line}"/>
      <rect x="162" y="146" width="166" height="14" fill="#e7f0eb" stroke="${line}"/>
      <text x="40" y="100" font-size="12" fill="${ink}">Screen</text>
      ${marker(1, 96, 52)}${marker(2, 48, 52)}${marker(3, 71, 176)}${marker(4, 250, 160)}`);
  }
  if (id === "phones-gestures") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="110" y="12" width="140" height="196" rx="16" fill="#f4efe4" stroke="${line}" stroke-width="2"/>
      <rect x="124" y="32" width="112" height="140" fill="#fff" stroke="${line}"/>
      <text x="148" y="90" font-size="13" fill="${ink}">Tap</text>
      <text x="140" y="112" font-size="12" fill="${ink}">Scroll</text>
      <rect x="124" y="178" width="34" height="16" fill="#fff" stroke="${line}"/>
      <rect x="162" y="178" width="34" height="16" fill="#fff" stroke="${line}"/>
      <rect x="200" y="178" width="36" height="16" fill="#fff" stroke="${line}"/>
      ${marker(1, 168, 70)}${marker(2, 200, 120)}${marker(3, 180, 160)}${marker(4, 124, 100)}${marker(5, 180, 186)}`);
  }
  if (id === "phones-app-stores") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="18" y="16" width="150" height="188" rx="14" fill="#f4efe4" stroke="${line}" stroke-width="2"/>
      <text x="36" y="48" font-size="14" fill="${ink}">Play Store</text>
      <rect x="36" y="64" width="114" height="28" fill="#fff" stroke="${line}"/>
      <text x="44" y="82" font-size="12" fill="${ink}">Search</text>
      <text x="36" y="120" font-size="12" fill="${ink}">Install</text>
      <text x="190" y="48" font-size="14" fill="${ink}">Settings</text>
      <text x="190" y="78" font-size="13" fill="${ink}">System</text>
      <text x="190" y="102" font-size="13" fill="${ink}">Software updates</text>
      <text x="190" y="140" font-size="13" fill="${ink}">Permissions</text>
      ${marker(1, 140, 78)}${marker(2, 150, 40)}${marker(3, 330, 96)}${marker(4, 330, 140)}`);
  }
  if (id === "phones-compose-message") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="24" y="16" width="312" height="188" rx="8" fill="#f4efe4" stroke="${line}" stroke-width="2"/>
      <text x="40" y="48" font-size="14" fill="${ink}">To</text>
      <rect x="80" y="32" width="200" height="24" fill="#fff" stroke="${line}"/>
      <text x="40" y="88" font-size="14" fill="${ink}">Subject</text>
      <rect x="110" y="70" width="170" height="24" fill="#fff" stroke="${line}"/>
      <rect x="40" y="108" width="240" height="70" fill="#fff" stroke="${line}"/>
      <text x="52" y="132" font-size="13" fill="${ink}">Message</text>
      <rect x="250" y="160" width="64" height="28" rx="6" fill="${line}"/>
      <text x="266" y="178" font-size="13" fill="#fff">Send</text>
      ${marker(1, 300, 44)}${marker(2, 300, 82)}${marker(3, 250, 130)}${marker(4, 282, 154)}`);
  }
  if (id === "excel-formula-bar") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="16" y="16" width="328" height="36" fill="#e7f0eb" stroke="${line}"/>
      <text x="28" y="40" font-size="14" fill="${ink}">Home</text>
      <rect x="16" y="60" width="64" height="28" fill="#fff" stroke="${line}"/>
      <text x="28" y="78" font-size="13" fill="${ink}">A1</text>
      <rect x="88" y="60" width="256" height="28" fill="#fff" stroke="${line}"/>
      <text x="100" y="78" font-size="13" fill="${ink}">formula bar</text>
      <rect x="16" y="100" width="328" height="100" fill="#fff" stroke="${line}"/>
      <text x="40" y="140" font-size="13" fill="${ink}">A</text>
      <text x="90" y="140" font-size="13" fill="${ink}">B</text>
      ${marker(1, 70, 34)}${marker(2, 48, 74)}${marker(3, 320, 74)}`);
  }
  if (id === "excel-number-formats") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="20" y="36" font-size="16" fill="${ink}">Home · Number</text>
      <rect x="20" y="52" width="200" height="150" fill="#fff" stroke="${line}"/>
      <text x="36" y="80" font-size="14" fill="${ink}">General</text>
      <text x="36" y="108" font-size="14" fill="${ink}">Currency</text>
      <text x="36" y="136" font-size="14" fill="${ink}">Date</text>
      <text x="36" y="164" font-size="14" fill="${ink}">Percentage</text>
      ${marker(1, 240, 76)}${marker(2, 240, 108)}${marker(3, 240, 136)}${marker(4, 240, 164)}`);
  }
  if (id === "excel-sum-formula-bar") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <rect x="16" y="12" width="328" height="28" fill="#fff" stroke="${line}"/>
      <text x="28" y="31" font-size="14" fill="${ink}">=SUM(B2:B8)</text>
      <text x="40" y="64" font-size="13" fill="${ink}">A</text><text x="110" y="64" font-size="13" fill="${ink}">B</text>
      <text x="24" y="88" font-size="13" fill="${ink}">2 Mon</text><text x="110" y="88" font-size="13" fill="${ink}">6</text>
      <text x="24" y="110" font-size="13" fill="${ink}">3 Tue</text><text x="110" y="110" font-size="13" fill="${ink}">4</text>
      <text x="24" y="132" font-size="13" fill="${ink}">4 Wed</text><text x="110" y="132" font-size="13" fill="${ink}">7.5</text>
      <text x="24" y="176" font-size="13" fill="${ink}">9 Total</text><text x="100" y="176" font-size="13" fill="${ink}">25.5</text>
      ${marker(1, 330, 26)}${marker(2, 160, 176)}${marker(3, 200, 110)}`);
  }
  if (id === "excel-relative-vs-absolute") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="28" font-size="13" fill="${ink}">Without $</text>
      <text x="16" y="52" font-size="13" fill="${ink}">E2 =C2*H1</text>
      <text x="16" y="76" font-size="13" fill="${ink}">E3 =C3*H2</text>
      <text x="190" y="28" font-size="13" fill="${ink}">With $H$1</text>
      <text x="190" y="52" font-size="13" fill="${ink}">E2 =C2*$H$1</text>
      <text x="190" y="76" font-size="13" fill="${ink}">E3 =C3*$H$1</text>
      ${marker(1, 150, 64)}${marker(2, 340, 64)}`);
  }
  if (id === "excel-print-preview-figure") {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="16" y="32" font-size="14" fill="${ink}">File &gt; Print</text>
      <rect x="140" y="24" width="200" height="150" fill="#fff" stroke="${line}" stroke-width="2"/>
      <text x="160" y="70" font-size="14" fill="${ink}">Hours preview</text>
      <text x="160" y="96" font-size="13" fill="${ink}">Mon 6</text>
      <text x="160" y="150" font-size="13" fill="${ink}">Next page</text>
      ${marker(1, 110, 28)}${marker(2, 320, 40)}${marker(3, 300, 190)}`);
  }
  if (/^word-/.test(id)) {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="20" y="36" font-size="16" fill="${ink}">Word</text>
      <rect x="20" y="52" width="320" height="148" fill="#fff" stroke="${line}"/>
      <text x="36" y="84" font-size="14" fill="${ink}">Document</text>
      <text x="36" y="112" font-size="13" fill="${ink}">Heading</text>
      <text x="36" y="140" font-size="13" fill="${ink}">Body text</text>
      ${marker(1, 250, 36)}${marker(2, 200, 84)}${marker(3, 200, 140)}`);
  }
  if (/^jobsearch-/.test(id)) {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="20" y="36" font-size="16" fill="${ink}">Sample posting</text>
      <text x="20" y="68" font-size="13" fill="${ink}">Weekend Attendant</text>
      <text x="20" y="96" font-size="13" fill="${ink}">Hours: weekends</text>
      <text x="20" y="124" font-size="13" fill="${ink}">How to apply</text>
      <text x="20" y="152" font-size="13" fill="${ink}">Closing date</text>
      ${marker(1, 280, 64)}${marker(2, 280, 96)}${marker(3, 280, 124)}${marker(4, 280, 152)}`);
  }
  if (/^outlook-/.test(id)) {
    return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
      <text x="20" y="36" font-size="16" fill="${ink}">Outlook</text>
      <rect x="20" y="52" width="90" height="148" fill="#e7f0eb" stroke="${line}"/>
      <text x="32" y="80" font-size="13" fill="${ink}">Mail</text>
      <text x="32" y="108" font-size="13" fill="${ink}">Calendar</text>
      <rect x="124" y="52" width="216" height="148" fill="#fff" stroke="${line}"/>
      <text x="140" y="84" font-size="13" fill="${ink}">To</text>
      <text x="140" y="112" font-size="13" fill="${ink}">Subject</text>
      ${marker(1, 96, 76)}${marker(2, 96, 108)}${marker(3, 300, 84)}`);
  }
  return svgWrap(`<rect width="360" height="220" fill="#fffdf8"/>
    <rect x="16" y="16" width="328" height="188" rx="6" fill="#f7f3ea" stroke="${line}" stroke-width="2"/>
    <text x="28" y="40" font-size="14" fill="${ink}">Workbook</text>
    <rect x="28" y="56" width="70" height="24" fill="#fff" stroke="${line}"/>
    <text x="40" y="72" font-size="13" fill="${ink}">A1</text>
    <rect x="28" y="96" width="280" height="70" fill="#fff" stroke="${line}"/>
    <text x="48" y="124" font-size="13" fill="${ink}">A</text>
    <text x="100" y="124" font-size="13" fill="${ink}">B</text>
    <rect x="28" y="174" width="72" height="20" fill="#123c2e"/>
    <text x="36" y="188" font-size="12" fill="#fff">Hours</text>
    <rect x="104" y="174" width="80" height="20" fill="#fff" stroke="${line}"/>
    <text x="112" y="188" font-size="12" fill="${ink}">Household</text>
    ${marker(1, 300, 36)}${marker(2, 20, 160)}${marker(3, 118, 68)}`);
}

function annotatedImage(block) {
  const calls = (block.callouts || [])
    .map((item) => `<li>${esc(item.label)}</li>`)
    .join("");
  return `<figure class="block block-figure" data-block="annotatedImage" id="${esc(block.id || "")}">
  <div class="stage">${sceneSvg(block)}</div>
  <p class="caption">${esc(block.alt || "")}</p>
  <figcaption><ol class="callouts">${calls}</ol></figcaption>
</figure>`;
}

function hoursGrid() {
  return [
    ["", "A", "B", "C", "D", "E"],
    ["1", "Day", "Hours", "", "", ""],
    ["2", "Mon", "6", "", "", ""],
    ["3", "Tue", "4", "", "", ""],
    ["4", "Wed", "7.5", "", "", ""],
    ["5", "Thu", "0", "", "", ""],
    ["6", "Fri", "5", "", "", ""],
    ["7", "Sat", "3", "", "", ""],
    ["8", "Sun", "0", "", "", ""],
    ["9", "Total", "", "", "", ""]
  ];
}

function blankGrid() {
  return [
    ["", "A", "B", "C"],
    ["1", "", "", ""],
    ["2", "", "", ""],
    ["3", "", "", ""],
    ["4", "", "", ""]
  ];
}

function sheetTable(rows) {
  return `<div class="sheet-scroll"><table class="sheet">${rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          if (r === 0 || c === 0) return `<th>${esc(cell)}</th>`;
          const ref = String.fromCharCode(64 + c) + r;
          return `<td data-cell="${ref}"><button type="button" data-hotspot="${ref}" aria-label="Cell ${ref}"><span data-cell-value>${esc(cell)}</span></button></td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("")}</table></div>`;
}

function controlLabel(spot) {
  const raw = spot.label || spot.id;
  if (/looks fine/i.test(raw)) return "Print";
  if (/if it appears|if you see/i.test(raw)) return "English (Canada)";
  return raw;
}

function hotspotButtons(spots) {
  return spots
    .map(
      (spot) =>
        `<button type="button" class="btn btn-secondary" data-hotspot="${esc(spot.id)}">${esc(controlLabel(spot))}</button>`
    )
    .join("");
}

function frameKind(block) {
  const blob = (block.id || "") + " " + (block.app || "") + " " + (block.caption || "");
  if (/first-formula|autosum|enter-tab|enter-text/.test(block.id || "")) return "sheet";
  if (/browser/.test(blob)) return "browser";
  if (/computer|explorer/.test(blob) || /not the real computer/.test(block.caption || "")) return "computer";
  if (/phone|android/.test(blob) || /not the real phone/.test(block.caption || "")) return "phone";
  if (/not the real Word|\bword-/.test(blob)) return "word";
  if (/not the real Outlook|outlook-/.test(blob)) return "outlook";
  if (/Job Bank|jobsearch-|not the real Job Bank/.test(blob)) return "job";
  return "excel";
}

function simulation(block) {
  const kind = frameKind(block);
  const names = { phone: "phone", computer: "computer", browser: "browser", word: "Word", outlook: "Outlook", job: "Job Bank", excel: "Excel", sheet: "Excel" };
  const caption = block.caption || ("Practice screen — not the real " + (names[kind] || "Excel") + ".");
  const title = names[kind] || "Excel";
  const steps = (block.steps || []).map((step) => {
    const copy = {
      id: step.id,
      prompt: step.prompt,
      pass: step.pass,
      fail: step.fail,
      correct: step.correct || []
    };
    if (block.id === "excel-first-formula" && step.id === "s4") copy.sequence = ["plus", "B3", "plus", "B4", "enter"];
    return copy;
  });
  const spots = [];
  const seen = {};
  (block.steps || []).forEach((step) => {
    (step.hotspots || []).forEach((spot) => {
      if (seen[spot.id]) return;
      seen[spot.id] = true;
      spots.push(spot);
    });
  });
  if (block.id === "excel-first-formula") {
    ["plus", "B3"].forEach((id) => {
      if (!seen[id]) spots.push({ id, label: id === "plus" ? "+" : "Cell B3" });
    });
  }
  let stage = "";
  const config = { id: block.id, kind, steps, values: {}, start: "A1" };
  if (kind === "word" || kind === "outlook" || kind === "job") {
    const buttons = hotspotButtons(spots);
    const word = `<div class="word-page">
      <p class="doc-header" data-slot="header" hidden>Community notice — practice</p>
      <p class="doc-title" data-slot="title">Saturday market at the community centre</p>
      <p data-slot="sent1">The hall is open on Saturday.</p>
      <p data-slot="body">Please bring your own bags.</p>
      <ul data-slot="list" hidden><li>Own bags</li><li>Small bills</li><li>A reusable cup</li></ul>
      <table class="mini-table" data-slot="table" hidden><tr><th>Day</th><th>Hours</th></tr><tr><td>Saturday</td><td>10 a.m.–1 p.m.</td></tr></table>
      <p data-slot="proof" hidden></p>
      <p data-slot="pagenum" hidden>Page 1</p>
      <p data-slot="preview" hidden>Preview: the page fits on one sheet.</p>
    </div>`;
    const outlook = `<div class="ol-split">
      <ul class="ol-list"><li data-slot="msg">Saturday hall setup — Jordan</li><li data-slot="folder" hidden>Saturday market</li></ul>
      <div class="ol-pane">
        <p data-slot="reading">Jordan: Can you help set up tables on Saturday?</p>
        <p data-slot="mail" hidden>Mail is open.</p>
        <p data-slot="calendar" hidden>Calendar is open.</p>
        <p data-slot="compose" hidden>New message</p>
        <p>To <strong data-field="to"></strong></p>
        <p>Cc <strong data-field="cc"></strong></p>
        <p>Subject <strong data-field="subject"></strong></p>
        <p data-field="body"></p>
        <p data-slot="attached" hidden>Attached: saturday-chairs-practice</p>
        <p data-slot="sent" hidden></p>
        <p data-slot="appt" hidden>Appointment: Review Saturday market notes</p>
        <p data-slot="contact" hidden>Contact: Jordan Lee</p>
      </div>
    </div>`;
    const jobCompose = block.id === "jobsearch-cover-email"
      ? `<div class="ol-pane"><p>To <strong data-field="to"></strong></p><p>Subject <strong data-field="subject"></strong></p><p data-field="body"></p></div>`
      : "";
    const job = `<div class="job-form"><p>Job title <strong data-field="title"></strong></p><p>Place <strong data-field="place"></strong></p></div>
      <ul class="job-results"><li data-job="match">Weekend Attendant — Sampletown — weekends</li><li data-job="other">Weekday clerk — weekdays only</li></ul>
      <article data-slot="posting"><p>Sampletown Community Centre. Greet visitors and set up tables. First aid is an asset, not required. Sample only.</p></article>
      ${jobCompose}`;
    const body = kind === "word" ? word : kind === "outlook" ? outlook : job;
    stage = `<div class="practice-window" data-app="${kind}">
      <div class="pw-bar"><strong>${esc(title)}</strong> <span data-doc-name>${kind === "word" ? "Document1" : ""}</span></div>
      ${body}
      <div class="sheet-keys">${buttons}</div>
      <p class="pw-status" data-sim-status></p>
    </div>`;
  } else if (kind === "sheet") {
    const rows = /enter-tab|enter-text/.test(block.id || "") ? blankGrid() : hoursGrid();
    rows.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (r === 0 || c === 0 || cell === "") return;
        config.values[String.fromCharCode(64 + c) + r] = cell;
      });
    });
    if (block.id === "excel-first-formula") config.finish = { cell: "E2", value: "17.5", formula: "=B2+B3+B4" };
    if (block.id === "excel-autosum") config.finish = { cell: "B9", value: "25.5", formula: "=SUM(B2:B8)" };
    const keys = [];
    const need = new Set(spots.map((spot) => spot.id));
    if (need.has("equals") || block.id === "excel-first-formula") keys.push(["equals", "="]);
    if (need.has("plus") || block.id === "excel-first-formula") keys.push(["plus", "+"]);
    if (need.has("enter") || kind === "sheet") keys.push(["enter", "Enter"]);
    if (need.has("tab")) keys.push(["tab", "Tab"]);
    if (need.has("autosum")) keys.push(["autosum", "AutoSum"]);
    const keyHtml = keys
      .map(([id, label]) => `<button type="button" class="btn btn-secondary" data-hotspot="${id}">${label}</button>`)
      .join("");
    stage = `<div class="practice-window">
      <div class="pw-bar"><strong>${esc(title)}</strong></div>
      <div class="formula-bar"><span data-name-box>A1</span><span data-formula-input></span></div>
      ${sheetTable(rows)}
      <div class="sheet-keys">${keyHtml}</div>
      <p class="pw-status" data-sim-status></p>
    </div>`;
  } else {
    const buttons = hotspotButtons(spots);
    const reveal = block.id === "excel-blank-workbook" ? `<div data-empty-grid hidden>${sheetTable(blankGrid())}</div>` : "";
    if (block.id === "excel-blank-workbook") config.revealGrid = true;
    stage = `<div class="practice-window">
      <div class="pw-bar"><strong>${esc(title)}</strong></div>
      <div class="pw-scroll">
        <p class="pw-status" data-sim-status></p>
        <div class="pw-menu" data-sim-menu>${buttons}</div>
        ${reveal}
      </div>
    </div>`;
  }
  return `<section class="block block-sim" data-block="simulation" data-sim="${esc(block.id || "")}" id="${esc(block.id || "")}">
  <h3>${esc(block.title || "Practice screen")}</h3>
  <p class="caption">${esc(caption)}</p>
  ${stage}
  <p data-sim-prompt></p>
  <p class="feedback" data-sim-feedback role="status"></p>
  <p class="actions"><button type="button" class="btn btn-secondary" data-sim-show>Show me where</button></p>
  <script type="application/json" class="sim-key">${JSON.stringify(config)}</script>
</section>`;
}

function order(block) {
  const items = (block.items || [])
    .map((item) => `<li class="order-row" data-order-item="${esc(item.id)}"><span>${esc(item.text)}</span> <button type="button" class="btn btn-secondary" data-move="up">Move up</button> <button type="button" class="btn btn-secondary" data-move="down">Move down</button></li>`)
    .join("");
  const key = JSON.stringify({ correct: block.correct || [], pass: block.pass || "" });
  return `<section class="block" data-block="order" data-order="${esc(block.id || "")}" id="${esc(block.id || "")}">
  <h3>${esc(block.prompt || "Put these steps in order.")}</h3>
  <ol data-order-list>${items}</ol>
  <p class="actions"><button type="button" class="btn" data-order-check>Check the order</button></p>
  <p class="feedback" role="status" hidden></p>
  <script type="application/json" class="order-key">${key}</script>
</section>`;
}

function branch(block) {
  const nodes = Object.keys(block.nodes || {})
    .map((id) => {
      const node = block.nodes[id];
      const text = node.text || node.prompt || node.result || "";
      const choices = (node.choices || [])
        .map((choice) => `<button type="button" class="btn branch-choice" data-next="${esc(choice.next || "")}">${esc(choice.label || choice.text || "")}</button>`)
        .join("");
      return `<div data-branch-node="${esc(id)}" hidden><p>${esc(text)}</p><div class="actions">${choices}</div></div>`;
    })
    .join("");
  return `<section class="block" data-block="branch" data-branch="${esc(block.id || "")}" data-start="${esc(block.start || "")}" id="${esc(block.id || "")}">${nodes}<p class="actions"><button type="button" class="btn btn-secondary" data-branch-back>Back</button></p></section>`;
}

function workedExample(block) {
  const problem = block.problem || "";
  const steps = block.steps || [];
  const result = block.result || "";
  if (problem || steps.length || result) {
    const items = steps.map((step) => "<li>" + step + "</li>").join("");
    return `<aside class="block block-example" data-block="workedExample"><h3>${esc(block.title || "Worked example")}</h3>
      ${problem ? `<p class="block-label">Problem</p><div class="block-body"><p>${problem}</p></div>` : ""}
      ${items ? `<p class="block-label">Steps</p><ol>${items}</ol>` : ""}
      ${result ? `<p class="block-label">Result</p><div class="block-body"><p>${result}</p></div>` : ""}
    </aside>`;
  }
  if (block.html) {
    return `<aside class="block block-example" data-block="workedExample"><h3>${esc(block.title || "Worked example")}</h3><div class="block-body">${block.html}</div></aside>`;
  }
  return example(block);
}

function download(block) {
  return `<p class="block file-list" data-block="download"><a class="btn" href="${esc(block.href || "")}" download>${esc(block.label || block.name || "Download the practice file")}</a> <span class="meta">${esc(block.note || "Sample file. Not private data.")}</span></p>`;
}

function cheatSheet(block) {
  const items = (block.items || []).map((item) => "<li>" + esc(item) + "</li>").join("");
  return `<aside class="cheat-sheet block" data-block="cheatSheet" id="${esc(block.id || "cheat-sheet")}"><h2>${esc(block.title || "Take-home steps")}</h2><ul>${items}</ul><p class="actions no-print"><button type="button" class="btn btn-secondary" data-print-cheat>Print this cheat sheet</button></p></aside>`;
}

function readAloudButton() {
  return `<p class="actions no-print"><button type="button" class="btn btn-secondary" data-listen hidden>Listen to this section</button></p>`;
}

export const renderers = {
  prose,
  example,
  workedExample,
  assignment,
  check,
  annotatedImage,
  simulation,
  order,
  branch,
  download,
  cheatSheet
};

export function renderBlock(block, ctx) {
  const type = block && block.type ? block.type : "prose";
  const render = renderers[type];
  if (!render) {
    return { html: "", unknown: type };
  }
  return { html: render(block, ctx || {}), unknown: "" };
}

export function renderBlocks(blocks, ctx) {
  const unknown = [];
  const html = (blocks || [])
    .map((block) => {
      const rendered = renderBlock(block, ctx);
      if (rendered.unknown) unknown.push(rendered.unknown);
      return rendered.html;
    })
    .join("\n");
  return { html, unknown };
}
