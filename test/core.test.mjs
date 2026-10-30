import test from 'node:test'
import assert from 'node:assert/strict'
import {
  InvoiceError,
  amountToCents,
  assertEightFields,
  canonicalJson,
  invoicePeriod,
  normalizeDate,
  normalizeTaxId,
  priceToCents,
} from '../lib/core/invoice.js'

test('amountToCents keeps decimal money exact', () => {
  assert.equal(amountToCents('318.00'), 31800)
  assert.equal(amountToCents('¥4,197.17'), 419717)
  assert.equal(amountToCents('-100.00'), -10000)
  assert.equal(amountToCents('0'), 0)
  assert.throws(() => amountToCents('12.345'), InvoiceError)
})

test('priceToCents rounds tax-calculation precision', () => {
  assert.equal(priceToCents('510.679612'), 51068)
  assert.equal(priceToCents('4197.16981132075'), 419717)
  assert.equal(priceToCents('75.00'), 7500)
  assert.equal(priceToCents('-100.005'), -10001)
})

test('normalizeDate accepts Chinese, dashed and compact dates', () => {
  assert.equal(normalizeDate('2020年10月10日'), '2020-10-10')
  assert.equal(normalizeDate('2024/5/31'), '2024-05-31')
  assert.equal(normalizeDate('20240531'), '2024-05-31')
  assert.throws(() => normalizeDate('2024-02-30'), InvoiceError)
})

test('normalizeTaxId validates shape and uppercases', () => {
  assert.equal(normalizeTaxId(' 91330106ma2b4c5d6x '), '91330106MA2B4C5D6X')
  assert.throws(() => normalizeTaxId(''), InvoiceError)
  assert.throws(() => normalizeTaxId('bad!'), InvoiceError)
})

test('assertEightFields enforces the eight fields and amount arithmetic', () => {
  const invoice = {
    document_kind: 'xml',
    invoice_no: '25512345000000000091',
    issue_date: '2026-08-01',
    buyer: { name: '测试买方', tax_id: '91310115MA1K2L3M4N' },
    seller: { name: '测试卖方', tax_id: '91330106MA2B4C5D6X' },
    amount_cents: 100000,
    tax_cents: 6000,
    total_cents: 106000,
    currency: 'CNY',
    lines: [],
    confidence: 1,
    field_evidence: {},
    unknown_fields: {},
    parser_version: 'test',
    warnings: [],
  }
  assert.doesNotThrow(() => assertEightFields(invoice))
  assert.throws(() => assertEightFields({ ...invoice, total_cents: 1 }), InvoiceError)
  assert.throws(() => assertEightFields({ ...invoice, buyer: { name: '', tax_id: '' } }), InvoiceError)
})

test('canonicalJson is stable across key order', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), canonicalJson({ a: 1, b: 2 }))
  assert.equal(invoicePeriod('2026-08-01'), '2026-08')
})
