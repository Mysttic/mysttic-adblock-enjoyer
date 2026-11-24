// Release gate. In a real browser it checks that the Ad-Shield wall appears without the
// extension (otherwise the run proves nothing) and does not appear with it.
//
// usage: node tools/e2e.js [--browser <exe>] [--ext <dir>] [url...]
//   --ext   extension folder to test (default: extension/). Point it at an unpacked build
//           to test exactly what ships.
// URLs come from the command line or from e2e.local.txt (one per line, not committed).
'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const take = (flag) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args.splice(index, 2)[1] : undefined;
};
const browser = take('--browser');
const extension = path.resolve(take('--ext') || path.join(ROOT, 'extension'));
const blocker = path.join(__dirname, 'fixtures', 'host-blocker');

const localList = path.join(ROOT, 'e2e.local.txt');
const listed = fs.existsSync(localList)
  ? fs.readFileSync(localList, 'utf8').split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'))
  : [];
const urls = args.length ? args : listed;
if (!urls.length) {
  console.error('No URLs. Pass them as arguments or list them in e2e.local.txt.');
  process.exit(2);
}

const SCENARIOS = [
  { name: 'control: no extension, window.open filter', wall: true, options: ['--profile', 'e2e-control', '--aopr'] },
  { name: 'extension, window.open filter', wall: false, options: ['--profile', 'e2e-extension', '--ext', extension, '--aopr'] },
  { name: 'extension, Ad-Shield hosts blocked', wall: false, options: ['--profile', 'e2e-extension', '--ext', `${extension},${blocker}`] },
  { name: 'extension, no blocker', wall: false, options: ['--profile', 'e2e-extension', '--ext', extension] },
  { name: 'extension, hosts blocked, new tabs', wall: false, options: ['--profile', 'e2e-extension', '--ext', `${extension},${blocker}`, '--newtab'] },
];

function run(options) {
  const argv = [path.join(__dirname, 'cdp-run.js'), ...(browser ? ['--browser', browser] : []), ...options, ...urls];
  const output = execFileSync(process.execPath, argv, { maxBuffer: 64 * 1024 * 1024 });
  return JSON.parse(output.toString('utf8')).pages;
}

// Why a page that should be wall-free is not acceptable, or null when it is fine.
function defect(page) {
  const probe = page.probe || {};
  const tags = probe.adShieldTags || [];
  if (page.wall) return 'wall appeared';
  if (!(probe.elements >= 50)) return `page looks wiped (${probe.elements} elements)`;
  if (!tags.length) return 'no Ad-Shield tags found, nothing was tested';
  if (tags.some((tag) => tag.type !== 'text/plain' || tag.hasSrc || tag.handlers)) return 'an Ad-Shield tag is still live';
  if (probe.watchdogRan || probe.mainScriptRan) return 'Ad-Shield code ran';
  return null;
}

let failures = 0;
let controlBroken = false;
for (const scenario of SCENARIOS) {
  console.log(`\n${scenario.name}`);
  for (const page of run(scenario.options)) {
    const problem = scenario.wall ? (page.wall ? null : 'expected the wall, saw none') : defect(page);
    console.log(`  ${problem ? 'FAIL' : 'pass'}  ${page.url}${problem ? '  (' + problem + ')' : ''}`);
    if (!problem) continue;
    if (scenario.wall) controlBroken = true;
    else failures++;
  }
}

if (controlBroken) {
  console.log('\nINCONCLUSIVE: the control run showed no wall, so these pages no longer prove anything.');
  process.exit(2);
}
console.log(failures ? `\nFAILED: ${failures} page load(s).` : `\nPASSED: ${urls.length} page(s) in ${SCENARIOS.length} scenarios.`);
process.exit(failures ? 1 : 0);
