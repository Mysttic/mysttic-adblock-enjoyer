// Uploads a package to the Chrome Web Store (API v2) and submits it for review.
// The item must already exist: the first version is uploaded by hand in the Developer Dashboard.
//
// usage: node scripts/publish-cws.js <package.zip> [--upload-only]
// Credentials come from the environment and are never printed:
//   CWS_PUBLISHER_ID, CWS_EXTENSION_ID, CWS_CLIENT_ID, CWS_CLIENT_SECRET, CWS_REFRESH_TOKEN
'use strict';
const fs = require('fs');

const API = 'https://chromewebstore.googleapis.com';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const POLL_INTERVAL_MS = 5000;
const POLL_ATTEMPTS = 36;

const zipFile = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const uploadOnly = process.argv.includes('--upload-only');

const required = ['CWS_PUBLISHER_ID', 'CWS_EXTENSION_ID', 'CWS_CLIENT_ID', 'CWS_CLIENT_SECRET', 'CWS_REFRESH_TOKEN'];
const missing = required.filter((name) => !process.env[name]);
if (!zipFile || !fs.existsSync(zipFile) || missing.length) {
  if (missing.length) console.error('Missing environment variables: ' + missing.join(', '));
  console.error('usage: node scripts/publish-cws.js <package.zip> [--upload-only]');
  process.exit(2);
}

const item = `publishers/${process.env.CWS_PUBLISHER_ID}/items/${process.env.CWS_EXTENSION_ID}`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }
  if (!response.ok) throw new Error(`${options.method || 'GET'} ${new URL(url).pathname} failed with HTTP ${response.status}: ${JSON.stringify(body.error || body)}`);
  return body;
}

async function accessToken() {
  const body = await request(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CWS_CLIENT_ID,
      client_secret: process.env.CWS_CLIENT_SECRET,
      refresh_token: process.env.CWS_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  return body.access_token;
}

(async () => {
  const authorization = { Authorization: `Bearer ${await accessToken()}` };

  console.log(`Uploading ${zipFile}`);
  const upload = await request(`${API}/upload/v2/${item}:upload`, {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/zip' },
    body: fs.readFileSync(zipFile),
  });

  let state = upload.uploadState;
  for (let attempt = 0; /IN_PROGRESS/.test(state) && attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    const status = await request(`${API}/v2/${item}:fetchStatus`, { headers: authorization });
    state = status.lastAsyncUploadState || state;
  }
  if (state !== 'SUCCEEDED') throw new Error(`Upload did not succeed, state: ${state}`);
  console.log(`Uploaded version ${upload.crxVersion || '(processed asynchronously)'}`);

  if (uploadOnly) {
    console.log('Upload only: submit it for review in the Developer Dashboard.');
    return;
  }

  const published = await request(`${API}/v2/${item}:publish`, {
    method: 'POST',
    headers: { ...authorization, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log(`Submitted, item state: ${published.state}`);
  for (const warning of (published.warningInfo && published.warningInfo.warnings) || []) {
    console.log(`  warning ${warning.reason}: ${warning.description}`);
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
