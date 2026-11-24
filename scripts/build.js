// Builds the Chrome Web Store package: dist/<name>-<version>.zip with manifest.json at its root.
//
// usage: node scripts/build.js
'use strict';
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { check } = require('./check');
const { createZip } = require('./lib/zip');
const { ROOT, EXTENSION_DIR, DIST_DIR, PACKAGE_PATH, readJson, zipPath } = require('./lib/project');

const { problems, manifest, files } = check();
if (problems.length) {
  console.error(`Check failed (${problems.length}):`);
  for (const problem of problems) console.error('  - ' + problem);
  process.exit(1);
}

const entries = files.map((name) => ({ name, data: fs.readFileSync(path.join(EXTENSION_DIR, name)) }));
const archive = createZip(entries);
const target = zipPath(readJson(PACKAGE_PATH).name, manifest.version);

fs.mkdirSync(DIST_DIR, { recursive: true });
fs.writeFileSync(target, archive);

console.log(`Built ${path.relative(ROOT, target).replace(/\\/g, '/')}`);
for (const { name, data } of entries) console.log(`  ${String(data.length).padStart(7)}  ${name}`);
console.log(`  size ${archive.length} bytes, sha256 ${crypto.createHash('sha256').update(archive).digest('hex')}`);
