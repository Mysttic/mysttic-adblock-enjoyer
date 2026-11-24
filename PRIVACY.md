# Privacy policy

Mysttic Adblock Enjoyer does not collect, store, transmit or sell any data.

- It has no server, no analytics, no ads and no accounts.
- It makes no network requests of its own.
- It has no background page and loads no remote code.

## What it does on a page

The extension injects one script into every page you open. The script looks at the `<script>`
tags of the page while it loads and checks them for the code signature of the Ad-Shield
anti-adblock loader. When it finds that loader, it switches off the loader tag and its
watchdog tag. It reads nothing else on the page: no text, no form fields, no cookies and no
browsing history. On pages without Ad-Shield it stops watching as soon as the page has loaded.

## Why it asks for access to all sites

Ad-Shield is embedded on many unrelated websites and has to be stopped before the page's own
scripts run. That is only possible with a script that the browser injects on every page at
document start.

## Changes

Changes to this policy are published in this file together with the release that introduces
them.
