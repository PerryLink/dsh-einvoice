import test from 'node:test'
import assert from 'node:assert/strict'
import { taxIdCheck, usccCheckCharacter } from '../lib/core/uscc.js'

test('valid USCC passes the mod-31 check character', () => {
  const r = taxIdCheck('91330106MA2B4C5D6X')
  assert.equal(r.valid, true)
  assert.equal(r.kind, 'USCC')
  assert.equal(r.reason, undefined)
  assert.equal(usccCheckCharacter('91330106MA2B4C5D6'), 'X')
})

test('a wrong check character reports the expected one', () => {
  const r = taxIdCheck('91330106MA2B4C5D6Y')
  assert.equal(r.valid, false)
  assert.equal(r.kind, 'USCC')
  assert.equal(r.reason, 'E_INV_TAX_ID_CHECKSUM')
  assert.equal(r.check_character, 'X')
})

test('shape and charset failures are distinct', () => {
  assert.equal(taxIdCheck('91330106MA2B4C5D').reason, 'E_INV_TAX_ID_SHAPE')
  assert.equal(taxIdCheck('91330106MA2B4C5D6I').reason, 'E_INV_TAX_ID_CHARSET')
})

test('whitespace and lowercase are normalised', () => {
  const r = taxIdCheck(' 91330106ma2b4c5d6x ')
  assert.equal(r.valid, true)
  assert.equal(r.tax_id, '91330106MA2B4C5D6X')
})
