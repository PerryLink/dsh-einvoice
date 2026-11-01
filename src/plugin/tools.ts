/** Three S1 model-facing tools: ingest, parse, query. */

import { createHash } from 'node:crypto'
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { unzipSync, zipSync } from 'fflate'
import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import {
  InvoiceError,
  assertEightFields,
  canonicalJson,
  invoicePeriod,
  type InvoiceLine,
  type ParsedInvoice,
} from '../core/invoice.js'
import { taxIdCheck } from '../core/uscc.js'
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


interface ArchiveFile {
  path: string
  sha256: string
  size: number
}

interface ArchiveMember {
  doc_id: string
  invoice_no: string
  lifecycle: string
  source_sha256: string
  files: ArchiveFile[]
}

interface ArchiveManifest {
  schema_version: 1
  pkg_id: string
  entity_id: string
  period: string
  template_id: string
  created_at: string
  created_by: string
  members: ArchiveMember[]
}

function safeZipPath(name: string): boolean {
  return !name.startsWith('/') && !name.split('/').includes('..') && !name.includes('\\0')
}

function archivePkgId(manifest: Omit<ArchiveManifest, 'pkg_id'> | ArchiveManifest): string {
  const base = { ...manifest, pkg_id: undefined }
  return `pkg_${createHash('sha256').update(canonicalJson(base)).digest('hex').slice(0, 16)}`
}

function parseArchive(buffer: Buffer): { files: Record<string, Uint8Array>; manifest: ArchiveManifest } {
  let files: Record<string, Uint8Array>
  try {
    files = unzipSync(buffer)
  } catch {
    throw new InvoiceError('E_INV_ARCHIVE_INVALID', 'archive is not a readable ZIP')
  }
  const raw = files['manifest.json']
  if (!raw) throw new InvoiceError('E_INV_ARCHIVE_INVALID', 'archive has no manifest.json')
  try {
    const manifest = JSON.parse(Buffer.from(raw).toString('utf8')) as ArchiveManifest
    if (!manifest || manifest.schema_version !== 1 || !Array.isArray(manifest.members)) {
      throw new Error('bad manifest')
    }
    return { files, manifest }
  } catch {
    throw new InvoiceError('E_INV_ARCHIVE_INVALID', 'archive manifest is not valid v1 JSON')
  }
}

