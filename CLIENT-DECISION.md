# Client decision — SKU-04 v0.1 public alpha

**Decision: host-only. No `dsh.client` / no Client package in S1–S3.**

Reasons:

- Neither `REQ-EINVOICE` nor the S1/S2/S3 acceptance table has a Client row; all required outcomes are model/tool-facing.
- The DESIGN says "S2 再评估三个 slot"; the current Host tools already provide ingest/parse/query/dedup/verify/receipt/redlink/archive/check/restore, so a Client would be an additional surface, not a missing core capability.
- A real Client needs a projection/RPC contract and empty/error/loading states; adding it without a user request would expand the attack surface and the npm/name matrix for no acceptance gain.
- Re-evaluate when: the user requests a UI, GA has a customer-facing requirement, or a projection is needed for review queues.

Not started: `@perrylink/dsh-einvoice-client`, `sidebar.right.pane.tab`, any Client slot registration.
