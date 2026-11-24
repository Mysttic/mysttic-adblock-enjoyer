// Bumps the version in extension/manifest.json and package.json and opens a CHANGELOG section.
// It does not touch git: the commands to run next are printed at the end.
//
// usage: node scripts/bump.js <patch|minor|major|X.Y.Z>
'use strict';
const fs = require('fs');
const { MANIFEST_PATH, PACKAGE_PATH, CHANGELOG_PATH, readJson, writeJson } = require('./lib/project');

const request = process.argv[2];
const manifest = readJson(MANIFEST_PATH);
const [major, minor, patch] = manifest.version.split('.').map(Number);

let next;
if (request === 'major') next = `${major + 1}.0.0`;
else if (request === 'minor') next = `${major}.${minor + 1}.0`;
else if (request === 'patch') next = `${major}.${minor}.${patch + 1}`;
else if (/^\d+\.\d+\.\d+$/.test(request || '')) next = request;
else {
  console.error('usage: node scripts/bump.js <patch|minor|major|X.Y.Z>');
  process.exit(2);
}

const newer = (a, b) => {
  const [x, y] = [a, b].map((version) => version.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};
// The store rejects an upload whose version is not higher than the published one.
if (!newer(next, manifest.version)) {
  console.error(`New version ${next} must be higher than ${manifest.version}.`);
  process.exit(1);
}

manifest.version = next;
writeJson(MANIFEST_PATH, manifest);

const pkg = readJson(PACKAGE_PATH);
pkg.version = next;
writeJson(PACKAGE_PATH, pkg);

const today = new Date().toISOString().slice(0, 10);
const changelog = fs.readFileSync(CHANGELOG_PATH, 'utf8');
const firstSection = changelog.indexOf('\n## ');
const section = `\n## ${next} (${today})\n\n- Describe the change here.\n`;
fs.writeFileSync(
  CHANGELOG_PATH,
  firstSection < 0 ? changelog.trimEnd() + '\n' + section : changelog.slice(0, firstSection) + section + changelog.slice(firstSection)
);

console.log(`Version ${next}. Next steps:`);
console.log('  1. Edit CHANGELOG.md');
console.log('  2. npm run build && npm run e2e');
console.log(`  3. git commit -am "Release ${next}" && git tag v${next} && git push && git push origin v${next}`);
