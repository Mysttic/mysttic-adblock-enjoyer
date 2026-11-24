// Paths and small helpers shared by the check and build scripts.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const EXTENSION_DIR = path.join(ROOT, 'extension');
const DIST_DIR = path.join(ROOT, 'dist');
const MANIFEST_PATH = path.join(EXTENSION_DIR, 'manifest.json');
const PACKAGE_PATH = path.join(ROOT, 'package.json');

const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

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

module.exports = {
  ROOT,
  EXTENSION_DIR,
  DIST_DIR,
  MANIFEST_PATH,
  PACKAGE_PATH,
  readJson,
  listPackageFiles,
  zipPath,
};
