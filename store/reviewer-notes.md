# Notes for reviewers

Paste the block below into the test instructions for reviewers.

```
This extension has no user interface. It is a single content script that prevents the Ad-Shield anti-adblock script from blanking pages and redirecting users.

How to verify it:

1. Without the extension, open DevTools on https://haps.pl/ , open "Network request blocking" (More tools), add the patterns *html-load.com* and *content-loader.com* , enable blocking and reload. The page content is replaced by a full-page "allow ads" message from report.error-report.com. On some setups it is a "Please allow ads on this site. Click OK to learn more." dialog instead. This is what users of DNS based or list based blockers see.

2. Install the extension and repeat step 1. The page loads normally.

What the extension does: at document_start it looks for the two Ad-Shield script tags (the loader with packed onload/onerror attributes and the inline watchdog), recognises them by their code signature, and makes them non-executable before the browser runs them. It changes nothing else on the page.

It makes no network requests, stores nothing and collects no data. It needs to run on all sites because Ad-Shield is embedded on many unrelated sites and must be stopped before page scripts run.

Other pages that used the same loader when this was written: https://www.whathifi.com/ and https://www.pcgamer.com/ .
```

Both steps were checked on 2026-11-24 in Chrome with the same request blocking that DevTools
uses:

```sh
node tools/cdp-run.js --block "*html-load.com*" --block "*content-loader.com*" https://haps.pl/ | node tools/summarize.js
```

Add `--ext extension` for step 2. Run them again before a submission, because the sites can
change.
