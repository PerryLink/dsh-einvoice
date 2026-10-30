import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ofdZipXmlParser } from '../lib/adapters/ofd-zip-xml.js'

const base = path.resolve(process.cwd(), '../.tmp/oss-samples')
const sample = (relative) => path.join(base, relative)

const parseable = [
  ['old ofdrw 1.ofd', 'from-subagent/ofdrw-tests/1.ofd', 'ofd-old', 52600],
  ['digital ofdrw 20240531.ofd', 'ofdrw-20240531.ofd', 'ofd-digital', 444900],
  ['old ofdrw invoice-sample.ofd', 'ofdrw-invoice-sample.ofd', 'ofd-old', 31800],
  ['synthetic invoice-github XML-in-OFD', 'invoice-github/样例/样例发票.ofd', 'xml', 106000],
]

for (const [name, relative, kind, total] of parseable) {
  test(`public sample: ${name}`, { skip: !existsSync(sample(relative)) }, () => {
    const parsed = ofdZipXmlParser.parse({ buffer: readFileSync(sample(relative)), fileName: path.basename(relative) })
    assert.equal(parsed.document_kind, kind)
    assert.equal(parsed.total_cents, total)
  })
}

test('public sample: 999.ofd is a known missing-buyer-tax-id case', { skip: !existsSync(sample('from-subagent/ofdrw-tests/999.ofd')) }, () => {
  assert.throws(
    () => ofdZipXmlParser.parse({ buffer: readFileSync(sample('from-subagent/ofdrw-tests/999.ofd')), fileName: '999.ofd' }),
    /E_INV_FIELD_MISSING/,
  )
})

test('public sample: non-invoice logical structure is rejected', { skip: !existsSync(sample('from-subagent/ofdrw-tests/signout.ofd')) }, () => {
  assert.throws(
    () => ofdZipXmlParser.parse({ buffer: readFileSync(sample('from-subagent/ofdrw-tests/signout.ofd')), fileName: 'signout.ofd' }),
    /E_INV_FIELD_MISSING/,
  )
})
