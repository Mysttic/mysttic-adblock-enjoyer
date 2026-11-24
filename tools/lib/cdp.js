// Minimal Chrome DevTools Protocol client. Launches a Chromium browser with a throwaway
// profile and talks to it over the DevTools pipe, so it needs no open port and no packages.
// Unpacked extensions are loaded through DevTools, which also works in branded Chrome
// (it ignores --load-extension).
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const KNOWN_BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findBrowser(explicit) {
  const candidates = [explicit, process.env.CHROME_PATH, ...KNOWN_BROWSERS].filter(Boolean);
  if (explicit && !fs.existsSync(explicit)) throw new Error(`Browser not found: ${explicit}`);
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) throw new Error('No browser found. Pass --browser <path> or set CHROME_PATH.');
  return found;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Profiles live in the OS temp dir and are reused between runs. They are never the user's own.
const profileDir = (name) => path.join(os.tmpdir(), 'mae-browser-profiles', name);

async function launch({ browser, profile, extensions = [], headless = false, args = [] } = {}) {
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(findBrowser(browser), [
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-debugging-pipe',
    '--enable-unsafe-extension-debugging',
    '--window-size=1280,900',
    ...(headless ? ['--headless=new'] : []),
    ...args,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });

  const [toBrowser, fromBrowser] = [child.stdio[3], child.stdio[4]];
  const pending = new Map();
  const listeners = [];
  let nextId = 0;
  let buffered = Buffer.alloc(0);

  // Messages are JSON documents separated by a NUL byte.
  fromBrowser.on('data', (chunk) => {
    buffered = Buffer.concat([buffered, chunk]);
    for (let end = buffered.indexOf(0); end >= 0; end = buffered.indexOf(0)) {
      const message = JSON.parse(buffered.subarray(0, end).toString('utf8'));
      buffered = buffered.subarray(end + 1);
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
      } else if (message.method) {
        for (const listener of listeners) listener(message);
      }
    }
  });

  const exited = new Promise((resolve) => child.on('exit', resolve));
  child.on('exit', () => {
    for (const { reject } of pending.values()) reject(new Error('browser exited'));
    pending.clear();
  });

  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    toBrowser.write(JSON.stringify({ id, method, params, sessionId }) + '\0');
  });

  for (const dir of extensions) await send('Extensions.loadUnpacked', { path: path.resolve(dir) });

  return {
    send,
    on: (listener) => listeners.push(listener),
    // Opens a tab and returns a sender bound to it.
    async openTab(url = 'about:blank') {
      const { targetId } = await send('Target.createTarget', { url });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      return { sessionId, send: (method, params) => send(method, params, sessionId) };
    },
    async close() {
      await send('Browser.close').catch(() => {});
      await Promise.race([exited, sleep(8000)]);
      try { toBrowser.end(); } catch {}
    },
  };
}

module.exports = { launch, findBrowser, profileDir, sleep };
