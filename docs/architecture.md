# Architecture — @perrylink/dsh-einvoice S1

```text
core/        invoice.ts       pure eight-field normalization, money, dates, tax-id shape, errors
adapters/    ofd-zip-xml.ts   OFD ZIP + XML reader (old attachment / 数电 CustomTag + ObjectRef / standalone XML)
registry/    parsers.ts       frozen parser table: "ofd-zip-xml@1"
plugin/      index.ts         DSH Host entry: tools + storageDomain
             tools.ts         invoice.ingest / invoice.parse / invoice.query
             storage.ts       fin_invoice domain (JSON KV), originals store, ULID, hashes
```

Data flow:

```text
local file -> invoice.ingest (path allowlist, size, SHA-256, original copy, ULID doc_id)
           -> invoice.parse  (parser registry -> adapter -> core normalization -> storage update)
           -> invoice.query  (snapshot iteration/filter/page)
```

## Parser paths

1. **Old OFD invoice**: `Doc_0/Attachs/original_invoice.xml` (40-ish fields), maps `InvoiceNo`, `InvoiceCode`, `IssueDate`, buyer/seller, totals and `GoodsInfos`.
2. **数电票 OFD**: `Doc_0/Tags/CustomTag.xml` references page `TextObject` ids; the adapter collects all `Pages/*/Content.xml` `TextObject` text and resolves the eight fields.
3. **Standalone XML**: generic `Invoice`/`eInvoice` root; used by synthetic fixtures.

`unknown_fields` keeps unmapped top-level XML keys (and buyer/seller extras); `field_evidence` records the XML path or ObjectRef ids.

## Storage

`defineDomain({ name: 'fin_invoice', version: 1, tables: { invoices } })` with `ctx.storageDomain.open()`. It is a JSON KV document, not a relational table: no foreign keys, no cross-table transactions, no migrations. `doc_id` is a ULID; `(entity_id, invoice_no)` uniqueness is checked in application code; `source_sha256` makes ingest idempotent. Amounts are integer cents; dates are ISO `YYYY-MM-DD`.

## Security boundaries

- `core/` has no Cordis/DSH imports; adapters do not register tools; only `plugin/` wires `ctx.tools`/`ctx.storageDomain`.
- Input paths are realpath-resolved and must be under the configured roots; symlink escapes are rejected.
- OFD unzip is bounded (≤1000 entries, ≤100 MB uncompressed) and XML entity processing is disabled.
- Logs and render text stay concise; raw names/tax ids are not written to logs.
- R2/R3 tools are not registered in S1; MCP exposure is `none`.
