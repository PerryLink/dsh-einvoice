/**
 * Chinese Unified Social Credit Code (统一社会信用代码) validation.
 * Clean-room implementation of GB 32100-2015: 18 characters over a 31-character set,
 * with the final character as a mod-31 check character.
 */
export const USCC_CHARSET = '0123456789ABCDEFGHJKLMNPQRTUWXY'
const USCC_WEIGHTS = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28]

export interface TaxIdResult {
  tax_id: string
  valid: boolean
  kind: 'USCC' | 'unknown'
  check_character?: string
  reason?: string
}

export function usccCheckCharacter(first17: string): string | null {
  if (first17.length !== 17) return null
  let sum = 0
  for (let i = 0; i < 17; i += 1) {
    const value = USCC_CHARSET.indexOf(first17[i]!)
    if (value < 0) return null
    sum += value * USCC_WEIGHTS[i]!
  }
  return USCC_CHARSET[(31 - (sum % 31)) % 31]!
}

export function taxIdCheck(raw: string): TaxIdResult {
  const taxId = raw.replace(/\s+/g, '').toUpperCase()
  if (taxId.length !== 18) return { tax_id: taxId, valid: false, kind: 'unknown', reason: 'E_INV_TAX_ID_SHAPE' }
  for (const ch of taxId) {
    if (!USCC_CHARSET.includes(ch)) return { tax_id: taxId, valid: false, kind: 'unknown', reason: 'E_INV_TAX_ID_CHARSET' }
  }
  const expected = usccCheckCharacter(taxId.slice(0, 17))
  if (expected === null) return { tax_id: taxId, valid: false, kind: 'unknown', reason: 'E_INV_TAX_ID_CHARSET' }
  if (expected !== taxId[17]) {
    return { tax_id: taxId, valid: false, kind: 'USCC', check_character: expected, reason: 'E_INV_TAX_ID_CHECKSUM' }
  }
  return { tax_id: taxId, valid: true, kind: 'USCC', check_character: expected }
}
