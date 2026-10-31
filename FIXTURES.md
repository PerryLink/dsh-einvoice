# Fixtures — SKU-04 S1

## Policy

- **Customer evidence is permanently out of scope**: public/synthetic fixtures are parser/demo data only and are `not counted`; there is no customer/GA gate to satisfy.
- **No raw PII in the repository.** Public OFD samples from `ofdrw` contain real or realistic company names, tax ids, addresses, bank accounts and operator names. They stay in `04-build/.tmp/oss-samples/` (gitignored) and are never copied into `fixtures/input/` or a tarball.
- `fixtures/input/` is gitignored. Only redacted public samples may be placed there for a local run.
- Synthetic fixtures contain only fictional names and tax ids; they are created in tests/acceptance and need no external file.

## S1 synthetic samples

| Sample | Kind | Source | Purpose |
|---|---|---|---|
| old-ofd | OFD with `Attachs/original_invoice.xml` | synthetic (test) | old invoice XML path |
| digital-ofd | OFD with `Tags/CustomTag.xml` + ObjectRef | synthetic (test) | 数电票 path |
| generic-xml | standalone `Invoice` XML | synthetic (test) | XML path |
| negative: empty | 0 bytes | synthetic | fail closed |
| negative: bad zip | ZIP without `OFD.xml` | synthetic | fail closed |
| s2 receipt | `result_code=100; 验真` text file | synthetic | receipt hash/idempotency |
| s3 blue/red | positive + negative XML pair | synthetic | redlink/archive/check/restore |

## Public candidates (not counted; `.tmp` only)

See [`OPEN-SOURCE-SAMPLES.md`](./OPEN-SOURCE-SAMPLES.md) and [`oss-samples-manifest.json`](./oss-samples-manifest.json).

| Source | Count | License | Use |
|---|---:|---|---|
| ofdrw/ofdrw | 1 数电 OFD + 3 old OFD + 1 malformed + 1 stamp | MIT | parser compatibility; local only; redact before any commit |
| invoice-github | 20 synthetic PDFs + fake OFD/XML | MIT | XML/QR/negative shape only |

## Reproducibility

- `scripts/acceptance.mjs` writes `evidence/<run_id>/result.json` with sample SHA-256 values (synthetic) and metrics.
- Tests use `TZ=Asia/Shanghai LC_ALL=C.UTF-8` in CI/acceptance; no randomised money/date values.
- Public sample hashes are in `oss-samples-manifest.json`; the raw files are intentionally absent from git.
