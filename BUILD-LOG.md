# BUILD-LOG — @perrylink/dsh-einvoice

## 2026-10-31 — S1 / 0.1.0-alpha.0

- Target: `0.2.1-rc.3 @ 22ddee3792`; `engines.dsh >=0.2.1-rc.3 <0.3.0`.
- Evidence: customer gate still PARK; B2 public demo approved by user. S1 acceptance is `partial` / `not counted`.
- Package: `@perrylink/dsh-einvoice@0.1.0-alpha.0`; `dsh.bundle.patch: ./cordis.patch.yml`; no Client; no R2/R3; MCP none.

### Commands

| Command | Result |
|---|---|
| `pnpm install --registry=https://registry.npmjs.org/` | 37 packages, lockfile written |
| `pnpm build` | pass |
| `pnpm lint` | pass (core/adapters/registry direction + bundle manifest) |
| `pnpm typecheck` | pass |
| `pnpm test` | 11/11 tests pass |
| `pnpm gate:sku04` | exit 0; `ACCEPTANCE.csv` 3 S1 rows; `evidence/s1-…/result.json` |

### Decisions

- Storage domain must be `fin_invoice` (DSH `UNIT_NAME_RE` rejects `fin-invoice`); documented in plan/data.
- S1 accepts one local file per ingest; directory batches and export are S2.
- 数电票 OFD has no `original_invoice.xml`; fields come from `CustomTag.xml` + `ObjectRef` text, so the adapter has two paths.
- `ofdrw` is Java: kept as B-class reference, not bundled; S1 uses `fflate` + `fast-xml-parser` in a thin Node adapter.
- Public samples stay in `.tmp`; only synthetic fixtures are committed.

### Not done yet

- Client UI, dedup, verification/receipt, red/blue matching, archive package/check (S2/S3).
- DSH profile install smoke and npm publish (next steps).
- Customer/GA evidence (PARK).

### npm publish attempt (2026-10-31 00:57 +08)

- `npm publish --access public --tag next --registry=https://registry.npmjs.org/` → exit 0; server `PUT` **202**; npm printed `+ @perrylink/dsh-einvoice@0.1.0-alpha.0`; tarball shasum `81912733aa84c7144cd5b12c0b18c694339b88d7`.
- Registry still returns 404 for the package root; `dist-tags` returns `{"latest":"0.0.0-stage"}`; owner is `perrylink`. This is npm's staged-publish placeholder; the real `0.1.0-alpha.0` needs maintainer **2FA approval**.
- See `PUBLISH-BLOCKED.md`; no unpublish/deprecate/approve was attempted. **Not installable from npm yet.**

### npm publish verified (2026-10-31 01:02 +08)

- `npm view @perrylink/dsh-einvoice dist-tags version` → `latest: 0.1.0-alpha.0`, `next: 0.1.0-alpha.0`, `version: 0.1.0-alpha.0`; tarball shasum `81912733aa84c7144cd5b12c0b18c694339b88d7`.
- `0.0.0-stage` was a temporary first-publish placeholder; it resolved after propagation. `latest` points to alpha because it is the only version; GA later moves it.
- See `PUBLISH-STATUS.md`.

### Registry install smoke (2026-10-31 01:05 +08)

- Temp `DSH_HOME`, `dsh plugin add @perrylink/dsh-einvoice@0.1.0-alpha.0` → installed `0.1.0-alpha.0`; `--dump-config` shows `# == @perrylink/dsh-einvoice`; remove clears the layer.
- Peer warnings only (`@deepseek-ai/*` peers); the published package resolves its runtime dependencies and the host provides the DSH services.
