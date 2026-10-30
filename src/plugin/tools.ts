/** Three S1 model-facing tools: ingest, parse, query. */

import { createHash } from 'node:crypto'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  InvoiceError,
  assertEightFields,
  canonicalJson,
  invoicePeriod,
  type InvoiceLine,
  type ParsedInvoice,
} from '../core/invoice.js'
import { getParser } from '../registry/parsers.js'
import {
  assertUniqueInvoice,
  emptyInvoiceRecord,
  findBySha,
  newDocId,
  recordLines,
  sha256Buffer,
  storeOriginal,
  type InvoiceRecord,
  type InvoiceTable,
} from './storage.js'

export interface ToolDeps {
  table: InvoiceTable
  baseDir: string
  inputRoots: string[]
}

const partyOut = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', required: true },
    tax_id: { type: 'string', required: true },
  },
} as const

const lineOut = {
  type: 'object',
  additionalProperties: false,
  properties: {
    line_no: { type: 'number', required: true },
    description: { type: 'string', required: true },
    quantity: { type: 'string' },
    unit_price_cents: { type: 'number' },
    amount_cents: { type: 'number', required: true },
    tax_rate: { type: 'string' },
    tax_cents: { type: 'number' },
  },
} as const

function text(value: string): { type: 'text'; text: string }[] {
  return [{ type: 'text', text: value }]
}

function actorOf(exec: { agent?: { id: string } }): string {
  return exec.agent?.id ? `agent:${exec.agent.id}` : 'local'
}

function runIdOf(exec: { callId: string }): string {
  return String(exec.callId)
}

async function resolveAllowedPath(inputPath: string, roots: string[]): Promise<string> {
  const absolute = path.resolve(inputPath)
  let resolved: string
  try {
    resolved = await realpath(absolute)
  } catch {
    throw new InvoiceError('E_INV_FILE_UNREADABLE', `file does not exist: ${inputPath}`)
  }
  const resolvedRoots = await Promise.all(
    roots.map(async (root) => {
      try {
        return await realpath(path.resolve(root))
      } catch {
        return undefined
      }
    }),
  )
  const allowed = resolvedRoots.some((root) => root !== undefined && (resolved === root || resolved.startsWith(root + path.sep)))
  if (!allowed) throw new InvoiceError('E_INV_PATH_NOT_ALLOWED', `path is outside the configured input roots: ${inputPath}`)
  return resolved
}

function parsedToRecord(record: InvoiceRecord, parsed: ParsedInvoice): InvoiceRecord {
  const updatedAt = new Date().toISOString()
  return {
    ...record,
    invoice_no: parsed.invoice_no,
    invoice_code: parsed.invoice_code,
    issue_date: parsed.issue_date,
    buyer: parsed.buyer,
    seller: parsed.seller,
    amount_cents: parsed.amount_cents,
    tax_cents: parsed.tax_cents,
    total_cents: parsed.total_cents,
    currency: 'CNY',
    lines: recordLines(parsed.lines),
    confidence: parsed.confidence,
    field_evidence: parsed.field_evidence,
    unknown_fields: parsed.unknown_fields,
    parser_version: parsed.parser_version,
    lifecycle: 'parsed',
    updated_at: updatedAt,
    evidence_sha256: createHash('sha256').update(canonicalJson(parsed)).digest('hex'),
  }
}

