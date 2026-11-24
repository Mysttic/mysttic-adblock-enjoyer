// Opens pages in a throwaway browser profile and reports, as JSON, whether the Ad-Shield wall
// appeared. Pipe the output into summarize.js for a one-line-per-page view.
//
// usage: node tools/cdp-run.js [options] <url>...
//   --browser <exe>      browser binary (default: Chrome, or CHROME_PATH)
//   --profile <name>     profile name inside the OS temp dir (default: "default")
//   --ext <dir>[,<dir>]  unpacked extensions to load
//   --aopr               emulate an ad blocker scriptlet that makes reading window.open throw
//   --inject <file>      userscript to run in the page at document start (repeatable)
//   --block <pattern>    block matching request URLs, like DevTools request blocking (repeatable)
//   --newtab             open every URL in a brand-new tab (--aopr and --inject do not apply)
//   --wait <ms>          time to let each page settle (default 12000)
//   --shots <dir>        save a screenshot per page
//   --extra <file>       JS expression evaluated in each page, its value is added to the report
//   --label <name>       label used in the report and in screenshot names
'use strict';
const fs = require('fs');
const path = require('path');
const { launch, profileDir, sleep } = require('./lib/cdp');

const args = process.argv.slice(2);
const opt = { wait: 12000, urls: [], label: 'run', profile: 'default', inject: [], ext: [], block: [] };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--browser') opt.browser = args[++i];
  else if (a === '--profile') opt.profile = args[++i];
  else if (a === '--ext') opt.ext = args[++i].split(',').filter(Boolean);
  else if (a === '--aopr') opt.aopr = true;
  else if (a === '--inject') opt.inject.push(fs.readFileSync(args[++i], 'utf8'));
  else if (a === '--block') opt.block.push(args[++i]);
  else if (a === '--newtab') opt.newtab = true;
  else if (a === '--wait') opt.wait = Number(args[++i]);
  else if (a === '--shots') opt.shots = args[++i];
  else if (a === '--extra') opt.extra = fs.readFileSync(args[++i], 'utf8');
  else if (a === '--label') opt.label = args[++i];
  else opt.urls.push(a);
}
if (!opt.urls.length) {
  console.error('usage: node tools/cdp-run.js [options] <url>...');
  process.exit(2);
}

const AD_SHIELD_HOSTS = ['html-load.com', 'html-load.cc', 'content-loader.com', 'css-load.com', 'img-load.com', '07c225f3.online', 'error-report.com', 'ad-shield.io', 'd2w3kkzkbwx7b4.cloudfront.net'];
const isAdShieldUrl = (url) => {
  try {
    const { hostname } = new URL(url);
    return AD_SHIELD_HOSTS.some((host) => hostname === host || hostname.endsWith('.' + host));
  } catch {
    return false;
  }
};

// What uBlock Origin's abort-on-property-read scriptlet does to window.open.
const AOPR_SIM = `Object.defineProperty(window, 'open', { get() { throw new ReferenceError('aopr-sim'); }, set() {} });`;

// Runs in the page. Finds Ad-Shield tags by the same signature the extension uses, whatever
// state they are in, and collects the signs of a wall.
const PROBE = `(() => {
  const DECODER = /[\\w$]+\\+=[\\w$]+\\[\\([\\w$]+\\+[\\w$.]+\\)\\*[\\w$.]+%[\\w$]+\\]/;
  const tags = [...document.scripts].map((s) => {
    const sdk = s.hasAttribute('data-sdk');
    const inline = !s.hasAttribute('src') && DECODER.test(s.textContent.slice(0, 2000));
    if (!sdk && !inline) return null;
    return {
      kind: sdk ? 'loader' : 'watchdog',
      type: s.getAttribute('type'),
      hasSrc: s.hasAttribute('src'),
      handlers: ['onload', 'onerror'].filter((k) => s.hasAttribute(k)).length,
    };
  }).filter(Boolean);
  return {
    href: location.href,
    title: document.title,
    bodyTextLen: document.body ? document.body.innerText.length : -1,
    elements: document.getElementsByTagName('*').length,
    adShieldTags: tags,
    watchdogRan: typeof window.__as_ready_resolve !== 'undefined',
    mainScriptRan: typeof window.as_loader_version !== 'undefined' || typeof window.adshield !== 'undefined',
    reportIframes: [...document.querySelectorAll('iframe')].filter((f) => /error-report/.test(f.src)).length,
  };
})()`;

