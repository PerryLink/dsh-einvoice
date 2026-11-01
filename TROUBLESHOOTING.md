# Troubleshooting — dsh-einvoice

## Install or activation fails

- DSH must satisfy `>=0.2.1-rc.3 <0.3.0`; Node must be `>=24.9 <25`.
- Run `dsh --version` and `node --version`, then retry with a fresh `DSH_HOME`:

```sh
export DSH_HOME="$(mktemp -d)"
dsh plugin --profile <profile> add dsh-einvoice
dsh --profile <profile> --dump-config | grep dsh-einvoice
```

## The tool cannot find an input

- All paths are local. Use an absolute path, or a path relative to the process working directory.
- The public samples under `fixtures/` are repository-only; they are not shipped in the npm tarball. Download them from the GitHub repository if needed.
- Supported material: OFD/XML invoice files.

## Parse or encoding failures

- Text inputs must be UTF-8; CSV headers must match the README's documented column names.
- Remove a UTF-8 BOM if the first header is reported as unknown.
- Check that the file is a local OFD/XML invoice and that `invoice.parse` is called after `invoice.ingest`.

## Permission or write failures

- Tools marked `R1 local write` write under the configured DSH data directory.
- For tests, point `DSH_HOME` at a temporary directory; do not write into a real profile.

## The result looks wrong

- Check the tool boundary in the README first. These are public/synthetic alpha tools, not a production or customer-validated determination.
- Compare the reported row ids and input rows; the output is deliberately explicit about what it could not run.

## Run the tests

```sh
pnpm install --frozen-lockfile
pnpm test
```

## Report

Open an issue on <https://github.com/PerryLink/dsh-einvoice/issues> with the package version, a minimal synthetic input, and the exact tool call. Do not attach customer data.
