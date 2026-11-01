import test from 'node:test'
import assert from 'node:assert/strict'
import { CURRENCY_CODES, COUNTRY_CODES, VAT_CATEGORY_CODES, checkInvoiceCodes } from '../lib/core/codes.js'
import { createTools } from '../lib/plugin/tools.js'

const tools = Object.fromEntries(createTools({ table: { get(){}, entries(){ return [] }, put(){} }, baseDir: '/tmp/inv-codes', inputRoots: ['/tmp'] }).map((t) => [t.name, t]))
const exec = { callId: 'codes' }

test('the bundled EN 16931 VAT category list has the nine codes', () => {
  assert.deepEqual([...VAT_CATEGORY_CODES].sort(), ['AE', 'E', 'G', 'K', 'L', 'M', 'O', 'S', 'Z'])
  assert.ok(CURRENCY_CODES.has('EUR') && CURRENCY_CODES.has('CNY'))
  assert.ok(COUNTRY_CODES.has('DE') && COUNTRY_CODES.has('CN'))
})

test('well-formed, listed values produce no issues', async () => {
  const r = await tools['invoice.code_check'].execute({ currency: 'eur', country_code: 'de', vat_category: 's' }, exec)
  assert.equal(r.checked, 3)
  assert.deepEqual(r.issues, [])
})

test('format errors are distinct from unknown values', async () => {
  const bad = await tools['invoice.code_check'].execute({ currency: 'EURO', country_code: 'DEU', vat_category: '' }, exec)
  assert.equal(bad.issues.filter((i) => i.code === 'E_INV_CODE_FORMAT').length, 2)
  assert.ok(bad.issues.some((i) => i.code === 'E_INV_CODE_VAT_CATEGORY'))
  const unknown = await tools['invoice.code_check'].execute({ currency: 'ZZZ', country_code: 'QQ' }, exec)
  assert.equal(unknown.issues.filter((i) => i.code === 'E_INV_CODE_UNKNOWN').length, 2)
})

test('partial input only checks the provided fields', () => {
  const r = checkInvoiceCodes({ vat_category: 'AE' })
  assert.equal(r.checked, 1)
  assert.equal(r.issues.length, 0)
})
