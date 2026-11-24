// Prints the CHANGELOG.md section of the current manifest version, for the GitHub release body.
//
// usage: node scripts/release-notes.js
'use strict';
const { MANIFEST_PATH, readJson, changelogSection } = require('./lib/project');

const { version } = readJson(MANIFEST_PATH);
const notes = changelogSection(version);
if (!notes) {
  console.error(`CHANGELOG.md has no "## ${version}" section.`);
  process.exit(1);
}
console.log(notes);
