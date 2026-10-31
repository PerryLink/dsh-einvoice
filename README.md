# @perrylink/dsh-einvoice

File-level Chinese e-invoice ingest, parse and pool for DeepSeek Harness (SKU-04 S1).

> **Status: file-level public demo (0.2.0-alpha.1) — PARTIAL, NOT COUNTED, NOT GA.**
> This package does **not** implement OCR/scanning, tax-bureau verification/receipt, tax filing, 30-year archive compliance, or real-invoice accuracy claims. `invoice.review_queue` / `invoice.record_receipt` are local-only; the legacy names are deprecated aliases. Customer-evidence work (2 enterprises + 1 bookkeeping firm + 100 real invoices) is **permanently out of scope**. This package is public-only; its acceptance rows are `not counted`. Do not describe it as GA-ready.

## Install

```sh
dsh plugin --profile <profile> add @perrylink/dsh-einvoice
dsh --profile <profile> --dump-config | grep dsh-einvoice
```

The bundle inserts one Host row. It requires the base profile's `tools` and `storageDomain` services and a configured storage backend (the shipped base profile uses `storage-json`).

## Tools (S1)

| Tool | What it does | Risk |
|---|---|---|
| `invoice.ingest` | Ingest one local OFD/XML file, compute SHA-256, store the original locally, idempotent by bytes | R1 local write |
| `invoice.parse` | Parse old OFD `Attachs/original_invoice.xml` or 数电票 `Tags/CustomTag.xml` + ObjectRef; return eight fields, lines, evidence and unknown fields | R0 |
| `invoice.query` | Query the invoice pool by entity, period, lifecycle or text | R0 |
| `invoice.dedup` | Group duplicates by invoice number or seller+date+total | R0 |
| `invoice.review_queue` | Queue parsed invoices for manual local review; optional buyer-tax-id mismatch flags. Old `invoice.verify` is a deprecated alias. | R1 local write |
| `invoice.record_receipt` | Hash a local receipt, append it, move lifecycle to receipt-recorded/quarantined; `verification_source=local_receipt`, `tax_verified=false`; old `invoice.receipt` is a deprecated alias. | R1 local write |
| `invoice.redlink` | Bind a negative red invoice to its blue invoice; store deltas | R1 local write |
| `invoice.archive` | Build a manifest + originals + receipts ZIP under the local archive directory | R1 local write |
| `invoice.check` | Verify manifest/member hashes, missing files and traversal | R0 |
| `invoice.restore` | Restore a verified archive into the local restore root | R1 local write |

Client: deferred; see `CLIENT-DECISION.md`. GA: blocked by the customer evidence gate; see `GA-CHECKLIST.md`.

S3 adds red/blue matching, deterministic archive packages, check and restore. S2 verification is manual/local (no tax-bureau network call).

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `DSH_EINVOICE_HOME` | `$DSH_HOME/storages/dsh-einvoice` | originals directory and local pool base |
| `DSH_EINVOICE_INPUT_ROOTS` | current working directory | `path.delimiter`-separated allowlist for `invoice.ingest` |

No credentials, no network, no IMAP/OCR in S1.

## Limitations

- No IMAP/email fetching, OCR engine, tax-bureau verification, ERP posting, e-signature legal opinion, or Client UI.
- S1 accepts one local file per `invoice.ingest` call; directory batches are S2.
- `unknown_fields`/`field_evidence` are stored locally and may contain the same sensitive fields as the invoice; keep the pool local and do not paste raw output into logs or public issues.
- Public samples with PII are kept in `.tmp` only; they are not shipped in the tarball.

## Failure paths

Errors are thrown as `E_INV_*` (`E_INV_FILE_UNREADABLE`, `E_INV_PATH_NOT_ALLOWED`, `E_INV_OFD_UNSUPPORTED`, `E_INV_XML_SCHEMA_DRIFT`, `E_INV_FIELD_MISSING`, `E_INV_DOC_NOT_FOUND`, `E_INV_DUP_CONFLICT`, `E_INV_STORAGE_FAILED`, `E_INV_UNKNOWN_IMPL`). DSH renders thrown errors as tool errors; they are not returned as successful `{ok:false}` values.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm lint
pnpm typecheck
pnpm test
pnpm gate:sku04
```

See `docs/architecture.md`, `docs/plugin-development.md`, `docs/configuration.md`, `FIXTURES.md`, `BUILD-PLAN-04.md`.

## License

Apache-2.0. Third-party notices in `NOTICE` and `THIRD-PARTY-NOTICES`.
