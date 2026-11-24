# Mysttic Adblock Enjoyer

A Manifest V3 browser extension that defuses the Ad-Shield anti-adblock wall: the
"Please allow ads on this site" dialog that blanks the page and reloads it or redirects you to
`report.error-report.com`.

It is not an ad blocker. It blocks no ads and no requests. It only stops Ad-Shield from
breaking pages for people who use one.

## How it works

A page that uses the Ad-Shield loader (SDK 1.2.x) ships two tags in `<head>`:

1. **The loader**, a `<script>` with packed `onload` and `onerror` attributes. Its code checks
   whether native browser APIs can still be read. Ad blockers commonly make `window.open`
   throw to stop popunders, which fails that check. The loader then wipes the page and shows
   the dialog. The attributes raise the same wall when the loader itself is blocked.
2. **A watchdog**, an inline script that raises the wall when the loader tag is missing.

[`extension/content.js`](extension/content.js) runs at `document_start` in the isolated world.
It recognises both tags by their code signature and switches them off before the browser
executes them. The loader tag stays in the DOM, inert, because the watchdog looks it up.

The extension acts only on that exact pattern. Older Ad-Shield integrations work differently
and are left untouched, because disabling half of one is what triggers the wall. There are no
network rules, no background page and no data collection.

## Install for development

1. Open `chrome://extensions` (or `brave://extensions`).
2. Turn on Developer mode.
3. Choose "Load unpacked" and select the `extension/` folder.

## Commands

Everything runs on plain Node.js 20 or newer. There are no dependencies to install.

| Command | What it does |
| --- | --- |
| `npm run check` | Validates the manifest, locales, icons and scripts. |
| `npm run build` | Checks everything and writes `dist/mysttic-adblock-enjoyer-<version>.zip`. |
| `npm run e2e` | Release gate in a real browser, see [docs/RELEASING.md](docs/RELEASING.md). |
| `npm run assets` | Renders the icons and store graphics from `store/src`. |
| `npm run release:check` | Checks that `VERSION.md`, its copies and `CHANGELOG.md` agree. |
| `node scripts/version.mjs bump patch` | Raises the version (`patch`, `minor` or `major`). |
| `node scripts/chrome-web-store.mjs status` | Shows what the Chrome Web Store holds. |

## Layout

| Path | Contents |
| --- | --- |
| `extension/` | The extension. This folder is what ships. |
| `scripts/` | Check, build, version and store upload. |
| `tools/` | Browser test harness, asset renderer and Ad-Shield research helpers. |
| `store/` | Store listing texts, privacy answers and graphics. |
| `docs/` | The release process. |

## Releasing

The release number lives in [VERSION.md](VERSION.md) and the notes in
[CHANGELOG.md](CHANGELOG.md). A release starts when `VERSION.md` changes on `main`. See
[docs/RELEASING.md](docs/RELEASING.md).

## Privacy

See [PRIVACY.md](PRIVACY.md).
