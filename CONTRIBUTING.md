# Contributing

Thanks for taking a look at `dsh-einvoice`.

## Before you start

- This is a **public/synthetic alpha** project, not a production product. Do not send customer data, customer documents, credentials, or private evidence.
- The project is alpha. Small, focused fixes and documentation corrections are welcome; large features should be discussed first.
- One pull request should do one thing. Keep generated evidence and unrelated formatting out of the diff.

## Local checks

```sh
pnpm install --frozen-lockfile
pnpm build && pnpm lint && pnpm typecheck && pnpm test
```

For the suite repositories, also run:

```sh
node scripts/check.mjs
npm pack --dry-run
```

## Pull requests

- Describe the user-visible problem and the failure before the fix.
- Include a regression test or a fixture-backed reproduction.
- Update `CHANGELOG.md` for user-visible changes.
- Do not add a network call, model call, telemetry, or a customer-data path without an explicit design discussion.
- By contributing, you agree your contribution is licensed under Apache-2.0.

## Security

Do not open a public issue for a vulnerability; see `SECURITY.md`.
