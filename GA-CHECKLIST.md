# GA checklist — SKU-04

Status: **NOT GA** (`0.1.0-alpha.3` on `next`; `latest` is still `0.1.0-alpha.0`).

| Gate | Required | Current | Result |
|---|---|---:|---|
| Customer evidence | 2 enterprises + 1 bookkeeping firm + 100 real invoices (60 数电 / 25 scans / 10 red / 5 abnormal) | 0 / 0 / 0 | **FAIL — PARK** |
| Scan/OCR | A02 scans/OCR (25 scans) | not run; S1-S3 do not ship OCR | **not counted** |
| Real red/blue | 10 real red-link pairs | 1 synthetic pair only | **partial** |
| Public sample parser | 4 public OFD samples | 4/4 parse; 1 known missing-tax case | **public demo only** |
| Receipt/archive | local receipt + archive/check/restore | 6/6 acceptance rows pass on synthetic | **partial** |
| Client | optional | defer; see `CLIENT-DECISION.md` | **deferred** |
| npm publish | at least one version | alpha.0 latest, alpha.3 next | **published alpha** |

Unblock: supply the customer evidence or explicitly approve a public/synthetic demo for a named SKU. Do not market this package as GA.