function verifyArchive(buffer: Buffer): {
  manifest: ArchiveManifest
  pkg_id: string
  missing: string[]
  hash_mismatch: string[]
  dir_violation: string[]
  file_count: number
  signable: boolean
} {
  const { files, manifest } = parseArchive(buffer)
  const expectedPkgId = archivePkgId(manifest)
  const missing: string[] = []
  const hashMismatch: string[] = []
  const dirViolation: string[] = []
  if (manifest.pkg_id !== expectedPkgId) hashMismatch.push('manifest:pkg_id')
  for (const member of manifest.members) {
    for (const file of member.files ?? []) {
      if (!safeZipPath(file.path)) {
        dirViolation.push(file.path)
        continue
      }
      const data = files[file.path]
      if (!data) {
        missing.push(file.path)
        continue
      }
      if (sha256Buffer(Buffer.from(data)) !== file.sha256) hashMismatch.push(file.path)
    }
  }
  return {
    manifest,
    pkg_id: manifest.pkg_id,
    missing,
    hash_mismatch: hashMismatch,
    dir_violation: dirViolation,
    file_count: Object.keys(files).length,
    signable: missing.length === 0 && hashMismatch.length === 0 && dirViolation.length === 0,
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
        sourceName: path.basename(resolved),
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
      const parsed = parser.parse({ buffer, fileName: record.source_name ?? path.basename(record.source_path) })
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
    name: 'invoice.review_queue',
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
    name: 'invoice.record_receipt',
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
          verification_source: { type: 'string', required: true },
          tax_verified: { type: 'boolean', required: true },
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
        return { receipt_id: existing.receipt_id, receipt_sha256: receiptSha, duplicate: true, lifecycle: record.lifecycle, verification_source: 'local_receipt', tax_verified: false }
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
      return { receipt_id: receiptRecord.receipt_id, receipt_sha256: receiptSha, duplicate: false, lifecycle, verification_source: 'local_receipt', tax_verified: false }
    },
  })


  const archiveDir = path.join(deps.baseDir, 'archives')
  const restoreRoot = path.join(deps.baseDir, 'restore')

  async function resolveArchiveFile(args: { pkg_id?: string; path?: string }): Promise<string> {
    if (args.path) {
      let resolved: string
      try {
        resolved = await realpath(path.resolve(args.path))
      } catch {
        throw new InvoiceError('E_INV_ARCHIVE_NOT_FOUND', `archive not found: ${args.path}`)
      }
      const rel = path.relative(archiveDir, resolved)
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        throw new InvoiceError('E_INV_PATH_NOT_ALLOWED', `archive is outside the archive directory: ${args.path}`)
      }
      return resolved
    }
    if (!args.pkg_id || !/^pkg_[0-9a-f]{16}$/.test(args.pkg_id)) {
      throw new InvoiceError('E_INV_ARCHIVE_INVALID', 'pkg_id or path is required')
    }
    const candidate = path.join(archiveDir, `${args.pkg_id}.zip`)
    try {
      await stat(candidate)
    } catch {
      throw new InvoiceError('E_INV_ARCHIVE_NOT_FOUND', `archive not found: ${args.pkg_id}`)
    }
    return candidate
  }

  const redlink = defineTool({
    name: 'invoice.redlink',
    description: 'Bind a negative red invoice to a positive blue invoice by seller and total, store the binding and deltas. Local R1 write; no tax-bureau call.',
    parameters: {
      red_id: { type: 'string', required: true },
      blue_id: { type: 'string' },
      mode: { type: 'string', enum: ['auto', 'manual'] },
      allocation_cents: { type: 'number', description: 'Positive allocation; default is the absolute red total' },
      bound_by: { type: 'string' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          red_id: { type: 'string', required: true },
          blue_id: { type: 'string', required: true },
          mode: { type: 'string', required: true },
          amount_delta_cents: { type: 'number', required: true },
          tax_delta_cents: { type: 'number', required: true },
        },
      },
      render: (_args, value) => text(`redlink ${value.red_id} -> ${value.blue_id}, delta=${value.amount_delta_cents}`),
    },
    async execute(args) {
      const red = deps.table.get(args.red_id)
      if (!red) throw new InvoiceError('E_INV_DOC_NOT_FOUND', `unknown red invoice: ${args.red_id}`)
      if (red.total_cents >= 0) throw new InvoiceError('E_INV_REDLINK_UNBOUND', 'red invoice must have a negative total')
      const mode = args.mode ?? 'auto'
      const blueId = args.blue_id ?? [...deps.table.entries()]
        .map(([, record]) => record)
        .find((record) => record.doc_id !== red.doc_id && record.seller.tax_id === red.seller.tax_id && record.total_cents === -red.total_cents)?.doc_id
      if (!blueId) throw new InvoiceError('E_INV_REDLINK_UNBOUND', 'no matching blue invoice found')
      if (red.redlink && red.redlink.blue_id !== blueId) {
        throw new InvoiceError('E_INV_REDLINK_BOUND', `red invoice is already bound to ${red.redlink.blue_id}`)
      }
      const blue = deps.table.get(blueId)
      if (!blue) throw new InvoiceError('E_INV_DOC_NOT_FOUND', `unknown blue invoice: ${blueId}`)
      const allocation = args.allocation_cents ?? -red.total_cents
      if (!Number.isInteger(allocation) || allocation <= 0) throw new InvoiceError('E_INV_REDLINK_UNBOUND', 'allocation must be a positive integer')
      if (allocation > blue.total_cents) throw new InvoiceError('E_INV_REDLINK_OVER', 'red allocation exceeds the blue invoice total')
      const amountDelta = blue.total_cents + red.total_cents
      const taxDelta = blue.tax_cents + red.tax_cents
      const now = new Date().toISOString()
      const updated: InvoiceRecord = {
        ...red,
        redlink: {
          blue_id: blueId,
          mode,
          amount_delta_cents: amountDelta,
          tax_delta_cents: taxDelta,
          allocation_cents: allocation,
          bound_at: now,
          bound_by: args.bound_by?.trim() || 'invoice.redlink',
        },
        updated_at: now,
      }
      await deps.table.put(red.doc_id, updated)
      return { red_id: red.doc_id, blue_id: blueId, mode, amount_delta_cents: amountDelta, tax_delta_cents: taxDelta }
    },
  })

  const archive = defineTool({
    name: 'invoice.archive',
    description: 'Build a local deterministic invoice archive ZIP with manifest.json, original files and receipts; hash the manifest and verify the result. Local R1 write; no signing.',
    parameters: {
      entity_id: { type: 'string' },
      period: { type: 'string', description: 'YYYY-MM from issue_date' },
      template_id: { type: 'string', description: 'default-v1' },
      include_receipts: { type: 'boolean' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pkg_id: { type: 'string', required: true },
          manifest_sha256: { type: 'string', required: true },
          zip_path: { type: 'string', required: true },
          file_count: { type: 'number', required: true },
          check_state: { type: 'string', required: true },
        },
      },
      render: (_args, value) => text(`archive ${value.pkg_id}: ${value.file_count} files (${value.check_state})`),
    },
    async execute(args) {
      const selected = [...deps.table.entries()]
        .map(([, record]) => record)
        .filter((record) => record.lifecycle !== 'quarantined')
        .filter((record) => !args.entity_id || record.entity_id === args.entity_id)
        .filter((record) => !args.period || invoicePeriod(record.issue_date) === args.period)
      if (selected.length === 0) throw new InvoiceError('E_INV_ARCHIVE_EMPTY', 'no invoices matched the archive filter')
      const entries: Record<string, Uint8Array> = {}
      const members: ArchiveMember[] = []
      for (const record of selected) {
        let sourceBytes: Buffer
        try {
          sourceBytes = await readFile(record.source_path)
        } catch {
          throw new InvoiceError('E_INV_ARCHIVE_MISSING_PART', `original missing for ${record.doc_id}`)
        }
        const sourceName = record.source_name ?? path.basename(record.source_path)
        const sourcePath = `members/${record.doc_id}/${sourceName}`
        entries[sourcePath] = sourceBytes
        const files: ArchiveFile[] = [{ path: sourcePath, sha256: sha256Buffer(sourceBytes), size: sourceBytes.length }]
        if (args.include_receipts !== false) {
          for (const item of record.receipts ?? []) {
            let receiptBytes: Buffer
            try {
              receiptBytes = await readFile(item.receipt_path)
            } catch {
              throw new InvoiceError('E_INV_ARCHIVE_MISSING_PART', `receipt missing for ${record.doc_id}/${item.receipt_id}`)
            }
            const receiptPath = `members/${record.doc_id}/receipts/${item.receipt_id}${path.extname(item.receipt_path) || '.bin'}`
            entries[receiptPath] = receiptBytes
            files.push({ path: receiptPath, sha256: sha256Buffer(receiptBytes), size: receiptBytes.length })
          }
        }
        members.push({
          doc_id: record.doc_id,
          invoice_no: record.invoice_no,
          lifecycle: record.lifecycle,
          source_sha256: record.source_sha256,
          files,
        })
      }
      const base: Omit<ArchiveManifest, 'pkg_id'> = {
        schema_version: 1,
        entity_id: args.entity_id ?? 'ALL',
        period: args.period ?? 'ALL',
        template_id: args.template_id ?? 'default-v1',
        created_at: new Date().toISOString(),
        created_by: 'invoice.archive',
        members,
      }
      const pkgId = archivePkgId(base)
      const manifest: ArchiveManifest = { ...base, pkg_id: pkgId }
      const manifestText = JSON.stringify(manifest, null, 2)
      entries['manifest.json'] = new TextEncoder().encode(manifestText)
      const zipBuffer = Buffer.from(zipSync(entries))
      await mkdir(archiveDir, { recursive: true })
      const zipPath = path.join(archiveDir, `${pkgId}.zip`)
      await writeFile(zipPath, zipBuffer)
      await writeFile(path.join(archiveDir, `${pkgId}.manifest.json`), manifestText)
      const check = verifyArchive(zipBuffer)
      return {
        pkg_id: pkgId,
        manifest_sha256: sha256Buffer(Buffer.from(manifestText)),
        zip_path: zipPath,
        file_count: Object.keys(entries).length,
        check_state: check.signable ? 'ok' : 'failed',
      }
    },
  })

  const check = defineTool({
    name: 'invoice.check',
    description: 'Verify an archive package: manifest hash, member hashes, missing files and directory traversal. Read-only; does not restore.',
    parameters: {
      pkg_id: { type: 'string' },
      path: { type: 'string', description: 'Optional archive path under the local archive directory' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pkg_id: { type: 'string', required: true },
          missing: { type: 'array', items: { type: 'string' }, required: true },
          hash_mismatch: { type: 'array', items: { type: 'string' }, required: true },
          dir_violation: { type: 'array', items: { type: 'string' }, required: true },
          signable: { type: 'boolean', required: true },
          file_count: { type: 'number', required: true },
        },
      },
      render: (_args, value) => text(`check ${value.pkg_id}: ${value.signable ? 'ok' : 'failed'} (${value.file_count} files)`),
    },
    async execute(args) {
      const zipPath = await resolveArchiveFile(args)
      const buffer = await readFile(zipPath)
      const report = verifyArchive(buffer)
      return {
        pkg_id: report.pkg_id,
        missing: report.missing,
        hash_mismatch: report.hash_mismatch,
        dir_violation: report.dir_violation,
        signable: report.signable,
        file_count: report.file_count,
      }
    },
  })

  const restore = defineTool({
    name: 'invoice.restore',
    description: 'Restore a verified local archive ZIP into a directory under the local restore root, verifying each member hash before writing. Local R1 write.',
    parameters: {
      pkg_id: { type: 'string', required: true },
      target_dir: { type: 'string', description: 'Optional directory under the local restore root' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          pkg_id: { type: 'string', required: true },
          restore_dir: { type: 'string', required: true },
          restored: { type: 'number', required: true },
          mismatches: { type: 'array', items: { type: 'string' }, required: true },
        },
      },
      render: (_args, value) => text(`restore ${value.pkg_id}: ${value.restored} files`),
    },
    async execute(args) {
      const zipPath = await resolveArchiveFile({ pkg_id: args.pkg_id })
      const buffer = await readFile(zipPath)
      const { files, manifest } = parseArchive(buffer)
      const report = verifyArchive(buffer)
      let target = path.join(restoreRoot, report.pkg_id)
      if (args.target_dir) {
        target = path.resolve(args.target_dir)
        const rel = path.relative(restoreRoot, target)
        if (rel.startsWith('..') || path.isAbsolute(rel)) {
          throw new InvoiceError('E_INV_PATH_NOT_ALLOWED', 'target_dir must be under the local restore root')
        }
      }
      await mkdir(target, { recursive: true })
      let restored = 0
      for (const member of manifest.members) {
        for (const file of member.files ?? []) {
          if (!safeZipPath(file.path)) continue
          const data = files[file.path]
          if (!data) continue
          if (sha256Buffer(Buffer.from(data)) !== file.sha256) continue
          const destination = path.join(target, file.path)
          const rel = path.relative(target, destination)
          if (rel.startsWith('..') || path.isAbsolute(rel)) continue
          await mkdir(path.dirname(destination), { recursive: true })
          await writeFile(destination, data)
          restored += 1
        }
      }
      return {
        pkg_id: report.pkg_id,
        restore_dir: target,
        restored,
        mismatches: [...report.missing, ...report.hash_mismatch, ...report.dir_violation],
      }
    },
  })

  const legacyVerify = { ...verify, name: 'invoice.verify', description: 'Deprecated alias for invoice.review_queue; local review queue only, no tax-bureau verification.' }
  const legacyReceipt = { ...receipt, name: 'invoice.receipt', description: 'Deprecated alias for invoice.record_receipt; local receipt only, no tax-bureau verification.' }

  const taxIdTool = defineTool({
    name: 'invoice.tax_id_check',
    description: 'Validate a Chinese Unified Social Credit Code (18 characters, GB 32100-2015 mod-31 check character). Read-only; does not touch the archive.',
    parameters: { tax_id: { type: 'string', required: true } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { tax_id: { type: 'string', required: true }, valid: { type: 'boolean', required: true }, kind: { type: 'string', required: true }, check_character: { type: 'string' }, reason: { type: 'string' } } }, render: (_a, v) => text(`${v.tax_id} ${v.valid ? 'ok' : 'invalid'}`) },
    async execute(args) { const r = taxIdCheck(args.tax_id); return { ...r, check_character: r.check_character ?? undefined } },
  })

  return [ingest, parse, query, dedup, verify, legacyVerify, receipt, legacyReceipt, redlink, archive, check, restore, taxIdTool]


}
