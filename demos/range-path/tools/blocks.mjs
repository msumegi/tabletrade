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

function diagram(kind) {
  if (kind === "print") {
    return `<svg viewBox="0 0 320 140" role="img" width="100%"><rect width="320" height="140" fill="#fffdf8"/><rect x="16" y="16" width="200" height="108" fill="none" stroke="#123c2e" stroke-width="2"/><text x="28" y="48" fill="#1b1914" font-size="14">Preview</text><text x="28" y="76" fill="#1b1914" font-size="14">expense-list-practice</text><circle cx="250" cy="40" r="12" fill="#123c2e"/><text x="246" y="45" fill="#fff" font-size="12">1</text><text x="230" y="90" fill="#1b1914" font-size="12">Print</text></svg>`;
  }
  if (kind === "sum") {
    return `<svg viewBox="0 0 320 160" role="img" width="100%"><rect width="320" height="160" fill="#fffdf8"/><text x="16" y="28" fill="#1b1914" font-size="14">=SUM(B2:B4)</text><rect x="16" y="44" width="70" height="28" fill="#e7f0eb" stroke="#123c2e"/><text x="28" y="63" font-size="13" fill="#1b1914">Item</text><rect x="86" y="44" width="70" height="28" fill="#e7f0eb" stroke="#123c2e"/><text x="96" y="63" font-size="13" fill="#1b1914">Amount</text><text x="28" y="100" font-size="13" fill="#1b1914">Fuel</text><text x="100" y="100" font-size="13" fill="#1b1914">80</text><text x="28" y="122" font-size="13" fill="#1b1914">Feed</text><text x="100" y="122" font-size="13" fill="#1b1914">45</text><text x="28" y="144" font-size="13" fill="#1b1914">Supplies</text><text x="100" y="144" font-size="13" fill="#1b1914">25</text><circle cx="250" cy="28" r="12" fill="#123c2e"/><text x="246" y="33" fill="#fff" font-size="12">1</text></svg>`;
  }
  return `<svg viewBox="0 0 320 150" role="img" width="100%"><rect width="320" height="150" fill="#fffdf8"/><rect x="70" y="36" width="60" height="28" fill="#e7f0eb" stroke="#123c2e"/><text x="88" y="55" font-size="13" fill="#1b1914">A1</text><text x="16" y="24" font-size="13" fill="#1b1914">Sheet</text><circle cx="250" cy="36" r="12" fill="#123c2e"/><text x="246" y="41" fill="#fff" font-size="12">1</text></svg>`;
}

function annotatedImage(block) {
  const calls = (block.callouts || [])
    .map((item) => `<li><span class="badge">${esc(item.n)}</span> ${esc(item.label)}</li>`)
    .join("");
  const picture = block.src
    ? `<img src="${esc(block.src)}" alt="${esc(block.alt || "")}">`
    : diagram(block.diagram || "grid");
  return `<figure class="block block-figure" data-block="annotatedImage" id="${esc(block.id || "")}">
  <div class="stage">${picture}</div>
  ${block.src ? "" : `<p class="caption">${esc(block.alt || "")}</p>`}
  <figcaption><ol class="callouts">${calls}</ol></figcaption>
</figure>`;
}

function simulation(block) {
  const rows = block.rows || [
    ["", "A", "B"],
    ["1", "Item", "Amount"],
    ["2", "Fuel", "80"],
    ["3", "Feed", "45"],
    ["4", "Supplies", "25"],
    ["5", "", ""]
  ];
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const ref = r === 0 || c === 0 ? "" : String.fromCharCode(64 + c) + r;
          if (!ref) return `<th>${esc(cell)}</th>`;
          return `<td><button type="button" data-hotspot="${esc(ref)}" aria-label="${esc(ref)}">${esc(cell)}</button></td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");
  const tools = (block.tools || [])
    .map((tool) => `<button type="button" class="btn btn-secondary" data-hotspot="${esc(tool.id)}">${esc(tool.label)}</button>`)
    .join("");
  const config = JSON.stringify({
    id: block.id,
    steps: block.steps || [],
    fallback: block.fallback || "list"
  });
  return `<section class="block block-sim" data-block="simulation" data-sim="${esc(block.id || "")}" id="${esc(block.id || "")}">
  <h3>${esc(block.title || "Practice screen")}</h3>
  <p class="caption">${esc(block.caption || "Practice screen — not the real program.")}</p>
  <div class="ribbon">${tools}</div>
  <div class="stage"><table class="sheet">${body}</table><p class="caption">Swipe inside the frame if a column is off the screen.</p></div>
  <p data-sim-prompt></p>
  <p class="feedback" data-sim-feedback role="status"></p>
  <p class="actions"><button type="button" class="btn btn-secondary" data-sim-show>Show me where</button></p>
  <div data-sim-fallback></div>
  <script type="application/json" class="sim-key">${config}</script>
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
      const choices = (node.choices || [])
        .map((choice) => `<button type="button" class="btn branch-choice" data-next="${esc(choice.next || "")}">${esc(choice.label)}</button>`)
        .join("");
      return `<div data-branch-node="${esc(id)}" hidden><p>${esc(node.text || "")}</p><div class="actions">${choices}</div></div>`;
    })
    .join("");
  return `<section class="block" data-block="branch" data-branch="${esc(block.id || "")}" data-start="${esc(block.start || "")}" id="${esc(block.id || "")}">${nodes}<p class="actions"><button type="button" class="btn btn-secondary" data-branch-back>Back</button></p></section>`;
}

function workedExample(block) {
  if (block.html) {
    return `<aside class="block block-example" data-block="workedExample"><p class="block-label">Example</p><h3>${esc(block.title || "Worked example")}</h3><div class="block-body">${block.html}</div></aside>`;
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
