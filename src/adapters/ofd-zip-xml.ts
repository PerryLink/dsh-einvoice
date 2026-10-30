/** OFD (ZIP + XML) and standalone XML reader for SKU-04 S1. */

import { unzipSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import {
  InvoiceError,
  amountToCents,
  priceToCents,
  normalizeDate,
  normalizeTaxId,
  type InvoiceLine,
  type ParsedInvoice,
  type InvoiceDocumentKind,
} from '../core/invoice.js'

export const PARSER_ID = 'ofd-zip-xml'
export const PARSER_VERSION = 'ofd-zip-xml@1'

export interface ParserInput {
  buffer: Buffer
  fileName: string
}

export interface ParserAdapter {
  id: string
  version: string
  supports(input: ParserInput): boolean
  parse(input: ParserInput): ParsedInvoice
}

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: false,
  allowBooleanAttributes: false,
})

type JsonObject = Record<string, unknown>

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}

function asObject(value: unknown): JsonObject | undefined {
  if (Array.isArray(value)) return asObject(value[0])
  return isObject(value) ? value : undefined
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(scalar).join('')
  if (isObject(value)) {
    const text = value['#text']
    if (text !== undefined) return scalar(text)
  }
  return ''
}

function child(node: JsonObject | undefined, key: string): JsonObject | undefined {
  return node ? asObject(node[key]) : undefined
}

function textAt(node: JsonObject | undefined, ...path: string[]): string {
  let current: unknown = node
  for (const key of path) {
    const currentObject = asObject(current)
    if (!currentObject) return ''
    current = currentObject[key]
  }
  return scalar(current)
}

function unknownTopLevel(root: JsonObject, known: readonly string[]): Record<string, unknown> {
  const knownSet = new Set(known)
  const unknown: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(root)) {
    if (!knownSet.has(key)) unknown[key] = value
  }
  return unknown
}

function parseXml(text: string): JsonObject {
  const parsed = xmlParser.parse(text) as unknown
  if (!isObject(parsed)) throw new InvoiceError('E_INV_XML_SCHEMA_DRIFT', 'XML root is not an object', { needs_review: true })
  return parsed
}

const OLD_KNOWN = [
  'DocID', 'InvoiceCode', 'InvoiceNo', 'TypeCode', 'IssueDate', 'InvoiceCheckCode',
  'MachineNo', 'TaxControlCode', 'Buyer', 'Tpvn', 'Seller', 'TaxInclusiveTotalAmount',
  'Note', 'InvoiceClerk', 'Payee', 'Checker', 'TaxTotalAmount', 'TaxExclusiveTotalAmount',
  'GraphCode', 'InvoiceSIA1', 'InvoiceSIA2', 'Signature', 'GoodsInfos', '@_Version',
] as const

