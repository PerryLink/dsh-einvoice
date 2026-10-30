# Plugin development — adding a parser

The S1 parser registry is deliberately small: one adapter, `ofd-zip-xml@1`.

1. Add a new adapter under `src/adapters/` implementing `ParserAdapter` (`id`, `version`, `supports`, `parse`). It must return `ParsedInvoice` from `src/core/invoice.ts`; it may import `fflate`, `fast-xml-parser`, and core, but must not import `ctx` or register tools.
2. Register the adapter in `src/registry/parsers.ts`. The registry is built once at module load; duplicate ids throw, unknown ids throw `E_INV_UNKNOWN_IMPL`, and no runtime mutation is allowed.
3. Add fixtures under `fixtures/synthetic/` (no PII) or `fixtures/input/` (gitignored; public/redacted only) and tests under `test/`.
4. Run `pnpm lint && pnpm typecheck && pnpm test && pnpm gate:sku04`.

Profiles: `invoice.parse` accepts `profile` as the registry id. S1 only ships `ofd-zip-xml`; a future `ofdrw-cli` adapter would be a B-class external process and must not be bundled.

Do not add a registry for a single implementation; the registry exists because OFD/XML parser variants are expected (old invoice XML, 数电 CustomTag, standalone XML).
