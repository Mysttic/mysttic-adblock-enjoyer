# Changelog

Everything worth knowing about each release of Mysttic Adblock Enjoyer. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
numbering follows [semantic versioning](https://semver.org/spec/v2.0.0.html).

The release number lives in [VERSION.md](VERSION.md) and is what triggers a
release: the workflow starts only when that file was among the changes merged
into `main`.

## [Unreleased]

## [1.1.0] - 2026-11-24

The first release: the Ad-Shield wall is stopped before it starts, on any site
that uses the current Ad-Shield loader.

### Added

- Defuses the Ad-Shield loader (SDK 1.2.x) and its inline watchdog before the
  browser runs them, so the page is not blanked, the "Please allow ads on this
  site" dialog does not appear and nothing redirects to `error-report.com`.
- Acts only on that full pattern. Older Ad-Shield embeds are left untouched,
  because disabling half of one is what triggers the wall.
- No network rules, no background page and no data collection.
- English and Polish name and description.

[Unreleased]: https://github.com/Mysttic/mysttic-adblock-enjoyer/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/Mysttic/mysttic-adblock-enjoyer/releases/tag/v1.1.0