function parseOldInvoice(root: JsonObject): ParsedInvoice {
  const buyer = child(root, 'Buyer')
  const seller = child(root, 'Seller')
  const buyerName = textAt(buyer, 'BuyerName')
  const sellerName = textAt(seller, 'SellerName')
  const buyerTaxId = normalizeTaxId(textAt(buyer, 'BuyerTaxID'))
  const sellerTaxId = normalizeTaxId(textAt(seller, 'SellerTaxID'))
  const issueDate = normalizeDate(textAt(root, 'IssueDate'))
  const amountCents = amountToCents(textAt(root, 'TaxExclusiveTotalAmount'))
  const taxCents = amountToCents(textAt(root, 'TaxTotalAmount'))
  const totalCents = amountToCents(textAt(root, 'TaxInclusiveTotalAmount'))
  const goodsInfo = asArray(child(root, 'GoodsInfos')?.GoodsInfo)
  const lines: InvoiceLine[] = goodsInfo.map((raw, index) => {
    const line = asObject(raw) ?? {}
    const amount = textAt(line, 'Amount')
    const tax = textAt(line, 'TaxAmount')
    return {
      line_no: index + 1,
      description: textAt(line, 'Item'),
      quantity: textAt(line, 'Quantity') || undefined,
      unit_price_cents: textAt(line, 'Price') ? priceToCents(textAt(line, 'Price')) : undefined,
      amount_cents: amount ? amountToCents(amount) : 0,
      tax_rate: textAt(line, 'TaxScheme') || undefined,
      tax_cents: tax ? amountToCents(tax) : undefined,
    }
  })
  const unknown = unknownTopLevel(root, OLD_KNOWN)
  for (const [key, value] of Object.entries(buyer ?? {})) {
    if (!['BuyerName', 'BuyerTaxID'].includes(key)) unknown[`Buyer.${key}`] = value
  }
  for (const [key, value] of Object.entries(seller ?? {})) {
    if (!['SellerName', 'SellerTaxID'].includes(key)) unknown[`Seller.${key}`] = value
  }
  return {
    document_kind: 'ofd-old',
    invoice_no: textAt(root, 'InvoiceNo'),
    invoice_code: textAt(root, 'InvoiceCode') || undefined,
    issue_date: issueDate,
    buyer: { name: buyerName, tax_id: buyerTaxId },
    seller: { name: sellerName, tax_id: sellerTaxId },
    amount_cents: amountCents,
    tax_cents: taxCents,
    total_cents: totalCents,
    currency: 'CNY',
    lines,
    confidence: 1,
    field_evidence: {
      invoice_no: 'Attachs/original_invoice.xml:InvoiceNo',
      issue_date: 'Attachs/original_invoice.xml:IssueDate',
      buyer_name: 'Attachs/original_invoice.xml:Buyer/BuyerName',
      buyer_tax_id: 'Attachs/original_invoice.xml:Buyer/BuyerTaxID',
      seller_name: 'Attachs/original_invoice.xml:Seller/SellerName',
      seller_tax_id: 'Attachs/original_invoice.xml:Seller/SellerTaxID',
      amount_cents: 'Attachs/original_invoice.xml:TaxExclusiveTotalAmount',
      tax_cents: 'Attachs/original_invoice.xml:TaxTotalAmount',
      total_cents: 'Attachs/original_invoice.xml:TaxInclusiveTotalAmount',
    },
    unknown_fields: unknown,
    parser_version: PARSER_VERSION,
    warnings: [],
  }
}

function collectRefs(value: unknown, out: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, out)
    return out
  }
  if (!isObject(value)) return out
  for (const [key, childValue] of Object.entries(value)) {
    if (key === 'ObjectRef') {
      for (const item of asArray(childValue)) {
        const text = scalar(item)
        if (text) out.push(text)
      }
      continue
    }
    collectRefs(childValue, out)
  }
  return out
}

function collectTextCodes(value: unknown): string {
  if (Array.isArray(value)) return value.map(collectTextCodes).join('')
  if (isObject(value)) {
    if (value.TextCode !== undefined) return collectTextCodes(value.TextCode)
    if (value['#text'] !== undefined) return scalar(value['#text'])
  }
  return scalar(value)
}

function collectTextObjects(value: unknown, out: Map<string, string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectTextObjects(item, out)
    return
  }
  if (!isObject(value)) return
  if (value.TextObject !== undefined) {
    for (const raw of asArray(value.TextObject)) {
      const object = asObject(raw)
      if (!object) continue
      const id = scalar(object['@_ID'])
      if (!id) continue
      out.set(id, collectTextCodes(object.TextCode))
    }
  }
  for (const childValue of Object.values(value)) collectTextObjects(childValue, out)
}

const DIGITAL_KNOWN = [
  'InvoiceNo', 'IssueDate', 'Buyer', 'Seller', 'TaxExclusiveTotalAmount', 'TaxTotalAmount',
  'TaxInclusiveTotalAmount', 'InvoiceClerk', 'Item', 'TaxScheme', 'Amount', 'TaxAmount',
  'Price', 'Quantity', 'Note', '@_version',
] as const

