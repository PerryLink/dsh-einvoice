# Changelog

## 0.1.0-alpha.0 — 2026-10-31

- First S1 slice: `invoice.ingest`, `invoice.parse`, `invoice.query`.
- OFD old `original_invoice.xml`, 数电 `CustomTag.xml` + ObjectRef, and standalone XML parsing.
- `fin_invoice` storage domain, local originals, ULID doc ids, SHA-256 idempotency.
- Acceptance: 3 S1 rows, `status: partial`, `not counted` toward GA.
