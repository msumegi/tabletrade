#!/usr/bin/env node
/**
 * Copy the built LearnHere demo to a folder that can be served at the
 * domain root (https://learnhere.ca/). Page links stay relative, so the
 * same files also work under /demos/range-path/ on rangeroadtech.com.
 *
 * Absolute canonical and social URLs are rewritten to learnhere.ca.
 * The footer credit to https://rangeroadtech.com/ is left as it is.
 *
 * Usage:
 *   node tools/publish-learnhere.mjs /path/to/output
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const demoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.resolve(process.argv[2] || "");
const FROM = "https://rangeroadtech.com/demos/range-path/";
const TO = "https://learnhere.ca/";
const FOOTER = "https://rangeroadtech.com/";
const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".txt", ".xml", ".svg", ".webmanifest"]);

if (!dest || dest === path.resolve("")) {
  console.error("Pass an output directory.");
  process.exit(1);
}
if (dest === demoRoot || demoRoot.startsWith(dest + path.sep)) {
  console.error("Refusing to publish over the demo source.");
  process.exit(1);
}

function copyDir(src, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return;
    const from = path.join(src, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  });
}

function walk(dir, files = []) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile()) files.push(full);
  });
  return files;
}

if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
copyDir(demoRoot, dest);

let rewritten = 0;
walk(dest).forEach((file) => {
  if (!TEXT.has(path.extname(file))) return;
  const raw = fs.readFileSync(file, "utf8");
  if (!raw.includes(FROM) && !raw.includes("https://rangeroadtech.com/demos/range-path")) return;
  const next = raw.split(FROM).join(TO).split("https://rangeroadtech.com/demos/range-path").join("https://learnhere.ca");
  if (next !== raw) {
    fs.writeFileSync(file, next);
    rewritten += 1;
  }
});

fs.writeFileSync(path.join(dest, "CNAME"), "learnhere.ca\n");
fs.writeFileSync(path.join(dest, ".nojekyll"), "");
fs.writeFileSync(
  path.join(dest, "README.md"),
  "LearnHere public site for https://learnhere.ca/.\n\nThis copy is published from msumegi/tabletrade (demos/range-path). Do not edit it here.\n"
);

const errors = [];
walk(dest).forEach((file) => {
  if (!TEXT.has(path.extname(file))) return;
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(dest, file);
  if (text.includes("https://rangeroadtech.com/demos/range-path")) {
    errors.push(rel + " still points at the demo path");
  }
  const leftovers = text.match(/https:\/\/rangeroadtech\.com[^"'\s]*/g) || [];
  leftovers.forEach((url) => {
    if (url !== FOOTER && url !== FOOTER.slice(0, -1)) errors.push(rel + " has " + url);
  });
  if (file.endsWith(".html")) {
    if (!text.includes('content="noindex, nofollow"') && !text.includes("content='noindex, nofollow'")) {
      errors.push(rel + " is missing noindex");
    }
    if (!text.includes(">A product of Range Road Technologies.<")) {
      errors.push(rel + " is missing the footer credit");
    }
  }
});

if (!fs.existsSync(path.join(dest, "index.html"))) errors.push("Missing index.html");
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Published " + rewritten + " files with learnhere.ca canonical URLs to " + dest);