const withTimeout = (promise, ms, what) =>
  Promise.race([promise, sleep(ms).then(() => { throw new Error(`${what} timed out`); })]);

(async () => {
  const browser = await launch({ browser: opt.browser, profile: profileDir(opt.profile), extensions: opt.ext });
  const { product } = await browser.send('Browser.getVersion');
  const out = {
    label: opt.label,
    browser: product,
    extensions: opt.ext.map((dir) => path.basename(path.resolve(dir))),
    injected: opt.inject.length,
    aoprSim: !!opt.aopr,
    pages: [],
  };

  let tab = null;
  let rec = null;
  browser.on((msg) => {
    if (!tab || msg.sessionId !== tab.sessionId || !rec) return;
    const p = msg.params;
    switch (msg.method) {
      case 'Page.javascriptDialogOpening':
        rec.dialogs.push({ type: p.type, message: p.message });
        // Dismiss, never accept, so a run cannot be redirected away.
        tab.send('Page.handleJavaScriptDialog', { accept: false }).catch(() => {});
        break;
      case 'Network.requestWillBeSent':
        if (isAdShieldUrl(p.request.url)) {
          const u = new URL(p.request.url);
          rec.requests.set(p.requestId, { url: u.host + u.pathname.slice(0, 40), type: p.type, outcome: 'pending' });
        }
        break;
      case 'Network.responseReceived':
        if (rec.requests.has(p.requestId)) rec.requests.get(p.requestId).outcome = 'HTTP ' + p.response.status;
        break;
      case 'Network.loadingFailed':
        if (rec.requests.has(p.requestId)) rec.requests.get(p.requestId).outcome = p.errorText;
        break;
      case 'Page.frameNavigated':
        if (!p.frame.parentId) rec.navigations.push(p.frame.url.slice(0, 120));
        break;
      case 'Runtime.consoleAPICalled':
        if (p.type === 'error') {
          const text = p.args.map((a) => a.value ?? a.description ?? '').join(' ');
          if (/Integrity|adblock|Failed to load website|malformed|tainted/i.test(text)) rec.console.push(text.slice(0, 200));
        }
        break;
    }
  });

  const prepare = async (target) => {
    await target.send('Page.enable');
    await target.send('Network.enable');
    await target.send('Runtime.enable');
    if (opt.block.length) await target.send('Network.setBlockedURLs', { urls: opt.block });
  };

  if (!opt.newtab) {
    tab = await browser.openTab();
    await prepare(tab);
    if (opt.aopr) await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: AOPR_SIM });
    // Userscripts run in the page world at document start, after the blocker scriptlet.
    for (const source of opt.inject) await tab.send('Page.addScriptToEvaluateOnNewDocument', { source });
  }

  for (const [index, url] of opt.urls.entries()) {
    rec = { dialogs: [], requests: new Map(), navigations: [], console: [] };
    if (opt.newtab) {
      // Like "open link in new tab": the tab is created with the URL, nothing is prepared first.
      tab = await browser.openTab(url);
      await prepare(tab);
    } else {
      await tab.send('Page.navigate', { url });
    }
    await sleep(opt.wait);

    const evaluate = (expression, ms) =>
      withTimeout(tab.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }), ms, 'probe')
        .then((r) => r.result.value)
        .catch((e) => ({ error: e.message }));
    // An open dialog blocks evaluation, so a probe that cannot run counts as a wall.
    const probe = await evaluate(PROBE, 5000);
    const extra = opt.extra ? await evaluate(opt.extra, 8000) : undefined;

    if (opt.shots) {
      const shot = await withTimeout(tab.send('Page.captureScreenshot', { format: 'png' }), 5000, 'screenshot').catch(() => null);
      if (shot) {
        fs.mkdirSync(opt.shots, { recursive: true });
        fs.writeFileSync(path.join(opt.shots, `${opt.label}-${index + 1}.png`), Buffer.from(shot.data, 'base64'));
      }
    }

    out.pages.push({
      url,
      wall: rec.dialogs.length > 0 || rec.navigations.some((u) => /error-report/.test(u)) || (probe.reportIframes || 0) > 0 || !!probe.error,
      dialogs: rec.dialogs,
      navigations: rec.navigations,
      adShieldRequests: [...new Set([...rec.requests.values()].map((r) => `${r.url} [${r.type}] ${r.outcome}`))],
      console: [...new Set(rec.console)],
      probe,
      extra,
    });
    rec = null;
  }

  console.log(JSON.stringify(out, null, 1));
  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error('FATAL', error);
  process.exit(1);
});
