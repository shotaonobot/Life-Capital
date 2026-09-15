import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = resolve(root, "dist");
const requiredFiles = [
  ".openai/hosting.json",
  "package.json",
  "dist/index.html",
  "dist/styles.css",
  "dist/app.js",
  "dist/calculations.js"
];

for (const file of requiredFiles) {
  const info = await stat(resolve(root, file));
  assert.ok(info.isFile(), file + " must be a file");
  assert.ok(info.size > 0, file + " must not be empty");
}

const hosting = JSON.parse(await readFile(resolve(root, ".openai/hosting.json"), "utf8"));
assert.equal(hosting.project_id, "appgprj_6aa824ac7b28819182c8bdb4fcd45aca");
assert.equal(hosting.static.directory, "dist");

const html = await readFile(resolve(dist, "index.html"), "utf8");
assert.match(html, /<html lang="ja">/);
assert.match(html, /name="viewport"/);
assert.match(html, /id="editor-panel"/);
assert.match(html, /type="module" src="\.\/app\.js"/);

const localReferences = [...html.matchAll(/(?:href|src)="([^"]+)"/g)]
  .map((match) => match[1])
  .filter((reference) => !/^(?:https?:|#|mailto:|tel:|data:)/.test(reference));

for (const reference of localReferences) {
  const cleanPath = reference.replace(/^\.\//, "").split(/[?#]/)[0];
  const info = await stat(resolve(dist, cleanPath));
  assert.ok(info.isFile(), "missing local asset: " + reference);
}

const css = await readFile(resolve(dist, "styles.css"), "utf8");
assert.match(css, /@media \(max-width: 700px\)/);
assert.match(css, /min-width: 320px/);

const app = await readFile(resolve(dist, "app.js"), "utf8");
assert.match(app, /localStorage\.setItem/);
assert.match(app, /trySetDayCategory/);
assert.match(app, /getWeekDates/);
assert.match(app, /readonly aria-readonly="true"/);
assert.match(app, /\.select\(\)/);

process.stdout.write(
  "Static verification passed: hosting config, responsive CSS, storage, and " +
  localReferences.length +
  " local references checked.\n"
);
