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

  return [ingest, parse, query]
}
