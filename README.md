# @perrylink/dsh-einvoice

File-level Chinese e-invoice (OFD/XML) ingest, parse, dedup and local archive for DeepSeek Harness.

> **Status: alpha / public-synthetic / partial / not counted / not GA.** No customer evidence, customer data, or production-readiness claim. All acceptance rows are `counted=false`.

## Install

```sh
dsh plugin --profile <profile> add @perrylink/dsh-einvoice
dsh --profile <profile> --dump-config | grep dsh-einvoice
```

Requires DSH `>=0.2.1-rc.3 <0.3.0` and Node `>=24.9 <25`.

<details>
<summary>中文摘要</summary>

文件级中国电子发票（OFD/XML）入库、解析、去重与本地归档。 安装：`dsh plugin --profile <profile> add @perrylink/dsh-einvoice`。公开/合成、alpha、非 GA。

</details>

## Tools

| Tool | What it does | Risk |
|---|---|---|
| `invoice.ingest` | Ingest one local OFD/XML, compute SHA-256, store the original, idempotent by bytes | R1 local write |
| `invoice.parse` | Parse old OFD `Attachs/original_invoice.xml` or 数电票 `Tags/CustomTag.xml`; return eight fields, lines, evidence and unknown fields | R0 |
| `invoice.query` | Query the local pool by entity, period, lifecycle or text | R0 |
| `invoice.dedup` | Group duplicates by invoice number or seller + date + total | R0 |
| `invoice.review_queue` | Queue parsed invoices for manual local review; optional buyer-tax-id mismatch flags | R1 local write |
| `invoice.record_receipt` | Hash a local receipt, append it and move lifecycle; `verification_source=local_receipt`, `tax_verified=false` | R1 local write |
| `invoice.redlink` | Bind a negative red invoice to its blue invoice and store deltas | R1 local write |
| `invoice.archive` | Build a manifest + originals + receipts ZIP under the local archive directory | R1 local write |
| `invoice.check` | Verify manifest/member hashes, missing files and traversal | R0 |
| `invoice.restore` | Restore a verified archive into the local restore root | R1 local write |

## Input / output

**Input:** one local OFD/XML invoice per `invoice.ingest` call. **Output:** a local invoice pool, review/receipt state, red/blue links, and a deterministic archive ZIP. `invoice.check` verifies the archive; `invoice.restore` restores it locally.

## Configuration

| Env | Default | Meaning |
|---|---|---|
| `DSH_EINVOICE_HOME` | `$DSH_HOME/storages/dsh-einvoice` | originals directory and local pool base |
| `DSH_EINVOICE_INPUT_ROOTS` | `current working directory` | `path.delimiter`-separated allowlist for `invoice.ingest` |

## Limits / non-claims

- No OCR/scanning, tax-bureau verification/receipt, tax filing, 30-year archive compliance, or real-invoice accuracy claim.
- `invoice.record_receipt` is local-only: `verification_source=local_receipt`, `tax_verified=false`.
- No IMAP/email fetching, ERP posting, e-signature legal opinion, or Client UI.
- S1 accepts one local file per `invoice.ingest`; directory batches are not part of this package.
- Public samples with PII are kept outside the tarball; do not paste raw invoice output into logs or public issues.
- No customer evidence, customer data, or production-readiness claim; all fixtures are public/synthetic.

## Public sample

Synthetic invoice XML/OFD fixtures; `ACCEPTANCE.csv` lists 7 public checks (one is `out_of_scope`). No real invoice is included.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm gate:sku04
```

## License

Apache-2.0. See `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES`.
