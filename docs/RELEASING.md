# Releasing

How a version gets from this repository into the Chrome Web Store. The process is the same as
in the other Mysttic projects: the release number lives in [`VERSION.md`](../VERSION.md), the
notes live in [`CHANGELOG.md`](../CHANGELOG.md), and a release starts when `VERSION.md`
changes on `main`.

## Pull requests and releases

Work happens on a branch from `develop`, and the pull request goes back into `develop`. Each
one adds a line to `CHANGELOG.md` under `Unreleased` and leaves `VERSION.md` alone.

A release is a pull request from `develop` into `main` that raises the version:

1. `node scripts/version.mjs bump patch` (or `minor`, `major`). It writes the new number to
   `VERSION.md`, `package.json` and `extension/manifest.json`, turns `Unreleased` into a dated
   section and moves the compare links at the bottom of the changelog. It refuses when
   `Unreleased` is empty.
2. Add a sentence or two under the new heading on what the release is about.
3. Run the [release gate](#the-release-gate) on the built package.
4. Open the pull request. CI checks that every copy of the version agrees and that the number
   is higher than the one on `main`, then checks and packs the extension.
5. Merge. The **Release** workflow starts only because `VERSION.md` changed. It verifies and
   packs the extension, uploads the package to the Chrome Web Store and submits it for review,
   then tags the GitHub release `v<version>` with the changelog section as its notes. The
   store publishes the version on its own once the review passes.

While [the store access](#chrome-web-store-access) is not configured, the workflow skips the
store and attaches the package to the GitHub release instead, to be uploaded by hand in the
Developer Dashboard. Once it is configured the release carries notes only: the extension is
then installed from the store.

`node scripts/version.mjs` has the same four commands as in the other Mysttic projects:
`current` prints the version, `notes` prints its changelog section, `check` validates every
copy (`--against X.Y.Z` also requires a higher number) and `bump` raises it.

`node scripts/chrome-web-store.mjs status` shows what the store holds: the published version,
the one in review and the last upload. `publish <zip>` is what the workflow runs. It skips a
version the store already has, so a release that failed after the upload can be re-run from
the Actions tab without a second upload, and it stops with a message while another version is
still in review. To tag an existing version again, start **Release** by hand with **force**.

The store listing itself (descriptions, screenshots, the privacy answers) is edited in the
[Developer Dashboard](https://chrome.google.com/webstore/devconsole). The texts and graphics
to paste there are in [`store/`](../store).

## The release gate

Before a release pull request, build the package and test exactly what ships:

```sh
npm run build
mkdir -p dist/unpacked && unzip -o -q dist/mysttic-adblock-enjoyer-*.zip -d dist/unpacked
npm run e2e -- --ext dist/unpacked
```

The test needs Chrome and a file `e2e.local.txt` in the repository root with one page URL per
line. That file is not committed. Use pages that run the Ad-Shield loader.

`npm run e2e` opens every page in a throwaway browser profile, five times:

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

## One-time setup

### Developer account and the first version

The store API cannot create an item, so the first version is uploaded in the dashboard.

1. Sign in at the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) and pay
   the one-time registration fee. Turn on 2-step verification for that Google account: the
   store requires it for publishing.
2. Run `npm run build`, click "Add new item" in the dashboard, choose the zip from `dist/` and
   click "Upload".
3. **Store listing** tab: copy the texts from [`store/listing/en.md`](../store/listing/en.md)
   and [`store/listing/pl.md`](../store/listing/pl.md). Upload the graphics from
   `store/assets/`: the screenshots (1280x800) and the small promo tile (440x280). The marquee
   (1400x560) is optional. The store icon is taken from the package.
4. **Privacy** tab: copy the answers from
   [`store/privacy-practices.md`](../store/privacy-practices.md).
5. Paste [`store/reviewer-notes.md`](../store/reviewer-notes.md) into the test instructions
   for reviewers.
6. Submit for review.

### Chrome Web Store access

The workflow signs in to the Chrome Web Store API as a Google Cloud service account.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project (or pick
   one) and enable the **Chrome Web Store API**.
2. Create a service account in that project, then a JSON key for it.
3. In the Developer Dashboard, **Account**: add the service account's e-mail address. A
   publisher can have one service account, so a publisher that already releases another
   extension this way reuses the same key.
4. In this repository, *Settings, Secrets and variables, Actions*:
   - the secret `CWS_SERVICE_ACCOUNT_KEY` holding the whole JSON key,
   - `CWS_PUBLISHER_ID`, the publisher ID from the Developer Dashboard (**Publisher**,
     **Settings**),
   - `CWS_ITEM_ID`, the 32-character ID from the item's **Package** tab.

   The two IDs are not confidential and can be repository variables instead of secrets.

Releases go out from `main` only: a manual run of **Release** on another branch stops at once.

With none of the three set, the release skips the store and attaches the package to the GitHub
release. With only some of them set it stops in its first job, before anything is built. The
API publishes with the visibility saved in the dashboard: after changing it there, publish
once by hand before the next release.

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
3. Add a line under `Unreleased` in `CHANGELOG.md`, run the release gate, then release.

## Optional word check

If a file `forbidden-words.local.txt` exists in the repository root, `npm run check` fails when
any of its words (one per line) appears in a file that would be committed. The file itself is
not committed.
