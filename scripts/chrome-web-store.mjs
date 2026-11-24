#!/usr/bin/env node
/**
 * Publishes the extension to the Chrome Web Store through its API (v2).
 *
 *   node scripts/chrome-web-store.mjs status
 *   node scripts/chrome-web-store.mjs publish <package.zip> [--staged]
 *
 * `publish` uploads the package to the existing store item and submits it for
 * review. The store publishes it on its own once the review passes, or, with
 * --staged, keeps it until it is published from the Developer Dashboard. A
 * version the store already holds is skipped, so a release run that failed
 * after this step can be repeated without touching the store again.
 *
 * The API cannot create an item: the first version is uploaded by hand in the
 * Developer Dashboard, which is also where the item ID comes from.
 *
 * Credentials come from the environment and are never printed:
 *   CWS_SERVICE_ACCOUNT_KEY  JSON key of the service account added to the
 *                            publisher in the Developer Dashboard (Account)
 *   CWS_PUBLISHER_ID         Developer Dashboard, Publisher, Settings
 *   CWS_ITEM_ID              the extension's 32-character store ID
 * CWS_API_BASE, CWS_TOKEN_URL and CWS_POLL_INTERVAL_MS exist for tests.
 */
import { createSign } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCOPE = 'https://www.googleapis.com/auth/chromewebstore';
const API_BASE = process.env.CWS_API_BASE ?? 'https://chromewebstore.googleapis.com';
const TOKEN_URL = process.env.CWS_TOKEN_URL ?? 'https://oauth2.googleapis.com/token';
const POLL_INTERVAL_MS = Number(process.env.CWS_POLL_INTERVAL_MS ?? 5000);
const POLL_ATTEMPTS = 36;
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

class StoreError extends Error {}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const warn = (text) => console.log(IN_ACTIONS ? `::warning::${text}` : `warning: ${text}`);
const summary = (text) => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

const requireEnv = (name) => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new StoreError(`${name} is not set. See "Chrome Web Store access" in docs/RELEASING.md.`);
  }
  return value;
};

const currentVersion = () =>
  execFileSync(process.execPath, [fileURLToPath(new URL('./version.mjs', import.meta.url)), 'current'], {
    encoding: 'utf8',
  }).trim();

const readJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text.slice(0, 500) };
  }
};

/** Google answers with {error: {message}} from the API and {error, error_description} from OAuth. */
const describe = (body) =>
  body?.error?.message ??
  body?.error_description ??
  (typeof body?.error === 'string' ? body.error : undefined) ??
  body?.raw ??
  JSON.stringify(body);

