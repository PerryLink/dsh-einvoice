<div align="center">

# dsh-einvoice

> **Official repository.** The only official repository of this package, maintained by PerryLink. Same-name repositories under other accounts are not affiliated. Apache-2.0.

[![npm](https://img.shields.io/npm/v/dsh-einvoice)](https://www.npmjs.com/package/dsh-einvoice)
[![CI](https://github.com/PerryLink/dsh-einvoice/actions/workflows/ci.yml/badge.svg)](https://github.com/PerryLink/dsh-einvoice/actions)
[![License](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)
[![dsh-plugin](https://img.shields.io/badge/dsh--plugin-%E2%9C%93-green)](https://github.com/topics/dsh-plugin)
[![docs](https://img.shields.io/badge/docs-domain%20index-0b5fff)](https://perrylink.github.io/dsh-plugins/)
[![Gitee](https://img.shields.io/badge/Gitee-aggregate-c71d23?logo=gitee)](https://gitee.com/perrylink/dsh-plugins)
[![dshfind](https://dshfind.com/api/badge/PerryLink/dsh-einvoice?metric=downloads)](https://dshfind.com/plugins/PerryLink/dsh-einvoice?ref=badge)
[![DSH Market](https://raw.githubusercontent.com/2BingLing/dsh-market/master/assets/readme/badge-listed-en.svg)](https://dsh.market/)
[![Node](https://img.shields.io/badge/node-24.9%2B-brightgreen)](#)
[![npm downloads](https://img.shields.io/npm/dm/dsh-einvoice)](https://www.npmjs.com/package/dsh-einvoice)

**File-level Chinese e-invoice (OFD/XML) ingest, parse, dedup and local archive.**

> **Status: alpha / public-synthetic / partial / not counted / not GA.** No customer evidence, customer data, or production-readiness claim.

[English](README.md) · [简体中文](README-zh.md) · [Español](README-es.md) · [Português](README-pt.md) · [हिन्दी](README-hi.md)

```sh
dsh plugin --profile <profile> add dsh-einvoice
```

</div>

> ⭐ If this helps, a star makes it easier for the next person to find it. Nothing is gated behind it.

![Workflow diagram for dsh-einvoice: local input, plugin, local output.](docs/assets/dsh-einvoice-flow.svg)

*Workflow: local input → plugin → local output. No model call is required.*

## Install

Install and verify:

```sh
dsh plugin --profile <profile> add dsh-einvoice
dsh --profile <profile> --dump-config | grep dsh-einvoice
```

Uninstall:

```sh
dsh plugin --profile <profile> remove dsh-einvoice
```

## What it does

File-level Chinese e-invoice (OFD/XML) ingest, parse, dedup and local archive. Runs locally on DeepSeek Harness. The table below is the exact tool surface; the examples use the real command surface.

Input and output stay local; nothing is uploaded.

## Tools

Tool names and descriptions are kept in English to match the runtime output.

| Tool | Purpose | Risk |
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

## Quick start

```sh
dsh plugin --profile <profile> add dsh-einvoice
dsh --profile <profile> --dump-config | grep dsh-einvoice
```

## Limits

- Public/synthetic only; no customer data or customer evidence.
- Alpha/partial, not counted, no GA or production-readiness claim.
- No model or network call unless a tool explicitly says so.
- The exact per-tool boundaries are in the table and `ACCEPTANCE.csv`.

## Public sample

Public/synthetic fixtures live in `test/fixtures/`; `ACCEPTANCE.csv` records the public checks with `counted=false`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

## Compatibility

| Surface | Status |
|---|---|
| Harness | `dsh >=0.2.1-rc.3 <0.3.0` |
| Node | `>=24.9.0 <25` |
| Platforms | All; local files only |
| Data | No network, no model call, no upload |

## Permissions & data

- Runs locally; no network, no model call, no upload.
- Public/synthetic fixtures only; no customer data, no customer evidence.
- Alpha/partial; not counted, no GA or production-readiness claim.
- Frozen packages stay installable; no new features, only genuine breakage fixes.

## Related work

Sibling packages and family indexes: [dsh-bankrec](https://github.com/PerryLink/dsh-bankrec) · [dsh-ap-three-way](https://github.com/PerryLink/dsh-ap-three-way) · [dsh-travel-recon](https://github.com/PerryLink/dsh-travel-recon) · [dsh-finops-suite](https://github.com/PerryLink/dsh-finops-suite)

- [Domain index](https://perrylink.github.io/dsh-plugins/)
- [Checker family](https://perrylink.github.io/zh/checkers/)
- [Mainline family](https://github.com/PerryLink/dsh-kit)
- [Scenario article](https://perrylink.github.io/dsh-plugins/articles/finops-suite.html)

## Family

<details>
<summary>DSH domain plugin family (15 packages + 2 suites)</summary>

| Package | npm |
|---|---|
| **[dsh-einvoice](https://github.com/PerryLink/dsh-einvoice)** | [npm](https://www.npmjs.com/package/dsh-einvoice) |
| **[dsh-docx-redline](https://github.com/PerryLink/dsh-docx-redline)** | [npm](https://www.npmjs.com/package/dsh-docx-redline) |
| **[dsh-policy-ledger](https://github.com/PerryLink/dsh-policy-ledger)** | [npm](https://www.npmjs.com/package/dsh-policy-ledger) |
| **[dsh-ghg](https://github.com/PerryLink/dsh-ghg)** | [npm](https://www.npmjs.com/package/dsh-ghg) |
| **[dsh-bankrec](https://github.com/PerryLink/dsh-bankrec)** | [npm](https://www.npmjs.com/package/dsh-bankrec) |
| **[dsh-ap-three-way](https://github.com/PerryLink/dsh-ap-three-way)** | [npm](https://www.npmjs.com/package/dsh-ap-three-way) |
| **[dsh-ifc-qto](https://github.com/PerryLink/dsh-ifc-qto)** | [npm](https://www.npmjs.com/package/dsh-ifc-qto) |
| **[dsh-qms-capa](https://github.com/PerryLink/dsh-qms-capa)** | [npm](https://www.npmjs.com/package/dsh-qms-capa) |
| **[dsh-legal-intake](https://github.com/PerryLink/dsh-legal-intake)** | [npm](https://www.npmjs.com/package/dsh-legal-intake) |
| **[dsh-legal-clause](https://github.com/PerryLink/dsh-legal-clause)** | [npm](https://www.npmjs.com/package/dsh-legal-clause) |
| **[dsh-freight-audit](https://github.com/PerryLink/dsh-freight-audit)** | [npm](https://www.npmjs.com/package/dsh-freight-audit) |
| **[dsh-hs-candidate](https://github.com/PerryLink/dsh-hs-candidate)** | [npm](https://www.npmjs.com/package/dsh-hs-candidate) |
| **[dsh-travel-recon](https://github.com/PerryLink/dsh-travel-recon)** | [npm](https://www.npmjs.com/package/dsh-travel-recon) |
| **[dsh-pim-lint](https://github.com/PerryLink/dsh-pim-lint)** | [npm](https://www.npmjs.com/package/dsh-pim-lint) |
| **[dsh-eval-pack](https://github.com/PerryLink/dsh-eval-pack)** | [npm](https://www.npmjs.com/package/dsh-eval-pack) |
| **[dsh-finops-suite](https://github.com/PerryLink/dsh-finops-suite)** | [npm](https://www.npmjs.com/package/dsh-finops-suite) |
| **[dsh-contract-suite](https://github.com/PerryLink/dsh-contract-suite)** | [npm](https://www.npmjs.com/package/dsh-contract-suite) |

</details>

## License

Apache-2.0. See `LICENSE`, `NOTICE`, `THIRD-PARTY-NOTICES`.
