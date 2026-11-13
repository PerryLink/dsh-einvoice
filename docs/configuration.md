# Configuration and error codes

## Environment

| Variable | Default | Description |
|---|---|---|
| `DSH_EINVOICE_HOME` | `$DSH_HOME/storages/dsh-einvoice` | base directory for `originals/` and the local pool |
| `DSH_EINVOICE_INPUT_ROOTS` | `process.cwd()` | `path.delimiter`-separated input allowlist for `invoice_ingest` |

The bundle passes no config; the defaults are intentionally local-only. S2 may add a `Config` schema for roots/template/retention.

## Errors

| Code | Class | Retryable | User action |
|---|---|---|---|
| `E_INV_FILE_UNREADABLE` | fatal | no | replace/re-export the file |
| `E_INV_PATH_NOT_ALLOWED` | fatal | no | move the file under an allowed root |
| `E_INV_DOC_NOT_FOUND` | fatal | no | run `invoice_ingest` first |
| `E_INV_OFD_UNSUPPORTED` | fatal | no | provide a GB/T 33190 OFD or standalone XML |
| `E_INV_XML_SCHEMA_DRIFT` | needs_review | yes | review unknown fields; do not silently drop |
| `E_INV_FIELD_MISSING` | needs_review | yes | complete the invoice or re-export |
| `E_INV_DUP_CONFLICT` | needs_review | no | review the existing `doc_id`; do not overwrite |
| `E_INV_RECEIPT_INCOMPLETE` | needs_review | yes | provide result_code/verified_at/operator/receipt file |
| `E_INV_RECEIPT_HASH_MISMATCH` | fatal | no | re-export the receipt; do not edit bytes |
| `E_INV_REDLINK_UNBOUND` | needs_review | no | bind a red invoice to a matching blue invoice |
| `E_INV_REDLINK_OVER` | needs_review | no | reduce the allocation or pick a larger blue invoice |
| `E_INV_REDLINK_BOUND` | needs_review | no | review the existing red/blue binding |
| `E_INV_ARCHIVE_EMPTY` | fatal | no | widen the entity/period filter |
| `E_INV_ARCHIVE_MISSING_PART` | retryable | yes | restore the original/receipt file, then rebuild |
| `E_INV_ARCHIVE_INVALID` | fatal | no | rebuild the archive; do not edit its ZIP/manifest |
| `E_INV_ARCHIVE_NOT_FOUND` | fatal | no | check the `pkg_id` or path |
| `E_INV_PKG_ID_INVALID` | fatal | no | rebuild the archive; the manifest `pkg_id` must match `^pkg_[0-9a-f]{16}$` and stay under the restore root |
| `E_INV_NOT_SIGNABLE` | needs_review | no | run `invoice_check`; do not restore a package with missing or mismatched parts |
| `E_INV_STORAGE_FAILED` | retryable | yes (3×) | check disk/permissions |
| `E_INV_UNKNOWN_IMPL` | fatal | no | use `ofd-zip-xml` |

S1/S2/S3 register no R2/R3 tool and no MCP exposure; `invoice_verify` is a local manual queue, not a tax-bureau call.