/** Signs a JWT with the service account's key and trades it for an access token. */
const accessToken = async () => {
  let key;
  try {
    key = JSON.parse(requireEnv('CWS_SERVICE_ACCOUNT_KEY'));
  } catch (err) {
    if (err instanceof StoreError) throw err;
    throw new StoreError('CWS_SERVICE_ACCOUNT_KEY is not the JSON key file of a service account.');
  }
  if (!key.client_email || !key.private_key) {
    throw new StoreError('CWS_SERVICE_ACCOUNT_KEY has no client_email or private_key.');
  }

  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  })}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${signature}`,
    }),
  });
  const body = await readJson(response);
  if (!response.ok || !body.access_token) {
    throw new StoreError(`Google refused the service account (${response.status}): ${describe(body)}`);
  }
  if (IN_ACTIONS) console.log(`::add-mask::${body.access_token}`);
  return body.access_token;
};

const storeClient = async () => {
  // Read before the token is requested, so a missing ID costs no round trip.
  const publisher = encodeURIComponent(requireEnv('CWS_PUBLISHER_ID'));
  const item = encodeURIComponent(requireEnv('CWS_ITEM_ID'));
  const itemPath = `/v2/publishers/${publisher}/items/${item}`;
  const token = await accessToken();

  const call = async (method, path, { body, contentType } = {}) => {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(contentType ? { 'Content-Type': contentType } : {}),
      },
      body,
    });
    const json = await readJson(response);
    if (!response.ok) {
      throw new StoreError(`${method} ${path.split('/').pop()} failed with ${response.status}: ${describe(json)}`);
    }
    return json;
  };

  return {
    status: () => call('GET', `${itemPath}:fetchStatus`),
    upload: (zip) => call('POST', `/upload${itemPath}:upload`, { body: zip, contentType: 'application/zip' }),
    publish: (staged) =>
      call('POST', `${itemPath}:publish`, {
        body: JSON.stringify({ publishType: staged ? 'STAGED_PUBLISH' : 'DEFAULT_PUBLISH' }),
        contentType: 'application/json',
      }),
  };
};

const versionsOf = (revision) =>
  (revision?.distributionChannels ?? []).map((channel) => channel.crxVersion).filter(Boolean);

const describeRevision = (revision) =>
  revision ? `${revision.state ?? 'unknown'} ${versionsOf(revision).join(', ') || '(no version)'}` : 'none';

const printStatus = (status) => {
  console.log(`published:   ${describeRevision(status.publishedItemRevisionStatus)}`);
  console.log(`submitted:   ${describeRevision(status.submittedItemRevisionStatus)}`);
  console.log(`last upload: ${status.lastAsyncUploadState ?? 'none in the last 24 hours'}`);
  if (status.takenDown) console.log('taken down:  yes');
  if (status.warned) console.log('warned:      yes');
};

// The reference names the state IN_PROGRESS; the upload page calls it UPLOAD_IN_PROGRESS.
const isInProgress = (state) => state === 'IN_PROGRESS' || state === 'UPLOAD_IN_PROGRESS';

const publish = async (packagePath, staged) => {
  if (!packagePath) throw new StoreError('publish needs the path of the package zip.');
  const version = currentVersion();
  const zip = readFileSync(packagePath);
  const store = await storeClient();

  const before = await store.status();
  printStatus(before);
  if (before.takenDown) {
    throw new StoreError('The item is taken down for a policy violation. Resolve it in the Developer Dashboard first.');
  }

  const submitted = before.submittedItemRevisionStatus;
  const published = before.publishedItemRevisionStatus;
  if ([submitted, published].some((revision) => versionsOf(revision).includes(version))) {
    summary(`Chrome Web Store already holds ${version} (${describeRevision(submitted ?? published)}); nothing uploaded.`);
    return;
  }
  if (submitted?.state === 'PENDING_REVIEW') {
    throw new StoreError(
      `${versionsOf(submitted).join(', ') || 'Another version'} is still in review. Wait for the review, ` +
        'or cancel that submission in the Developer Dashboard, then run the release again.'
    );
  }

  const upload = await store.upload(zip);
  let state = upload.uploadState;
  for (let attempt = 0; isInProgress(state) && attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS);
    state = (await store.status()).lastAsyncUploadState;
  }
  if (state !== 'SUCCEEDED') throw new StoreError(`The upload of ${version} ended as ${state ?? 'unknown'}.`);
  if (upload.crxVersion && upload.crxVersion !== version) {
    throw new StoreError(`The store read version ${upload.crxVersion} from the package, VERSION.md says ${version}.`);
  }

  const result = await store.publish(staged);
  for (const warning of result.warningInfo?.warnings ?? []) warn(`${warning.reason}: ${warning.description}`);
  summary(
    `Chrome Web Store: ${version} submitted for review (${result.state ?? 'state not reported'}). ` +
      (staged
        ? 'Once approved it waits to be published from the Developer Dashboard.'
        : 'It goes live as soon as the review passes.')
  );
};

const main = async (args) => {
  const [command, ...rest] = args;
  if (command === 'status') {
    printStatus(await (await storeClient()).status());
    return 0;
  }
  if (command === 'publish') {
    await publish(rest.find((arg) => !arg.startsWith('--')), rest.includes('--staged'));
    return 0;
  }
  console.error('usage: node scripts/chrome-web-store.mjs status | publish <package.zip> [--staged]');
  return 2;
};

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (err) => {
    if (!(err instanceof StoreError)) throw err;
    console.error(IN_ACTIONS ? `::error::${err.message}` : `error: ${err.message}`);
    process.exitCode = 1;
  }
);
