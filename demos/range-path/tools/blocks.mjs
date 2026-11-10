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
  return `<section class="block block-assignment" data-block="assignment" data-block-id="${esc(id)}" id="${esc(id)}">
  <h2>${esc(block.title || "Assignment")}</h2>
  <p class="block-prompt">Try this before you open the self-check.</p>
  <div class="block-body">${block.instructions || ""}</div>
  <p class="actions"><button type="button" class="btn" data-assignment-done="${esc(id)}">I have done this</button></p>
  <p class="block-status" data-assignment-status="${esc(id)}">Not marked done yet.</p>
  ${check({ title: "Show the self-check", body: block.selfCheck || "", prompt: "The answer key stays closed until you open it." })}
</section>`;
}

function check(block) {
  const body = block.body || block.html || "";
  return `<aside class="block block-check" data-block="check">
  <p class="block-prompt">${esc(block.prompt || "Try it first.")}</p>
  <details>
    <summary>${esc(block.title || "Show the check")}</summary>
    <div class="block-body">${body}</div>
  </details>
</aside>`;
}

export const renderers = {
  prose,
  example,
  assignment,
  check
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
