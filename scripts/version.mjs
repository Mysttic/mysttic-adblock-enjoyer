#!/usr/bin/env node
/**
 * The release version and every file that has to agree with it.
 *
 * VERSION.md is the single source of truth. package.json and
 * extension/manifest.json repeat the number, and CHANGELOG.md needs a dated,
 * non-empty section for it before a release can go out. The same four commands
 * as in the other Mysttic projects:
 *
 *   node scripts/version.mjs current [--file PATH]   print the version in VERSION.md
 *   node scripts/version.mjs notes                   print its CHANGELOG.md section
 *   node scripts/version.mjs check [--against X.Y.Z] validate every file, exit 1 on a problem
 *   node scripts/version.mjs bump major|minor|patch  raise the version everywhere and date
 *                                                    the Unreleased changelog section
 *
 * Only node:fs is used, so CI can run it on a bare checkout.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('..', import.meta.url);
const VERSION_FILE = 'VERSION.md';
const PACKAGE_FILE = 'package.json';
const MANIFEST_FILE = 'extension/manifest.json';
const CHANGELOG_FILE = 'CHANGELOG.md';
const PARTS = ['major', 'minor', 'patch'];

const VERSION_LINE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const SECTION_HEADING = /^## \[([^\]]+)\](?:\s*-\s*(\d{4}-\d{2}-\d{2}))?/;
const LINK_DEFINITION = /^\[[^\]]+\]:\s+\S/;

class VersionError extends Error {}

const readText = (name) => readFileSync(new URL(name, ROOT), 'utf8');
const writeText = (name, text) => writeFileSync(new URL(name, ROOT), text);
const lineBreakOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');

const parse = (version) => {
  const match = VERSION_LINE.exec(version.trim());
  if (!match) throw new VersionError(`"${version}" is not a MAJOR.MINOR.PATCH version`);
  const parts = match.slice(1, 4).map(Number);
  // Chrome rejects a manifest version with any part above 65535.
  if (parts.some((part) => part > 65535)) {
    throw new VersionError(`"${version}" has a part above 65535, which Chrome rejects`);
  }
  return parts;
};

const compare = (left, right) => {
  const a = parse(left);
  const b = parse(right);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/** The first line of VERSION.md that is a bare version; the prose around it is ignored. */
const readVersion = (text = readText(VERSION_FILE)) => {
  const line = text
    .split(/\r?\n/)
    .map((candidate) => candidate.trim())
    .find((candidate) => VERSION_LINE.test(candidate));
  if (!line) throw new VersionError('VERSION.md has no line holding a bare X.Y.Z version');
  parse(line);
  return line;
};

/** Every `## [...]` heading with the line range of its body. */
const changelogSections = (text) => {
  const lines = text.split(/\r?\n/);
  const sections = [];
  lines.forEach((line, index) => {
    const match = SECTION_HEADING.exec(line);
    if (match) sections.push({ version: match[1], date: match[2], line: index });
  });
  return sections.map((section, index) => {
    let end = index + 1 < sections.length ? sections[index + 1].line : lines.length;
    // The link definitions at the bottom belong to no section.
    for (let i = section.line + 1; i < end; i++) {
      if (LINK_DEFINITION.test(lines[i])) {
        end = i;
        break;
      }
    }
    return { ...section, body: lines.slice(section.line + 1, end).join('\n').trim() };
  });
};

const changelogSection = (version, text = readText(CHANGELOG_FILE)) => {
  const section = changelogSections(text).find((candidate) => candidate.version === version);
  if (!section) throw new VersionError(`CHANGELOG.md has no section for ${version}`);
  return section;
};

const repositoryUrl = () => {
  const { repository } = JSON.parse(readText(PACKAGE_FILE));
  const url = typeof repository === 'string' ? repository : repository?.url;
  if (!url) throw new VersionError('package.json has no repository url');
  return url.replace(/^git\+/, '').replace(/\.git$/, '');
};

const problems = (against) => {
  let version;
  try {
    version = readVersion();
  } catch (err) {
    return [String(err.message)];
  }

  const found = [];
  const pkg = JSON.parse(readText(PACKAGE_FILE));
  const manifest = JSON.parse(readText(MANIFEST_FILE));

  const copies = [
    [PACKAGE_FILE, pkg.version],
    [MANIFEST_FILE, manifest.version],
  ];
  for (const [file, copy] of copies) {
    if (copy !== version) found.push(`${file} says ${copy ?? '(nothing)'}, VERSION.md says ${version}`);
  }

  const sections = changelogSections(readText(CHANGELOG_FILE));
  const newest = sections.find((section) => section.version.toLowerCase() !== 'unreleased');
  const section = sections.find((candidate) => candidate.version === version);
  if (!section) {
    found.push(`CHANGELOG.md has no section for ${version}`);
  } else {
    if (!section.date) found.push(`the CHANGELOG.md heading for ${version} has no date`);
    if (!section.body) found.push(`the CHANGELOG.md section for ${version} is empty`);
    if (newest !== section) {
      found.push(`the newest CHANGELOG.md section is ${newest.version}, VERSION.md says ${version}`);
    }
  }

  if (against !== undefined) {
    try {
      if (compare(version, against) <= 0) {
        found.push(`VERSION.md is ${version}, it must be higher than ${against} to publish`);
      }
    } catch (err) {
      found.push(`--against: ${err.message}`);
    }
  }

  return found;
};

