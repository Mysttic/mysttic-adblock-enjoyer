// Validates what ships in the package: manifest, locales, icons and scripts. Exits with
// code 1 and a list of problems. The version itself is checked by scripts/version.mjs.
//
// usage: node scripts/check.js
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const { ROOT, EXTENSION_DIR, MANIFEST_PATH, readJson, listPackageFiles } = require('./lib/project');

// Chrome Web Store limits.
const MAX_NAME = 75;
const MAX_DESCRIPTION = 132;
const SHIPPED_TYPES = new Set(['.js', '.json', '.png', '.css', '.html']);
// Optional, never committed: one word per line that must not appear anywhere in the repository.
const FORBIDDEN_WORDS_FILE = path.join(ROOT, 'forbidden-words.local.txt');

function pngSize(file) {
  const header = fs.readFileSync(file).subarray(0, 24);
  if (header.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

// Files git would track, or every file outside the usual ignored folders before `git init`.
function repositoryFiles() {
  try {
    const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] });
    return out.toString('utf8').split('\n').filter(Boolean);
  } catch {
    const skip = new Set(['.git', 'node_modules', 'dist', 'analysis', 'dl']);
    const walk = (dir, prefix) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (skip.has(entry.name) || /\.local\./.test(entry.name)) return [];
      const relative = prefix + entry.name;
      return entry.isDirectory() ? walk(path.join(dir, entry.name), relative + '/') : [relative];
    });
    return walk(ROOT, '');
  }
}

function check() {
  const problems = [];
  const manifest = readJson(MANIFEST_PATH);
  const files = listPackageFiles();
  const exists = (relative) => files.includes(relative);

  if (manifest.manifest_version !== 3) problems.push('manifest_version must be 3');

  for (const script of (manifest.content_scripts || []).flatMap((entry) => entry.js || [])) {
    if (!exists(script)) problems.push(`content script missing: ${script}`);
  }

  for (const [size, file] of Object.entries(manifest.icons || {})) {
    if (!exists(file)) { problems.push(`icon missing: ${file}`); continue; }
    const actual = pngSize(path.join(EXTENSION_DIR, file));
    if (!actual) problems.push(`icon is not a PNG: ${file}`);
    else if (actual.width !== Number(size) || actual.height !== Number(size)) {
      problems.push(`icon ${file} is ${actual.width}x${actual.height}, expected ${size}x${size}`);
    }
  }
  if (!manifest.icons || !manifest.icons['128']) problems.push('a 128x128 icon is required by the Chrome Web Store');

  // Localised strings: every __MSG_key__ in the manifest must exist in every locale.
  const messageKeys = [...JSON.stringify(manifest).matchAll(/__MSG_(\w+)__/g)].map((match) => match[1]);
  const locales = files.filter((file) => /^_locales\/[^/]+\/messages\.json$/.test(file)).map((file) => file.split('/')[1]);
  if (messageKeys.length && !manifest.default_locale) problems.push('manifest uses __MSG_*__ but has no default_locale');
  if (manifest.default_locale && !locales.includes(manifest.default_locale)) problems.push(`default_locale ${manifest.default_locale} has no messages.json`);
  for (const locale of locales) {
    const messages = readJson(path.join(EXTENSION_DIR, '_locales', locale, 'messages.json'));
    for (const key of messageKeys) {
      if (!messages[key] || !messages[key].message) problems.push(`locale ${locale}: missing message ${key}`);
    }
    const resolve = (value) => String(value || '').replace(/__MSG_(\w+)__/g, (_, key) => (messages[key] || {}).message || '');
    const name = resolve(manifest.name);
    const description = resolve(manifest.description);
    if (!name || name.length > MAX_NAME) problems.push(`locale ${locale}: name must be 1 to ${MAX_NAME} characters (is ${name.length})`);
    if (!description || description.length > MAX_DESCRIPTION) problems.push(`locale ${locale}: description must be 1 to ${MAX_DESCRIPTION} characters (is ${description.length})`);
  }

  for (const file of files) {
    const type = path.extname(file);
    if (!SHIPPED_TYPES.has(type)) problems.push(`unexpected file type in the package: ${file}`);
    const absolute = path.join(EXTENSION_DIR, file);
    try {
      if (type === '.js') new vm.Script(fs.readFileSync(absolute, 'utf8'), { filename: file });
      if (type === '.json') readJson(absolute);
    } catch (error) {
      problems.push(`${file}: ${error.message}`);
    }
  }

  if (fs.existsSync(FORBIDDEN_WORDS_FILE)) {
    const words = fs.readFileSync(FORBIDDEN_WORDS_FILE, 'utf8').split(/\r?\n/).map((word) => word.trim().toLowerCase()).filter(Boolean);
    for (const file of repositoryFiles()) {
      const absolute = path.join(ROOT, file);
      if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) continue;
      const lower = (file + '\n' + fs.readFileSync(absolute, 'latin1')).toLowerCase();
      for (const word of words) {
        if (lower.includes(word)) problems.push(`forbidden word "${word}" in ${file}`);
      }
    }
  }

  return { problems, manifest, files };
}

if (require.main === module) {
  const { problems, manifest, files } = check();
  if (problems.length) {
    console.error(`Check failed (${problems.length}):`);
    for (const problem of problems) console.error('  - ' + problem);
    process.exit(1);
  }
  console.log(`Check passed: version ${manifest.version}, ${files.length} files in the package.`);
}

module.exports = { check };
