/** Storage domain and local original-file store for SKU-04 S1. */

import { createHash, randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain'
import type { Context } from '@deepseek-ai/cordis'
import { InvoiceError, type InvoiceLine, type InvoiceLifecycle } from '../core/invoice.js'

export const partySchema = z.object({
  name: z.string(),
  tax_id: z.string(),
})

export const lineSchema = z.object({
  line_no: z.number().int().nonnegative(),
  description: z.string(),
  quantity: z.string().optional(),
  unit_price_cents: z.number().int().optional(),
  amount_cents: z.number().int(),
  tax_rate: z.string().optional(),
  tax_cents: z.number().int().optional(),
})

export const verificationSchema = z.object({
  state: z.enum(['pending', 'verified', 'failed', 'manual']),
  queued_at: z.string().optional(),
  updated_at: z.string().optional(),
  attempts: z.number().int().nonnegative().default(0),
  last_result: z.string().optional(),
  manual_reason: z.string().optional(),
})

export const receiptSchema = z.object({
  receipt_id: z.string(),
  result_code: z.string(),
  result: z.enum(['pass', 'fail', 'unknown']),
  verified_at: z.string(),
  operator: z.string(),
  receipt_sha256: z.string(),
  receipt_path: z.string(),
  recorded_at: z.string(),
})

export const redlinkSchema = z.object({
  blue_id: z.string(),
  mode: z.enum(['auto', 'manual']),
  amount_delta_cents: z.number().int(),
  tax_delta_cents: z.number().int(),
  allocation_cents: z.number().int().optional(),
  bound_at: z.string(),
  bound_by: z.string(),
})

export const invoiceSchema = z.object({
  doc_id: z.string().min(1),
  entity_id: z.string(),
  invoice_no: z.string(),
  invoice_code: z.string().optional(),
  issue_date: z.string(),
  buyer: partySchema,
  seller: partySchema,
  amount_cents: z.number().int(),
  tax_cents: z.number().int(),
  total_cents: z.number().int(),
  currency: z.literal('CNY'),
  lines: z.array(lineSchema),
  confidence: z.number(),
  field_evidence: z.record(z.string(), z.string()),
  unknown_fields: z.record(z.string(), z.unknown()),
  parser_version: z.string(),
  lifecycle: z.enum(['received', 'parsed', 'verified', 'archived', 'quarantined']),
  verification: verificationSchema.optional(),
  receipts: z.array(receiptSchema).optional(),
  redlink: redlinkSchema.optional(),
  source_path: z.string(),
  source_name: z.string().optional(),
  source_sha256: z.string(),
  source_size: z.number().int().nonnegative(),
  created_at: z.string(),
  updated_at: z.string(),
  run_id: z.string(),
  actor: z.string(),
  evidence_sha256: z.string(),
})

export type InvoiceRecord = z.infer<typeof invoiceSchema>
export type InvoiceTable = {
  get(key: string): InvoiceRecord | undefined
  entries(): IterableIterator<[string, InvoiceRecord]>
  keys(): IterableIterator<string>
  readonly size: number
  put(key: string, value: InvoiceRecord): Promise<void>
  delete(key: string): Promise<boolean>
  update(key: string, fn: (current: InvoiceRecord) => InvoiceRecord): Promise<InvoiceRecord>
}

export const finInvoiceSpec = defineDomain({
  name: 'fin_invoice',
  version: 1,
  tables: {
    invoices: domainTable<string, InvoiceRecord>(invoiceSchema),
  },
})

export async function openInvoiceTable(ctx: Context): Promise<InvoiceTable> {
  const domain = await ctx.storageDomain.open(finInvoiceSpec)
  ctx.effect(() => () => domain.close(), 'dsh-einvoice.domainClose')
  return domain.table('invoices') as InvoiceTable
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Generate a ULID-compatible 26-character document id. */
export function newDocId(now: number = Date.now()): string {
  let time = now
  let timePart = ''
  for (let index = 0; index < 10; index += 1) {
    timePart = (CROCKFORD[time % 32] ?? '0') + timePart
    time = Math.floor(time / 32)
  }
  const bytes = randomBytes(16)
  let buffer = 0
  let bits = 0
  let randomPart = ''
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte
    bits += 8
    while (bits >= 5 && randomPart.length < 16) {
      bits -= 5
      randomPart += CROCKFORD[(buffer >> bits) & 31] ?? '0'
    }
  }
  return timePart + randomPart
}

export function sha256Buffer(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

export async function sha256File(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath)
    stream.on('data', (chunk) => hash.update(chunk))
    stream.on('error', reject)
    stream.on('end', resolve)
  })
  return hash.digest('hex')
}

export async function storeOriginal(baseDir: string, sha256: string, extension: string, buffer: Buffer): Promise<string> {
  const directory = path.join(baseDir, 'originals')
  await mkdir(directory, { recursive: true })
  const safeExtension = extension.replace(/[^a-z0-9.]/gi, '').slice(0, 8)
  const target = path.join(directory, `${sha256}${safeExtension}`)
  try {
    await writeFile(target, buffer, { mode: 0o600, flag: 'wx' })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EEXIST') throw new InvoiceError('E_INV_STORAGE_FAILED', `cannot store original: ${String(error)}`, { retryable: true })
  }
  return target
}

export function findBySha(table: InvoiceTable, sha256: string): InvoiceRecord | undefined {
  for (const [, record] of table.entries()) {
    if (record.source_sha256 === sha256) return record
  }
  return undefined
}

export function findByInvoiceNo(table: InvoiceTable, entityId: string, invoiceNo: string): InvoiceRecord | undefined {
  for (const [, record] of table.entries()) {
    if (record.entity_id === entityId && record.invoice_no === invoiceNo) return record
  }
  return undefined
}

export function assertUniqueInvoice(table: InvoiceTable, entityId: string, invoiceNo: string, docId: string): void {
  if (!invoiceNo) return
  const existing = findByInvoiceNo(table, entityId, invoiceNo)
  if (existing && existing.doc_id !== docId) {
    throw new InvoiceError('E_INV_DUP_CONFLICT', `这张发票在这个主体下已经入过池了（E_INV_DUP_CONFLICT）｜下一步：用 invoice.query 查已有记录，或换一个 entity_id 再解析`, {
      needs_review: true,
      details: { existing_doc_id: existing.doc_id },
    })
  }
}

export function emptyInvoiceRecord(input: {
  docId: string
  entityId: string
  sourcePath: string
  sourceName: string
  sha256: string
  size: number
  runId: string
  actor: string
}): InvoiceRecord {
  const now = new Date().toISOString()
  return {
    doc_id: input.docId,
    entity_id: input.entityId,
    invoice_no: '',
    issue_date: '',
    buyer: { name: '', tax_id: '' },
    seller: { name: '', tax_id: '' },
    amount_cents: 0,
    tax_cents: 0,
    total_cents: 0,
    currency: 'CNY',
    lines: [],
    confidence: 0,
    field_evidence: {},
    unknown_fields: {},
    parser_version: '',
    lifecycle: 'received' satisfies InvoiceLifecycle,
    source_path: input.sourcePath,
    source_name: input.sourceName,
    source_sha256: input.sha256,
    source_size: input.size,
    created_at: now,
    updated_at: now,
    run_id: input.runId,
    actor: input.actor,
    evidence_sha256: '',
  }
}

export function recordLines(lines: InvoiceLine[]): InvoiceLine[] {
  return lines.map((line) => ({ ...line }))
}
