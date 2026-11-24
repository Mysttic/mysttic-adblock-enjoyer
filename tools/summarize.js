// Prints one line per page from cdp-run.js JSON (stdin).
// usage: node tools/cdp-run.js ... | node tools/summarize.js [--expect wall|nowall]
// With --expect the exit code is 1 when a page does not match.
'use strict';

const expectIndex = process.argv.indexOf('--expect');
const expect = expectIndex >= 0 ? process.argv[expectIndex + 1] : null;
const out = JSON.parse(require('fs').readFileSync(0, 'utf8'));

let unexpected = 0;
for (const page of out.pages) {
  const probe = page.probe || {};
  const tags = (probe.adShieldTags || []).map((tag) => {
    const defused = tag.type === 'text/plain' && !tag.hasSrc && !tag.handlers;
    return `${tag.kind}:${defused ? 'defused' : 'live'}`;
  }).join(' ') || 'none';

  let verdict = '';
  if (expect) {
    const ok = (expect === 'wall') === page.wall;
    verdict = ok ? ' OK' : ' UNEXPECTED';
    if (!ok) unexpected++;
  }

  const { hostname, pathname } = new URL(page.url);
  console.log(
    `${out.label.padEnd(14)} ${(hostname + pathname).slice(0, 44).padEnd(44)} wall=${String(page.wall).padEnd(5)}${verdict}` +
    ` dialogs=${page.dialogs.length} elements=${probe.elements} tags=[${tags}]` +
    ` watchdogRan=${probe.watchdogRan} mainScriptRan=${probe.mainScriptRan}`
  );
  if (page.adShieldRequests.length) console.log('     requests: ' + page.adShieldRequests.slice(0, 4).join(' | '));
  if (page.console.length) console.log('     console: ' + JSON.stringify(page.console.slice(0, 2)));
  if (page.dialogs.length) console.log('     dialog: ' + JSON.stringify(page.dialogs[0].message));
  if (probe.error) console.log('     probe error: ' + probe.error);
}
process.exit(unexpected ? 1 : 0);
