/**
 * PS1 quickstart: run the two shipped synthetic invoice files through the real tool layer.
 *
 *   node samples/quickstart/run.mjs            # human-readable run (used for the screenshot)
 *   node samples/quickstart/run.mjs --json     # the gold JSON on stdout (used by scripts/acceptance.mjs)
 *
 * The scenario: the same invoice reached the shared-service centre twice — once as a
 * standalone XML export (entity ENT-DEMO-A) and once as a 数电票 OFD (entity ENT-DEMO-B).
 * Both files are synthetic; the invoice number is invented and the tax ids are obviously
 * fake (TEST...). No network, no tax-bureau call, no customer data.
 *
 * Requires `pnpm build` (or `tsc -p tsconfig.json`) first.
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTools } from '../../lib/plugin/tools.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const jsonOnly = process.argv.includes('--json')
const sha256 = (value) => createHash('sha256').update(value).digest('hex')

class MemoryTable {
  constructor() { this.map = new Map() }
  get(key) { return this.map.get(key) }
  entries() { return this.map.entries() }
  get size() { return this.map.size }
  async put(key, value) { this.map.set(key, value) }
}

const inputs = [
  { rel: 'samples/quickstart/input/invoice-a.xml', entity: 'ENT-DEMO-A', via: 'XML' },
  { rel: 'samples/quickstart/input/invoice-a-copy.ofd', entity: 'ENT-DEMO-B', via: 'OFD' },
]
const samples = inputs.map((input) => {
  const rel = input.rel
  const bytes = readFileSync(path.join(root, rel))
  return { path: rel, bytes: bytes.length, sha256: sha256(bytes) }
})

const workDir = mkdtempSync(path.join(tmpdir(), 'dsh-einvoice-quickstart-'))
const exec = { callId: 'quickstart', agent: { id: 'quickstart' } }

try {
  const tools = createTools({ table: new MemoryTable(), baseDir: workDir, inputRoots: [root] })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const labels = new Map()

  const ingested = []
  const parsed = []
  for (const [index, input] of inputs.entries()) {
    const id = `DOC-${index + 1}`
    const ingest = await byName['invoice_ingest'].execute(
      { source: { kind: 'file', path: path.join(root, input.rel) }, entity_id: input.entity },
      exec,
    )
    labels.set(ingest.doc_id, id)
    ingested.push({ doc: id, entity: input.entity, size: ingest.size, sha256: ingest.sha256, existing: ingest.existing })
    const value = await byName['invoice_parse'].execute({ doc_id: ingest.doc_id, ocr: 'off' }, exec)
    parsed.push({
      doc: id,
      via: input.via,
      invoice_no: value.invoice_no,
      issue_date: value.issue_date,
      buyer: value.buyer,
      seller: value.seller,
      amount_cents: value.amount_cents,
      tax_cents: value.tax_cents,
      total_cents: value.total_cents,
      currency: value.currency,
      lines: value.lines,
      confidence: value.confidence,
      parser_version: value.parser_version,
      field_evidence: value.field_evidence,
      unknown_fields: value.unknown_fields,
      warnings: value.warnings,
    })
  }

  const dedup = await byName['invoice_dedup'].execute({}, exec)
  const query = await byName['invoice_query'].execute({ filter: { period: '2026-08' }, page: 50 }, exec)

  const gold = {
    _note: 'Real tool output. doc ids are random per run, so they are normalised to DOC-1/DOC-2 here; amounts stay integer cents. Query rows are sorted by doc id because the tool orders by created_at, which can tie within one millisecond.',
    samples,
    ingest: ingested,
    parse: parsed,
    dedup: {
      total: dedup.total,
      groups: dedup.groups.map((group) => ({
        fingerprint: group.fingerprint,
        kind: group.kind,
        basis: group.basis,
        members: group.members.map((member) => ({
          doc: labels.get(member.doc_id) ?? member.doc_id,
          invoice_no: member.invoice_no,
          seller_name: member.seller_name,
          total_cents: member.total_cents,
        })),
      })),
    },
    query: {
      filter: { period: '2026-08' },
      total: query.total,
      rows: query.rows
        .map((row) => ({
          doc: labels.get(row.doc_id) ?? row.doc_id,
          invoice_no: row.invoice_no,
          issue_date: row.issue_date,
          seller: row.seller,
          total_cents: row.total_cents,
          lifecycle: row.lifecycle,
        }))
        .sort((a, b) => a.doc.localeCompare(b.doc)),
    },
  }

  if (jsonOnly) {
    process.stdout.write(`${JSON.stringify(gold, null, 2)}\n`)
  } else {
    const money = (cents) => (cents / 100).toFixed(2)
    console.log(`sample: ${samples[0].path} (${samples[0].bytes} B, sha256 ${samples[0].sha256.slice(0, 16)}…)`)
    console.log(`sample: ${samples[1].path} (${samples[1].bytes} B, sha256 ${samples[1].sha256.slice(0, 16)}…)`)
    console.log('samples are synthetic: invented invoice number, fake tax ids (TEST…), no real invoice')
    for (const [index, item] of ingested.entries()) {
      const p = parsed[index]
      console.log(`invoice_ingest      ${item.doc} entity=${item.entity} existing=${item.existing} size=${item.size}`)
      console.log(`invoice_parse       ${p.doc} via=${p.via} no=${p.invoice_no} date=${p.issue_date} total=${money(p.total_cents)}`)
      console.log(`                    seller=${p.seller.name} tax=${p.seller.tax_id} lines=${p.lines.length} (fake tax id)`)
    }
    console.log(`invoice_dedup       groups=${dedup.total} basis=${dedup.groups[0]?.basis ?? 'none'}`)
    for (const group of gold.dedup.groups) {
      console.log(`                    ${group.fingerprint} → ${group.members.map((m) => m.doc).join(', ')} (${group.members.map((m) => m.total_cents / 100).map((v) => v.toFixed(2)).join(' / ')} CNY)`)
    }
    console.log(`invoice_query       period=2026-08 total=${query.total} (${[...gold.query.rows].sort((a, b) => a.doc.localeCompare(b.doc)).map((r) => `${r.doc}:${r.lifecycle}`).join(', ')})`)
    console.log(`ok: quickstart finished (6 tool calls, ${dedup.total} duplicate invoice found)`)
  }
} finally {
  rmSync(workDir, { recursive: true, force: true })
}
