# Contributing

- License: Apache-2.0. By contributing you agree to the Developer Certificate of Origin (DCO) 1.1; sign off commits with `git commit -s`.
- Keep third-party code within the allowed set (MIT / Apache-2.0 / BSD-2/3 / ISC / 0BSD; OFL-1.1 for fonts only). Do not add GPL/AGPL/SSPL, Odoo, Firefly III, veraPDF, Ghostscript/mutool/poppler, Aspose/Draftable or other commercial SDKs.
- Preserve upstream LICENSE/NOTICE for reused code and mark modified files with `Modified by PerryLink 2026-10`.
- Do not commit real invoices, customer PII, `.env`, `.pem`, tokens or `fixtures/input/`.
- Run `pnpm lint && pnpm typecheck && pnpm test && pnpm gate:sku04` before a PR.
- Public sample data needs a license review and redaction; see `FIXTURES.md`.