export function createTools(deps: ToolDeps) {
  const ingest = defineTool({
    name: 'invoice.ingest',
    description:
      'Ingest one local OFD/XML invoice file into the SKU-04 pool. Computes SHA-256, stores the original under the local pool, and returns the document id. Re-ingesting the same bytes is idempotent.',
    parameters: {
      source: {
        type: 'object',
        required: true,
        additionalProperties: false,
        properties: {
          kind: { type: 'string', enum: ['file'], required: true, description: 'S1 accepts one local file' },
          path: { type: 'string', required: true, description: 'Local path under the configured input roots' },
          sha256: { type: 'string', description: 'Optional expected SHA-256; mismatch is rejected' },
        },
      },
      entity_id: { type: 'string', description: 'Legal entity id; defaults to "default"' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doc_id: { type: 'string', required: true },
          sha256: { type: 'string', required: true },
          size: { type: 'number', required: true },
          existing: { type: 'boolean', required: true },
        },
      },
      render: (_args, value) =>
        text(`ingested ${value.doc_id} (${value.size} bytes, sha256 ${value.sha256.slice(0, 12)}…${value.existing ? ', existing' : ''})`),
    },
    async execute(args, exec) {
      const resolved = await resolveAllowedPath(args.source.path, deps.inputRoots)
      const info = await stat(resolved)
      if (!info.isFile()) throw new InvoiceError('E_INV_FILE_UNREADABLE', 'source is not a regular file')
      if (info.size === 0) throw new InvoiceError('E_INV_FILE_UNREADABLE', 'source file is empty')
      if (info.size > 50 * 1024 * 1024) throw new InvoiceError('E_INV_FILE_UNREADABLE', 'source file exceeds 50MB')
      const buffer = await readFile(resolved)
      const sha256 = sha256Buffer(buffer)
      if (args.source.sha256 && args.source.sha256.toLowerCase() !== sha256) {
        throw new InvoiceError('E_INV_STORAGE_FAILED', 'expected sha256 does not match the source file')
      }
      const existing = findBySha(deps.table, sha256)
      if (existing) return { doc_id: existing.doc_id, sha256, size: info.size, existing: true }
      const docId = newDocId()
      const entityId = args.entity_id?.trim() || 'default'
      const storedPath = await storeOriginal(deps.baseDir, sha256, path.extname(resolved), buffer)
      const record = emptyInvoiceRecord({
        docId,
        entityId,
        sourcePath: storedPath,
        sha256,
        size: info.size,
        runId: runIdOf(exec),
        actor: actorOf(exec),
      })
      await deps.table.put(docId, record)
      return { doc_id: docId, sha256, size: info.size, existing: false }
    },
  })

  const parse = defineTool({
    name: 'invoice.parse',
    description:
      'Parse one ingested OFD/XML invoice into the eight fields, line items, field evidence and unknown fields. Supports old OFD invoice XML and 数电票 CustomTag/ObjectRef.',
    parameters: {
      doc_id: { type: 'string', required: true },
      profile: { type: 'string', description: 'Parser profile; S1 uses ofd-zip-xml' },
      ocr: { type: 'string', enum: ['off'], description: 'S1 does not run OCR' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doc_id: { type: 'string', required: true },
          invoice_no: { type: 'string', required: true },
          issue_date: { type: 'string', required: true },
          buyer: { ...partyOut, required: true },
          seller: { ...partyOut, required: true },
          amount_cents: { type: 'number', required: true },
          tax_cents: { type: 'number', required: true },
          total_cents: { type: 'number', required: true },
          currency: { type: 'string', required: true },
          lines: { type: 'array', items: lineOut, required: true },
          confidence: { type: 'number', required: true },
          field_evidence: { type: 'json', required: true },
          unknown_fields: { type: 'json', required: true },
          parser_version: { type: 'string', required: true },
          warnings: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) =>
        text(
          `parsed ${value.invoice_no || '(no number)'} ${value.seller.name || '(no seller)'} total=${(value.total_cents / 100).toFixed(2)} CNY lines=${value.lines.length} unknown=${Object.keys(value.unknown_fields ?? {}).length}`,
        ),
    },
    async execute(args, exec) {
      const record = deps.table.get(args.doc_id)
      if (!record) throw new InvoiceError('E_INV_DOC_NOT_FOUND', `unknown doc_id: ${args.doc_id}`)
      const buffer = await readFile(record.source_path)
      const parser = getParser(args.profile)
      const parsed = parser.parse({ buffer, fileName: path.basename(record.source_path) })
      assertEightFields(parsed)
      assertUniqueInvoice(deps.table, record.entity_id, parsed.invoice_no, record.doc_id)
      const updated = parsedToRecord(record, parsed)
      updated.actor = actorOf(exec)
      updated.run_id = runIdOf(exec)
      await deps.table.put(record.doc_id, updated)
      return {
        doc_id: record.doc_id,
        invoice_no: parsed.invoice_no,
        issue_date: parsed.issue_date,
        buyer: parsed.buyer,
        seller: parsed.seller,
        amount_cents: parsed.amount_cents,
        tax_cents: parsed.tax_cents,
        total_cents: parsed.total_cents,
        currency: parsed.currency,
        lines: parsed.lines,
        confidence: parsed.confidence,
        field_evidence: parsed.field_evidence as unknown as JsonValue,
        unknown_fields: parsed.unknown_fields as unknown as JsonValue,
        parser_version: parsed.parser_version,
        warnings: parsed.warnings,
      }
    },
  })

  const query = defineTool({
    name: 'invoice.query',
    description: 'Query the SKU-04 invoice pool by entity, period, lifecycle or text; returns a stable page.',
    parameters: {
      filter: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entity_id: { type: 'string' },
          period: { type: 'string', description: 'YYYY-MM from issue_date' },
          lifecycle: { type: 'string', enum: ['received', 'parsed', 'verified', 'archived', 'quarantined'] },
          q: { type: 'string', description: 'Case-insensitive text match on invoice number or seller name' },
        },
      },
      cursor: { type: 'string', description: 'Opaque offset cursor' },
      page: { type: 'number', description: '1..200, default 50' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          rows: {
            required: true,
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                doc_id: { type: 'string', required: true },
                invoice_no: { type: 'string', required: true },
                issue_date: { type: 'string', required: true },
                buyer: { ...partyOut, required: true },
                seller: { ...partyOut, required: true },
                amount_cents: { type: 'number', required: true },
                tax_cents: { type: 'number', required: true },
                total_cents: { type: 'number', required: true },
                lifecycle: { type: 'string', required: true },
                parser_version: { type: 'string', required: true },
                confidence: { type: 'number', required: true },
              },
            },
          },
          total: { type: 'number', required: true },
          next_cursor: { type: 'string', required: true },
        },
      },
      render: (_args, value) => text(`invoice pool: ${value.total} matched, ${value.rows.length} on this page`),
    },
    async execute(args) {
      const pageSize = Math.max(1, Math.min(200, Math.floor(args.page ?? 50)))
      const offset = Math.max(0, Number.parseInt(args.cursor ?? '0', 10) || 0)
      const filter = args.filter ?? {}
      const rows = [...deps.table.entries()]
        .map(([, record]) => record)
        .filter((record) => {
          if (filter.entity_id && record.entity_id !== filter.entity_id) return false
          if (filter.period && invoicePeriod(record.issue_date) !== filter.period) return false
          if (filter.lifecycle && record.lifecycle !== filter.lifecycle) return false
          if (filter.q) {
            const queryText = filter.q.toLowerCase()
            if (!record.invoice_no.toLowerCase().includes(queryText) && !record.seller.name.toLowerCase().includes(queryText)) return false
          }
          return true
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
      const total = rows.length
      const pageRows = rows.slice(offset, offset + pageSize).map((record) => ({
        doc_id: record.doc_id,
        invoice_no: record.invoice_no,
        issue_date: record.issue_date,
        buyer: record.buyer,
        seller: record.seller,
        amount_cents: record.amount_cents,
        tax_cents: record.tax_cents,
        total_cents: record.total_cents,
        lifecycle: record.lifecycle,
        parser_version: record.parser_version,
        confidence: record.confidence,
      }))
      const nextOffset = offset + pageRows.length
      return {
        rows: pageRows,
        total,
        next_cursor: nextOffset < total ? String(nextOffset) : '',
      }
    },
  })


  const dedup = defineTool({
    name: 'invoice.dedup',
    description: 'Group parsed invoices by invoice number, or by seller+date+total when the number is absent; returns duplicate groups and their basis. Read-only.',
    parameters: {
      filter: {
        type: 'object',
        additionalProperties: false,
        properties: {
          entity_id: { type: 'string' },
          period: { type: 'string', description: 'YYYY-MM from issue_date' },
        },
      },
      doc_ids: { type: 'array', items: { type: 'string' }, description: 'Optional subset; defaults to the whole pool' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          groups: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                fingerprint: { type: 'string', required: true },
                kind: { type: 'string', required: true },
                basis: { type: 'string', required: true },
                members: {
                  type: 'array',
                  required: true,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      doc_id: { type: 'string', required: true },
                      invoice_no: { type: 'string', required: true },
                      seller_name: { type: 'string', required: true },
                      total_cents: { type: 'number', required: true },
                    },
                  },
                },
              },
            },
          },
          total: { type: 'number', required: true },
        },
      },
      render: (_args, value) => text(`dedup: ${value.total} duplicate groups`),
    },
    async execute(args) {
      const filter = args.filter ?? {}
      const selected = args.doc_ids?.length
        ? args.doc_ids.map((id) => deps.table.get(id)).filter((record): record is InvoiceRecord => record !== undefined)
        : [...deps.table.entries()].map(([, record]) => record)
      const groups = new Map<string, { fingerprint: string; kind: string; basis: string; members: Array<{ doc_id: string; invoice_no: string; seller_name: string; total_cents: number }> }>()
      for (const record of selected) {
        if (filter.entity_id && record.entity_id !== filter.entity_id) continue
        if (filter.period && invoicePeriod(record.issue_date) !== filter.period) continue
        const byNumber = record.invoice_no !== ''
        const fingerprint = byNumber
          ? `invoice_no:${record.invoice_no}`
          : `seller_date_total:${record.seller.tax_id}:${record.issue_date}:${record.total_cents}`
        const kind = byNumber ? 'invoice_no' : 'seller_date_total'
        const basis = byNumber ? 'same invoice number' : 'same seller tax id + issue date + total'
        let group = groups.get(fingerprint)
        if (!group) {
          group = { fingerprint, kind, basis, members: [] }
          groups.set(fingerprint, group)
        }
        group.members.push({
          doc_id: record.doc_id,
          invoice_no: record.invoice_no,
          seller_name: record.seller.name,
          total_cents: record.total_cents,
        })
      }
      const duplicateGroups = [...groups.values()].filter((group) => group.members.length > 1)
      return { groups: duplicateGroups, total: duplicateGroups.length }
    },
  })

  const verify = defineTool({
    name: 'invoice.verify',
    description: 'Queue parsed invoices for manual/semi-automatic verification. S2 has no tax-bureau network call: it records a pending local queue and optional entity-tax-id mismatch flags.',
    parameters: {
      invoice_ids: { type: 'array', items: { type: 'string' }, description: 'Optional subset; defaults to parsed invoices' },
      entity_id: { type: 'string' },
      period: { type: 'string', description: 'YYYY-MM from issue_date' },
      entity_tax_id: { type: 'string', description: 'Expected buyer tax id for header validation' },
      limit: { type: 'number', description: '1..200, default 100' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          queue: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                doc_id: { type: 'string', required: true },
                invoice_no: { type: 'string', required: true },
                seller_name: { type: 'string', required: true },
                total_cents: { type: 'number', required: true },
                state: { type: 'string', required: true },
                entity_match: { type: 'boolean', required: true },
                needs_review: { type: 'array', items: { type: 'string' }, required: true },
              },
            },
          },
          total: { type: 'number', required: true },
        },
      },
      render: (_args, value) => text(`verify queue: ${value.total} pending`),
    },
    async execute(args) {
      const limit = Math.max(1, Math.min(200, Math.floor(args.limit ?? 100)))
      const expected = args.entity_tax_id?.trim().toUpperCase()
      const selected = args.invoice_ids?.length
        ? args.invoice_ids.map((id) => deps.table.get(id)).filter((record): record is InvoiceRecord => record !== undefined)
        : [...deps.table.entries()].map(([, record]) => record)
      const queue: Array<{ doc_id: string; invoice_no: string; seller_name: string; total_cents: number; state: string; entity_match: boolean; needs_review: string[] }> = []
      for (const record of selected) {
        if (queue.length >= limit) break
        if (record.lifecycle !== 'parsed' && record.lifecycle !== 'verified') continue
        if (args.entity_id && record.entity_id !== args.entity_id) continue
        if (args.period && invoicePeriod(record.issue_date) !== args.period) continue
        const entityMatch = !expected || record.buyer.tax_id.toUpperCase() === expected
        const needsReview: string[] = []
        if (!entityMatch) needsReview.push('entity_mismatch')
        if (!record.buyer.tax_id) needsReview.push('missing_buyer_tax_id')
        const now = new Date().toISOString()
        const updated: InvoiceRecord = {
          ...record,
          verification: {
            state: 'pending',
            queued_at: record.verification?.queued_at ?? now,
            updated_at: now,
            attempts: record.verification?.attempts ?? 0,
            manual_reason: needsReview.join(',') || record.verification?.manual_reason,
          },
        }
        await deps.table.put(record.doc_id, updated)
        queue.push({
          doc_id: record.doc_id,
          invoice_no: record.invoice_no,
          seller_name: record.seller.name,
          total_cents: record.total_cents,
          state: 'pending',
          entity_match: entityMatch,
          needs_review: needsReview,
        })
      }
      return { queue, total: queue.length }
    },
  })

  const receipt = defineTool({
    name: 'invoice.receipt',
    description: 'Record a local verification receipt for one parsed invoice: hash the receipt file, append an immutable receipt record, and move the invoice to verified/quarantined. Local R1 write; no tax-bureau write.',
    parameters: {
      invoice_id: { type: 'string', required: true },
      receipt_file: { type: 'string', required: true, description: 'Local receipt file under an allowed input root' },
      result_code: { type: 'string', required: true },
      result: { type: 'string', enum: ['pass', 'fail', 'unknown'], required: true },
      verified_at: { type: 'string', required: true },
      operator: { type: 'string', required: true },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          receipt_id: { type: 'string', required: true },
          receipt_sha256: { type: 'string', required: true },
          duplicate: { type: 'boolean', required: true },
          lifecycle: { type: 'string', required: true },
        },
      },
      render: (_args, value) => text(`receipt ${value.receipt_id} (${value.duplicate ? 'duplicate' : 'recorded'}), invoice=${value.lifecycle}`),
    },
    async execute(args) {
      const record = deps.table.get(args.invoice_id)
      if (!record) throw new InvoiceError('E_INV_DOC_NOT_FOUND', `unknown invoice: ${args.invoice_id}`)
      if (!args.result_code.trim() || !args.verified_at.trim() || !args.operator.trim()) {
        throw new InvoiceError('E_INV_RECEIPT_INCOMPLETE', 'result_code, verified_at and operator are required', { needs_review: true })
      }
      const resolved = await resolveAllowedPath(args.receipt_file, deps.inputRoots)
      const info = await stat(resolved)
      if (!info.isFile() || info.size === 0) throw new InvoiceError('E_INV_RECEIPT_INCOMPLETE', 'receipt file is empty or not a file')
      const buffer = await readFile(resolved)
      const receiptSha = sha256Buffer(buffer)
      const existing = (record.receipts ?? []).find((item) => item.receipt_sha256 === receiptSha)
      if (existing) {
        return { receipt_id: existing.receipt_id, receipt_sha256: receiptSha, duplicate: true, lifecycle: record.lifecycle }
      }
      const now = new Date().toISOString()
      const receiptRecord = {
        receipt_id: newDocId(),
        result_code: args.result_code.trim(),
        result: args.result,
        verified_at: args.verified_at.trim(),
        operator: args.operator.trim(),
        receipt_sha256: receiptSha,
        receipt_path: resolved,
        recorded_at: now,
      }
      const lifecycle = args.result === 'pass' ? 'verified' : args.result === 'fail' ? 'quarantined' : 'parsed'
      const updated: InvoiceRecord = {
        ...record,
        lifecycle,
        receipts: [...(record.receipts ?? []), receiptRecord],
        verification: {
          state: args.result === 'pass' ? 'verified' : args.result === 'fail' ? 'failed' : 'manual',
          queued_at: record.verification?.queued_at,
          updated_at: now,
          attempts: record.verification?.attempts ?? 0,
          last_result: args.result_code.trim(),
          manual_reason: args.result === 'unknown' ? 'unknown_result' : undefined,
        },
        updated_at: now,
      }
      await deps.table.put(record.doc_id, updated)
      return { receipt_id: receiptRecord.receipt_id, receipt_sha256: receiptSha, duplicate: false, lifecycle }
    },
  })

  return [ingest, parse, query, dedup, verify, receipt]

}
