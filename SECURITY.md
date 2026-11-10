# Security policy

## Supported versions

Security fixes are applied to the latest minor release of the current major
version. Older majors are not patched.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's
private vulnerability reporting for this repository
(<https://github.com/sundown111/term-highlight/security/advisories/new>).

Include the affected version, a minimal reproduction, and the impact you
expect. You can expect an acknowledgement within a few days; this is a
volunteer-maintained project and there is no formal SLA. Fixes are released as a
patch version with a CHANGELOG entry, and credit is given unless you prefer
otherwise.

## Scope

In scope: DOM/CSS injection through terms, group names or styles; mutation of
application-owned DOM by the `css-highlight`/`none` strategies; resource leaks
that survive `destroy()`.

Out of scope: regular-expression denial of service caused by an unsafe
`RegExp` that the application passes in (documented in
[`docs/security.md`](docs/security.md)), and vulnerabilities in development-only
dependencies that are never published.

## Maintenance expectations

- Semantic versioning; breaking changes only in major versions, always listed
  in `CHANGELOG.md` with migration notes.
- Browser support follows the CSS Custom Highlight API baseline documented in
  the README; unsupported browsers degrade to the `none` strategy.
- Releases are validated by CI (types, lint, tests with coverage thresholds,
  Chromium/Firefox/WebKit tests, packed-tarball tests) and are intended to be
  published with npm provenance.