function digitalField(root: JsonObject, key: string, textMap: Map<string, string>): { value: string; evidence: string } {
  const raw = root[key]
  if (raw === undefined || raw === null) throw new InvoiceError('E_INV_FIELD_MISSING', `CustomTag field missing: ${key}`, { needs_review: true })
  const refs = collectRefs(raw)
  if (refs.length > 0) {
    const resolved = refs.map((id) => textMap.get(id) ?? '').join('')
    if (resolved) return { value: resolved, evidence: `Tags/CustomTag.xml:${key} -> ${refs.map((id) => `#${id}`).join(',')}` }
  }
  const direct = scalar(raw)
  if (direct) return { value: direct, evidence: `Tags/CustomTag.xml:${key}` }
  throw new InvoiceError('E_INV_FIELD_MISSING', `CustomTag field has no text: ${key}`, { needs_review: true })
}

function parseDigitalInvoice(root: JsonObject, textMap: Map<string, string>): ParsedInvoice {
  const buyer = child(root, 'Buyer')
  const seller = child(root, 'Seller')
  const invoiceNo = digitalField(root, 'InvoiceNo', textMap)
  const issueDate = digitalField(root, 'IssueDate', textMap)
  const buyerName = buyer ? digitalField(buyer, 'BuyerName', textMap) : undefined
  const buyerTaxId = buyer ? digitalField(buyer, 'BuyerTaxID', textMap) : undefined
  const sellerName = seller ? digitalField(seller, 'SellerName', textMap) : undefined
  const sellerTaxId = seller ? digitalField(seller, 'SellerTaxID', textMap) : undefined
  const amount = digitalField(root, 'TaxExclusiveTotalAmount', textMap)
  const tax = digitalField(root, 'TaxTotalAmount', textMap)
  const total = digitalField(root, 'TaxInclusiveTotalAmount', textMap)
  const itemRefs = collectRefs(root.Item)
  const taxSchemeRefs = collectRefs(root.TaxScheme)
  const amountRefs = collectRefs(root.Amount)
  const taxAmountRefs = collectRefs(root.TaxAmount)
  const priceRefs = collectRefs(root.Price)
  const quantityRefs = collectRefs(root.Quantity)
  const lines: InvoiceLine[] = itemRefs.map((id, index) => {
    const description = textMap.get(id) ?? ''
    const amountText = textMap.get(amountRefs[index] ?? '') ?? ''
    const taxText = textMap.get(taxAmountRefs[index] ?? '') ?? ''
    return {
      line_no: index + 1,
      description,
      quantity: textMap.get(quantityRefs[index] ?? '') || undefined,
      unit_price_cents: textMap.get(priceRefs[index] ?? '') ? priceToCents(textMap.get(priceRefs[index] ?? '') ?? '') : undefined,
      amount_cents: amountText ? amountToCents(amountText) : 0,
      tax_rate: textMap.get(taxSchemeRefs[index] ?? '') || undefined,
      tax_cents: taxText ? amountToCents(taxText) : undefined,
    }
  })
  return {
    document_kind: 'ofd-digital',
    invoice_no: invoiceNo.value,
    issue_date: normalizeDate(issueDate.value),
    buyer: {
      name: buyerName?.value ?? '',
      tax_id: normalizeTaxId(buyerTaxId?.value ?? ''),
    },
    seller: {
      name: sellerName?.value ?? '',
      tax_id: normalizeTaxId(sellerTaxId?.value ?? ''),
    },
    amount_cents: amountToCents(amount.value),
    tax_cents: amountToCents(tax.value),
    total_cents: amountToCents(total.value),
    currency: 'CNY',
    lines,
    confidence: 1,
    field_evidence: {
      invoice_no: invoiceNo.evidence,
      issue_date: issueDate.evidence,
      buyer_name: buyerName?.evidence ?? '',
      buyer_tax_id: buyerTaxId?.evidence ?? '',
      seller_name: sellerName?.evidence ?? '',
      seller_tax_id: sellerTaxId?.evidence ?? '',
      amount_cents: amount.evidence,
      tax_cents: tax.evidence,
      total_cents: total.evidence,
    },
    unknown_fields: unknownTopLevel(root, DIGITAL_KNOWN),
    parser_version: PARSER_VERSION,
    warnings: [],
  }
}

const GENERIC_KNOWN = [
  'InvoiceNo', 'InvoiceIssueDate', 'IssueDate', 'InvoiceTypeName', 'Seller', 'Buyer',
  'Items', 'Amount', 'TaxAmount', 'TotalAmount', 'InvoiceCode',
] as const

function parseGenericInvoice(root: JsonObject): ParsedInvoice {
  const buyer = child(root, 'Buyer')
  const seller = child(root, 'Seller')
  const buyerName = textAt(buyer, 'Name') || textAt(buyer, 'BuyerName')
  const sellerName = textAt(seller, 'Name') || textAt(seller, 'SellerName')
  const buyerTaxId = textAt(buyer, 'TaxID') || textAt(buyer, 'BuyerTaxID')
  const sellerTaxId = textAt(seller, 'TaxID') || textAt(seller, 'SellerTaxID')
  const issueDate = textAt(root, 'InvoiceIssueDate') || textAt(root, 'IssueDate')
  const items = asArray(child(root, 'Items')?.Item)
  const lines: InvoiceLine[] = items.map((raw, index) => {
    const line = asObject(raw) ?? {}
    return {
      line_no: index + 1,
      description: textAt(line, 'Description') || textAt(line, 'Item'),
      quantity: textAt(line, 'Quantity') || undefined,
      unit_price_cents: textAt(line, 'UnitPrice') ? priceToCents(textAt(line, 'UnitPrice')) : undefined,
      amount_cents: textAt(line, 'Amount') ? amountToCents(textAt(line, 'Amount')) : 0,
      tax_rate: textAt(line, 'TaxRate') || undefined,
      tax_cents: textAt(line, 'TaxAmount') ? amountToCents(textAt(line, 'TaxAmount')) : undefined,
    }
  })
  return {
    document_kind: 'xml',
    invoice_no: textAt(root, 'InvoiceNo'),
    invoice_code: textAt(root, 'InvoiceCode') || undefined,
    issue_date: normalizeDate(issueDate),
    buyer: { name: buyerName, tax_id: normalizeTaxId(buyerTaxId) },
    seller: { name: sellerName, tax_id: normalizeTaxId(sellerTaxId) },
    amount_cents: amountToCents(textAt(root, 'Amount')),
    tax_cents: amountToCents(textAt(root, 'TaxAmount')),
    total_cents: amountToCents(textAt(root, 'TotalAmount')),
    currency: 'CNY',
    lines,
    confidence: 1,
    field_evidence: {
      invoice_no: 'XML:InvoiceNo',
      issue_date: 'XML:InvoiceIssueDate',
      buyer_name: 'XML:Buyer/Name',
      buyer_tax_id: 'XML:Buyer/TaxID',
      seller_name: 'XML:Seller/Name',
      seller_tax_id: 'XML:Seller/TaxID',
      amount_cents: 'XML:Amount',
      tax_cents: 'XML:TaxAmount',
      total_cents: 'XML:TotalAmount',
    },
    unknown_fields: unknownTopLevel(root, GENERIC_KNOWN),
    parser_version: PARSER_VERSION,
    warnings: [],
  }
}

function decodeEntry(entries: Record<string, Uint8Array>, name: string): string {
  const entry = entries[name]
  if (!entry) throw new InvoiceError('E_INV_OFD_UNSUPPORTED', `missing OFD part: ${name}`)
  return new TextDecoder('utf-8', { fatal: false }).decode(entry)
}

function findEntry(entries: Record<string, Uint8Array>, suffix: string): string | undefined {
  return Object.keys(entries).find((name) => name.endsWith(suffix))
}

function parseOfd(input: ParserInput): ParsedInvoice {
  let count = 0
  let total = 0
  const entries = unzipSync(new Uint8Array(input.buffer), {
    filter(file) {
      count += 1
      total += Number((file as unknown as { originalSize?: number; size?: number }).originalSize ?? (file as unknown as { size?: number }).size ?? 0)
      if (count > 1000 || total > 100 * 1024 * 1024) {
        throw new InvoiceError('E_INV_FILE_UNREADABLE', 'OFD archive exceeds safe entry/size limits')
      }
      return true
    },
  }) as Record<string, Uint8Array>
  if (!entries['OFD.xml']) throw new InvoiceError('E_INV_OFD_UNSUPPORTED', 'missing OFD.xml')
  const oldXmlName = findEntry(entries, 'Attachs/original_invoice.xml')
  if (oldXmlName) {
    const root = parseXml(decodeEntry(entries, oldXmlName))
    const invoiceRoot = asObject(root.eInvoice) ?? asObject(root.Invoice) ?? root
    return parseOldInvoice(invoiceRoot)
  }
  const customTagName = findEntry(entries, 'Tags/CustomTag.xml')
  if (customTagName) {
    const textMap = new Map<string, string>()
    for (const name of Object.keys(entries)) {
      if (/\/Pages\/.*\/Content\.xml$/i.test(name)) {
        collectTextObjects(parseXml(decodeEntry(entries, name)), textMap)
      }
    }
    const root = parseXml(decodeEntry(entries, customTagName))
    const tagRoot = asObject(root.root) ?? root
    return parseDigitalInvoice(tagRoot, textMap)
  }
  for (const name of Object.keys(entries)) {
    if (!name.endsWith('.xml')) continue
    const text = decodeEntry(entries, name)
    if (text.includes('<eInvoice') || text.includes('<Invoice')) {
      const root = parseXml(text)
      return parseGenericInvoice(asObject(root.eInvoice) ?? asObject(root.Invoice) ?? root)
    }
  }
  throw new InvoiceError('E_INV_OFD_UNSUPPORTED', 'no recognized invoice XML in OFD')
}

function parseStandaloneXml(input: ParserInput): ParsedInvoice {
  const text = input.buffer.toString('utf8')
  if (text.length > 50 * 1024 * 1024) throw new InvoiceError('E_INV_FILE_UNREADABLE', 'XML exceeds 50MB')
  const root = parseXml(text)
  const invoiceRoot = asObject(root.eInvoice) ?? asObject(root.Invoice) ?? root
  if (invoiceRoot.Buyer && invoiceRoot.InvoiceNo) return parseGenericInvoice(invoiceRoot)
  if (invoiceRoot.Buyer && invoiceRoot.IssueDate && !invoiceRoot.InvoiceIssueDate) return parseOldInvoice(invoiceRoot)
  return parseGenericInvoice(invoiceRoot)
}

export const ofdZipXmlParser: ParserAdapter = {
  id: PARSER_ID,
  version: PARSER_VERSION,
  supports(input: ParserInput): boolean {
    if (input.buffer.length === 0) return false
    const first = input.buffer.subarray(0, 2).toString('latin1')
    if (first === 'PK') return true
    const text = input.buffer.subarray(0, 64).toString('utf8').trimStart()
    return text.startsWith('<')
  },
  parse(input: ParserInput): ParsedInvoice {
    if (input.buffer.length === 0) throw new InvoiceError('E_INV_FILE_UNREADABLE', 'empty file')
    if (input.buffer.subarray(0, 2).toString('latin1') === 'PK') return parseOfd(input)
    return parseStandaloneXml(input)
  },
}

export type { InvoiceDocumentKind }
