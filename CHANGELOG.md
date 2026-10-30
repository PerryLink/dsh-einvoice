# Changelog

## 0.1.0-alpha.3 — 2026-10-31

- Public-sample compatibility: old ofdrw `1.ofd`, digital `20240531.ofd`, old `invoice-sample.ofd` and invoice-github XML-in-OFD parse; unit prices round from tax-calc precision; malformed/non-invoice samples fail closed.
- Added `test/public-samples.test.mjs` (skips when `.tmp` samples are absent).

## 0.1.0-alpha.2 — 2026-10-31

- S3: `invoice.redlink`, `invoice.archive` (manifest + originals + receipts), `invoice.check`, `invoice.restore`.
- Optional `redlink` field and `source_name` on the existing `fin_invoice` domain; archive/restore live under `DSH_EINVOICE_HOME`.
- Acceptance adds SKU-04-A03/A04; still public/synthetic and `partial`.

## 0.1.0-alpha.1 — 2026-10-31

- S2: `invoice.dedup`, `invoice.verify` (local manual queue), `invoice.receipt` (hash/idempotent local receipt).
- Optional `verification`/`receipts` fields on the existing `fin_invoice` domain (backward-compatible).
- Acceptance adds SKU-04-A05 receipt completeness; still public/synthetic and `partial`.

## 0.1.0-alpha.0 — 2026-10-31

- First S1 slice: `invoice.ingest`, `invoice.parse`, `invoice.query`.
- OFD old `original_invoice.xml`, 数电 `CustomTag.xml` + ObjectRef, and standalone XML parsing.
- `fin_invoice` storage domain, local originals, ULID doc ids, SHA-256 idempotency.
- Acceptance: 3 S1 rows, `status: partial`, `not counted` toward GA.
