# Version

1.1.0

---

The release number of Mysttic Adblock Enjoyer, and the single source of truth for
it. `package.json` and `extension/manifest.json` repeat it, and
`node scripts/version.mjs check` fails when either of them disagrees.

A release happens only when this file changes on `main`, in practice through
a `develop` → `main` pull request. Raise it with
`node scripts/version.mjs bump patch` (or `minor`, `major`): that updates every
copy and dates the `Unreleased` section of CHANGELOG.md, which then gets a
sentence or two on what the release is about.
