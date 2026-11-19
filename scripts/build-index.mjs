// Generates index.json (format version 1) from sources/*/.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesDir = join(root, "sources");

function fail(message) {
  console.error(`build-index: ${message}`);
  process.exit(1);
}

for (const entry of readdirSync(sourcesDir, { withFileTypes: true })) {
  if (entry.isFile() && entry.name.endsWith(".js")) {
    const stem = entry.name.slice(0, -3);
    fail(`move sources/${entry.name} into sources/${stem}/main.js (flat files are not supported in index.json)`);
  }
}

const sources = [];
const folders = readdirSync(sourcesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name);

for (const folder of folders) {
  const dir = join(sourcesDir, folder);
  const files = readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  if (files.length === 0) continue;

  if (!files.includes("main.js")) fail(`sources/${folder} has no main.js`);

  let name = folder;
  let version = "1";
  if (files.includes("extension.json")) {
    let meta;
    try {
      meta = JSON.parse(readFileSync(join(dir, "extension.json"), "utf8"));
    } catch (error) {
      fail(`sources/${folder}/extension.json is not valid JSON (${error.message})`);
    }
    if (meta === null || typeof meta !== "object" || Array.isArray(meta)) {
      fail(`sources/${folder}/extension.json must be a JSON object`);
    }
    if (meta.name != null) name = String(meta.name);
    if (meta.version != null) version = String(meta.version);
  }

  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file);
    hash.update(Buffer.from([0]));
    hash.update(readFileSync(join(dir, file)));
    hash.update(Buffer.from([0]));
  }

  sources.push({
    path: `sources/${folder}`,
    name,
    version,
    hash: `sha256-${hash.digest("hex")}`,
    files,
  });
}

sources.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

const index = { formatVersion: 1, sources };
writeFileSync(join(root, "index.json"), JSON.stringify(index, null, 2) + "\n");
console.log(`build-index: wrote index.json with ${sources.length} source(s)`);