const localDate = () => {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

/** Replaces the first `"version": "<old>"`, which is the top-level one in both files. */
const replaceJsonVersion = (name, oldVersion, newVersion) => {
  const text = readText(name);
  const pattern = new RegExp(`("version"\\s*:\\s*)"${oldVersion.replace(/\./g, '\\.')}"`);
  if (!pattern.test(text)) throw new VersionError(`${name} does not hold version ${oldVersion}`);
  writeText(name, text.replace(pattern, `$1"${newVersion}"`));
};

/** Dates the Unreleased section as the new version and moves the compare links along. */
const rollChangelog = (oldVersion, newVersion) => {
  const text = readText(CHANGELOG_FILE);
  const eol = lineBreakOf(text);
  const lines = text.split(/\r?\n/);

  const unreleased = changelogSections(text).find(
    (section) => section.version.toLowerCase() === 'unreleased'
  );
  if (!unreleased) throw new VersionError('CHANGELOG.md has no [Unreleased] section to release');
  if (!unreleased.body) {
    throw new VersionError('the [Unreleased] section of CHANGELOG.md is empty, nothing to release');
  }

  lines.splice(unreleased.line, 1, '## [Unreleased]', '', `## [${newVersion}] - ${localDate()}`);

  const repo = repositoryUrl();
  const unreleasedLink = lines.findIndex((line) => /^\[Unreleased\]:\s/i.test(line));
  if (unreleasedLink !== -1) {
    lines.splice(
      unreleasedLink,
      1,
      `[Unreleased]: ${repo}/compare/v${newVersion}...HEAD`,
      `[${newVersion}]: ${repo}/compare/v${oldVersion}...v${newVersion}`
    );
  }

  writeText(CHANGELOG_FILE, lines.join(eol));
};

const bump = (part) => {
  const oldVersion = readVersion();
  let [major, minor, patch] = parse(oldVersion);
  if (part === 'major') [major, minor, patch] = [major + 1, 0, 0];
  else if (part === 'minor') [minor, patch] = [minor + 1, 0];
  else patch += 1;
  const newVersion = `${major}.${minor}.${patch}`;

  // The changelog goes first: it is the step that refuses an empty release,
  // and nothing else has been touched when it does.
  rollChangelog(oldVersion, newVersion);

  const versionText = readText(VERSION_FILE);
  const eol = lineBreakOf(versionText);
  writeText(
    VERSION_FILE,
    versionText
      .split(/\r?\n/)
      .map((line) => (line.trim() === oldVersion ? newVersion : line))
      .join(eol)
  );

  replaceJsonVersion(PACKAGE_FILE, oldVersion, newVersion);
  replaceJsonVersion(MANIFEST_FILE, oldVersion, newVersion);

  return newVersion;
};

const optionValue = (args, name) => {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (!value) throw new VersionError(`${name} needs a value`);
  return value;
};

const main = (args) => {
  const [command, ...rest] = args;
  switch (command) {
    case 'current': {
      const file = optionValue(rest, '--file');
      console.log(readVersion(file ? readFileSync(file, 'utf8') : undefined));
      return 0;
    }
    case 'notes':
      console.log(changelogSection(readVersion()).body);
      return 0;
    case 'check': {
      const found = problems(optionValue(rest, '--against'));
      for (const problem of found) console.error(`error: ${problem}`);
      if (found.length > 0) {
        console.error(
          '\nRaise the version with `node scripts/version.mjs bump patch|minor|major`,' +
            '\nwhich keeps every copy in step and dates the Unreleased changelog section.'
        );
        return 1;
      }
      console.log(`Release ${readVersion()} is consistent.`);
      return 0;
    }
    case 'bump': {
      const [part] = rest;
      if (!PARTS.includes(part)) throw new VersionError(`bump needs one of: ${PARTS.join(', ')}`);
      console.log(bump(part));
      return 0;
    }
    default:
      console.error('usage: node scripts/version.mjs current|notes|check|bump <part>');
      return 2;
  }
};

try {
  process.exitCode = main(process.argv.slice(2));
} catch (err) {
  if (!(err instanceof VersionError)) throw err;
  console.error(`error: ${err.message}`);
  process.exitCode = 1;
}
