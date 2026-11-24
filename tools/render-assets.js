// Renders the icons and the store graphics from store/src into PNG files with a headless
// browser. Run it again after changing anything in store/src.
//
// usage: node tools/render-assets.js [--browser <exe>]
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { launch, profileDir } = require('./lib/cdp');

const ROOT = path.resolve(__dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'store', 'src');

const JOBS = [
  ...[16, 32, 48, 128].map((size) => ({
    out: `extension/icons/icon${size}.png`, page: `icon.html?size=${size}`, width: size, height: size, transparent: true,
  })),
  ...['en', 'pl'].flatMap((lang) => [1, 2].map((n) => ({
    out: `store/assets/screenshot-${n}-${lang}.png`, page: `screenshot-${n}.html?lang=${lang}`, width: 1280, height: 800,
  }))),
  { out: 'store/assets/promo-small-440x280.png', page: 'promo.html?size=small', width: 440, height: 280 },
  { out: 'store/assets/promo-marquee-1400x560.png', page: 'promo.html?size=marquee', width: 1400, height: 560 },
];

const browserIndex = process.argv.indexOf('--browser');

(async () => {
  const browser = await launch({
    browser: browserIndex >= 0 ? process.argv[browserIndex + 1] : undefined,
    profile: profileDir('render'),
    headless: true,
  });
  const tab = await browser.openTab();
  await tab.send('Page.enable');

  for (const job of JOBS) {
    await tab.send('Emulation.setDeviceMetricsOverride', { width: job.width, height: job.height, deviceScaleFactor: 1, mobile: false });
    await tab.send('Emulation.setDefaultBackgroundColorOverride', job.transparent ? { color: { r: 0, g: 0, b: 0, a: 0 } } : {});
    const [file, query] = job.page.split('?');
    await tab.send('Page.navigate', { url: pathToFileURL(path.join(SOURCE_DIR, file)).href + '?' + query });
    // Wait for the page, its images and its fonts before taking the picture.
    await tab.send('Runtime.evaluate', {
      awaitPromise: true,
      expression: `new Promise((done) => (document.readyState === 'complete' ? done() : addEventListener('load', done)))
        .then(() => Promise.all([...document.images].map((image) => image.decode().catch(() => {}))))
        .then(() => document.fonts.ready)
        .then(() => true)`,
    });
    const { data } = await tab.send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: job.width, height: job.height, scale: 1 },
    });
    const target = path.join(ROOT, job.out);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, Buffer.from(data, 'base64'));
    console.log(`${job.out}  ${job.width}x${job.height}`);
  }

  await browser.close();
  process.exit(0);
})().catch((error) => {
  console.error('FATAL', error);
  process.exit(1);
});
