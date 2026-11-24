# Store listing: English

Copy each block into the matching field of the Store listing tab.

## Name

Taken from the package (`_locales/en/messages.json`).

```
Mysttic Adblock Enjoyer
```

## Summary

Taken from the package. At most 132 characters.

```
Defuses the Ad-Shield anti-adblock wall ("Please allow ads on this site") before it can wipe the page or redirect you.
```

## Category

```
Privacy & Security
```

## Language

```
English
```

## Description

```
Some websites use Ad-Shield to detect ad blockers. When its check trips, the page goes blank, a dialog says "Please allow ads on this site. Click OK to learn more.", and you are reloaded or sent to an error-report.com page. It can happen even when your blocker did nothing wrong: a single anti-popup filter is enough to trip it.

Mysttic Adblock Enjoyer stops that wall before it starts.

HOW IT WORKS
• It recognises the two Ad-Shield tags, the loader and its watchdog, by their code signature while the page is still loading.
• It switches both off before the browser runs them. No blank page, no dialog, no redirect.
• Pages without Ad-Shield are not touched.

WHAT IT IS NOT
• Not an ad blocker. It blocks no ads and no network requests. Keep using the blocker you like.
• Not a paywall or login bypass.

SCOPE
It supports sites that use the current Ad-Shield loader (SDK 1.2.x). Older Ad-Shield integrations are left untouched on purpose and may still show the wall.

PRIVACY
• Collects nothing and sends nothing. No account, no ads, no analytics.
• No background page and no remote code. The whole extension is one small script.

WHY IT NEEDS ACCESS TO ALL SITES
Ad-Shield is used on many unrelated sites and has to be stopped before the page's own scripts run, so the script is injected on every page at document start. It only looks at script tags, and it stops watching as soon as a page without Ad-Shield has finished loading.
```

## Graphics

| Field | File |
| --- | --- |
| Screenshot 1 | `store/assets/screenshot-1-en.png` |
| Screenshot 2 | `store/assets/screenshot-2-en.png` |
| Small promo tile | `store/assets/promo-small-440x280.png` |
| Marquee promo tile (optional) | `store/assets/promo-marquee-1400x560.png` |
