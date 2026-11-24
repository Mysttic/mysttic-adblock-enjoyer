// Paths and small helpers shared by the build and release scripts.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const DIST_DIR = path.join(ROOT, 'dist');
const MANIFEST_PATH = path.join(EXTENSION_DIR, 'manifest.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');

// Every file that ships in the package, as sorted forward-slash paths relative to extension/.
// Dotfiles and the browser's own _metadata folder never ship.
function listPackageFiles(dir = EXTENSION_DIR, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === '_metadata') continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...listPackageFiles(path.join(dir, entry.name), relative + '/'));
    else files.push(relative);
  }
  return files.sort();
}

const zipPath = (name, version) => path.join(DIST_DIR, `${name}-${version}.zip`);

// The "## <version>" section of CHANGELOG.md, without its heading.
function changelogSection(version) {
  const lines = fs.readFileSync(CHANGELOG_PATH, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((line) => line.startsWith(`## ${version}`));
  if (start < 0) return null;
  const length = lines.slice(start + 1).findIndex((line) => line.startsWith('## '));
  const section = length < 0 ? lines.slice(start + 1) : lines.slice(start + 1, start + 1 + length);
  return section.join('\n').trim();
}

module.exports = {
  ROOT,
  EXTENSION_DIR,
  DIST_DIR,
  MANIFEST_PATH,
  PACKAGE_PATH,
  CHANGELOG_PATH,
  readJson,
  writeJson,
  listPackageFiles,
  zipPath,
  changelogSection,
};
