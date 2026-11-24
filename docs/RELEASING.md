# Releasing

How a version gets from this repository into the Chrome Web Store.

## Overview

1. `npm run bump` raises the version in `extension/manifest.json` and `package.json`.
2. `npm run build` checks the extension and writes `dist/mysttic-adblock-enjoyer-<version>.zip`.
3. `npm run e2e` proves in a real browser that the wall is gone.
4. Pushing a `v<version>` tag starts the `Release` workflow. It rebuilds the zip, attaches it
   to a GitHub release and, when the store credentials are configured, uploads it to the
   Chrome Web Store and submits it for review.

The build is deterministic: the same sources and the same Node.js version always give the same
zip. Every build prints its SHA-256 checksum.

## One-time setup

### 1. Developer account

1. Sign in at the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) and pay
   the one-time registration fee.
2. Turn on 2-step verification for that Google account. The store requires it for publishing.

### 2. First version, by hand

The store API cannot create an item, so the first version is uploaded in the dashboard.

1. Run `npm run build`.
2. In the dashboard choose "New item" and upload the zip from `dist/`.
3. **Store listing** tab: copy the texts from [`store/listing/en.md`](../store/listing/en.md)
   and [`store/listing/pl.md`](../store/listing/pl.md). Upload the graphics from
   `store/assets/`: the screenshots (1280x800) and the small promo tile (440x280). The marquee
   (1400x560) is optional. The store icon is taken from the package.
4. **Privacy** tab: copy the answers from
   [`store/privacy-practices.md`](../store/privacy-practices.md).
5. Paste [`store/reviewer-notes.md`](../store/reviewer-notes.md) into the notes for reviewers
   on the test instructions tab.
6. Submit for review.

Note the two identifiers you need later:

- **Extension ID**: 32 characters, shown on the item's Package tab.
- **Publisher ID**: shown under Publisher, Settings.

### 3. Automatic uploads (optional)

Without this step the workflow still builds the zip and creates the GitHub release. You then
upload that zip in the dashboard yourself.

To let the workflow upload and submit:

1. In the Google Cloud Console create a project and enable the Chrome Web Store API.
2. Configure the OAuth consent screen as External and add your own address as a test user.
3. Create an OAuth client ID of type "Web application" with
   `https://developers.google.com/oauthplayground` as an authorised redirect URI.
4. In the [OAuth Playground](https://developers.google.com/oauthplayground) choose "Use your
   own OAuth credentials", enter the scope `https://www.googleapis.com/auth/chromewebstore`,
   authorise with the Google account that owns the item, and exchange the code for a refresh
   token.
5. Add these repository secrets on GitHub (Settings, Secrets and variables, Actions):

   | Secret | Value |
   | --- | --- |
   | `CWS_PUBLISHER_ID` | Publisher ID from the dashboard |
   | `CWS_EXTENSION_ID` | Extension ID from the dashboard |
   | `CWS_CLIENT_ID` | OAuth client ID |
   | `CWS_CLIENT_SECRET` | OAuth client secret |
   | `CWS_REFRESH_TOKEN` | Refresh token from the playground |

The official guide for these steps is
[Use the Chrome Web Store API](https://developer.chrome.com/docs/webstore/using-api).

## Every release

1. **Bump the version.** The store rejects a version that is not higher than the last one.

   ```sh
   npm run bump -- patch
   ```

2. **Describe the change** in the new section of `CHANGELOG.md`. That section becomes the text
   of the GitHub release.

3. **Build and test what ships.** Unpack the zip and point the test at it:

   ```sh
   npm run build
   mkdir -p dist/unpacked && unzip -o -q dist/mysttic-adblock-enjoyer-*.zip -d dist/unpacked
   npm run e2e -- --ext dist/unpacked
   ```

   The test needs Chrome and a file `e2e.local.txt` in the repository root with one page URL
   per line. That file is not committed. Use pages that run the Ad-Shield loader.

4. **Commit, tag and push.**

   ```sh
   git commit -am "Release 1.2.3"
   git tag v1.2.3
   git push
   git push origin v1.2.3
   ```

5. **Watch the `Release` workflow.** It fails when the tag does not match the manifest
   version. When the store secrets are missing it skips the upload: download the zip from the
   GitHub release and upload it in the dashboard.

6. **Wait for the review.** The dashboard shows the state. An update keeps the listing texts
   and graphics of the previous version.

## The release gate

`npm run e2e` opens every page from `e2e.local.txt` in a throwaway browser profile, five times:

| Run | Expectation |
| --- | --- |
| No extension, `window.open` filter emulated | The wall appears. This proves the pages still test something. |
| Extension, `window.open` filter emulated | No wall, both tags defused, no Ad-Shield code ran. |
| Extension, Ad-Shield hosts blocked | Same. |
| Extension, no blocker | Same. |
| Extension, hosts blocked, pages opened in new tabs | Same. |

Exit code 0 means every page passed. Code 1 means the wall got through. Code 2 means the
control run showed no wall, so the result proves nothing: the pages changed or dropped
Ad-Shield, and the list needs other pages.

Browser profiles are kept in the system temp folder under `mae-browser-profiles` and can be
deleted at any time.

## When Ad-Shield changes

Ad-Shield updates its loader from time to time. If the wall comes back:

1. Save the page and look at how it is embedded:

   ```sh
   node tools/research/survey.js --save dist/survey https://the-page.example/
   node tools/research/decode-snippets.js dist/survey/the-page.example.html dist/decoded
   ```

   `survey.js` lists the script tags that look like Ad-Shield. `decode-snippets.js` unpacks
   the loader attributes and the watchdog into readable code without running them.
2. Adjust the signature in `extension/content.js` (`DECODER`, `isLoader`, `isWatchdog`).
3. Run the release gate, then release.

## Optional word check

If a file `forbidden-words.local.txt` exists in the repository root, `npm run check` fails when
any of its words (one per line) appears in a file that would be committed. The file itself is
not committed.
