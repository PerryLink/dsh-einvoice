# Changelog

## [0.2.0-alpha.9] — 2026-11-01

### Added

- `invoice.code_check`: EN 16931 code-list validation for currency (ISO 4217), country (ISO 3166-1 alpha-2) and VAT category (BR-CL-17). Well-formed but unlisted values are reported as unknown, never as invalid. Verified by `node --test test/*.test.mjs` (31/31).

## [Unreleased]

### Added

- `invoice.tax_id_check`: Chinese Unified Social Credit Code validation (18 characters, GB 32100-2015 mod-31 check character). Verified by `node --test test/uscc.test.mjs` (4/4) and the full suite (27/27); no third-party code or fixtures.

## [0.2.0-alpha.7] — 2026-11-01

### Changed

- Documentation: five-language fixture/acceptance links now resolve on npm; added specific related-checker/tool links.
- Marketplace metadata: taxonomy category, archetype, domains and status; docs page now shows the same.
- Added a real terminal hero (and GIF for the active docs set) plus `TROUBLESHOOTING.md`.

All notable changes to `dsh-einvoice` are documented here. The format follows Keep a Changelog; this project uses alpha versions.

## [0.2.0-alpha.6] — 2026-11-01

### Added

- Five-language READMEs: English, 简体中文, Español, Português, हिन्दी.
- Local workflow SVG at `docs/assets/dsh-einvoice-flow.svg`.
- Family cross-links (domain index, checker family, `dsh-kit`), compatibility, permissions, and related-work sections.
- Standard repository files: `SECURITY.md`, `PRIVACY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, and `icon.svg`.

### Changed

- README aligned with the PerryLink DSH checker/plugin family style; package remains public/synthetic, alpha, not GA.

## [Earlier]

Earlier alpha builds are available from npm and GitHub Releases; this file starts at the family-standard documentation wave.
