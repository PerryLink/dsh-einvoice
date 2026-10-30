/** Pure invoice domain helpers. No DSH/Cordis imports are allowed here. */

export type InvoiceDocumentKind = 'ofd-old' | 'ofd-digital' | 'xml'

export interface InvoiceParty {
  name: string
  tax_id: string
}

export interface InvoiceLine {
  line_no: number
  description: string
  quantity?: string
  unit_price_cents?: number
  amount_cents: number
  tax_rate?: string
  tax_cents?: number
}

export interface ParsedInvoice {
  document_kind: InvoiceDocumentKind
  invoice_no: string
  invoice_code?: string
  issue_date: string
  buyer: InvoiceParty
  seller: InvoiceParty
  amount_cents: number
  tax_cents: number
  total_cents: number
  currency: 'CNY'
  lines: InvoiceLine[]
  confidence: number
  field_evidence: Record<string, string>
  unknown_fields: Record<string, unknown>
  parser_version: string
  warnings: string[]
}

export type InvoiceLifecycle = 'received' | 'parsed' | 'verified' | 'archived' | 'quarantined'

export interface InvoiceErrorOptions {
  retryable?: boolean
  needs_review?: boolean
  details?: Record<string, unknown>
}

/** Project-convention error; DSH renders a thrown tool error as isError. */
export class InvoiceError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly needs_review: boolean
  readonly details?: Record<string, unknown>

  constructor(code: string, message: string, options: InvoiceErrorOptions = {}) {
    super(`${code}: ${message}`)
    this.name = 'InvoiceError'
    this.code = code
    this.retryable = options.retryable ?? false
    this.needs_review = options.needs_review ?? false
    this.details = options.details
  }
}

/** Parse a decimal amount (yuan) into integer cents without floating point. */
export function amountToCents(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw new InvoiceError('E_INV_FIELD_MISSING', 'amount is not finite')
    return Math.round(raw * 100)
  }
  if (typeof raw !== 'string') throw new InvoiceError('E_INV_FIELD_MISSING', 'amount is not a string or number')
  const cleaned = raw.replace(/[¥￥,\s，]/g, '').trim()
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned)
  if (!match) throw new InvoiceError('E_INV_FIELD_MISSING', `amount is not a decimal: ${raw}`)
  const sign = match[1] === '-' ? -1n : 1n
  const whole = BigInt(match[2] ?? '0')
  const fraction = BigInt((match[3] ?? '').padEnd(2, '0'))
  const cents = sign * (whole * 100n + fraction)
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new InvoiceError('E_INV_FIELD_MISSING', 'amount exceeds safe integer cents')
  }
  return Number(cents)
}

/** Normalize the common Chinese date spellings to YYYY-MM-DD. */
export function normalizeDate(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InvoiceError('E_INV_FIELD_MISSING', 'issue date is empty')
  }
  const value = raw.trim()
  const compact = /^(\d{4})(\d{2})(\d{2})$/.exec(value)
  const chinese = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/.exec(value)
  const dashed = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(value)
  const match = dashed ?? chinese ?? compact
  if (!match) throw new InvoiceError('E_INV_FIELD_MISSING', `unrecognized issue date: ${value}`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new InvoiceError('E_INV_FIELD_MISSING', `invalid issue date: ${value}`)
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** Validate the shape of a PRC taxpayer id without claiming checksum validity. */
export function normalizeTaxId(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new InvoiceError('E_INV_FIELD_MISSING', 'tax id is empty')
  }
  const value = raw.replace(/\s/g, '').toUpperCase()
  if (!/^[0-9A-Z]{15,20}$/.test(value)) {
    throw new InvoiceError('E_INV_FIELD_MISSING', `tax id has an unexpected shape: ${value.slice(0, 4)}…`)
  }
  return value
}

export function invoicePeriod(issueDate: string): string {
  return issueDate.slice(0, 7)
}

/** Ensure the eight published fields exist and are internally consistent. */
export function assertEightFields(invoice: ParsedInvoice): void {
  const missing: string[] = []
  if (!invoice.invoice_no) missing.push('invoice_no')
  if (!invoice.issue_date) missing.push('issue_date')
  if (!invoice.buyer.name) missing.push('buyer.name')
  if (!invoice.buyer.tax_id) missing.push('buyer.tax_id')
  if (!invoice.seller.name) missing.push('seller.name')
  if (!invoice.seller.tax_id) missing.push('seller.tax_id')
  if (!Number.isInteger(invoice.amount_cents)) missing.push('amount_cents')
  if (!Number.isInteger(invoice.tax_cents)) missing.push('tax_cents')
  if (!Number.isInteger(invoice.total_cents)) missing.push('total_cents')
  if (missing.length > 0) {
    throw new InvoiceError('E_INV_FIELD_MISSING', `missing fields: ${missing.join(',')}`, { needs_review: true })
  }
  if (invoice.total_cents !== invoice.amount_cents + invoice.tax_cents) {
    throw new InvoiceError('E_INV_XML_SCHEMA_DRIFT', 'total != amount + tax', {
      needs_review: true,
      details: {
        amount_cents: invoice.amount_cents,
        tax_cents: invoice.tax_cents,
        total_cents: invoice.total_cents,
      },
    })
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}
