/**
 * EN 16931 code-list checks.
 *
 * The bundled lists are the parts of ISO 4217 (currency), ISO 3166-1 alpha-2 (country) and the
 * EN 16931 VAT category code list (BR-CL-17) that this package can enumerate. A value that is
 * well-formed but absent from a bundled list is reported as "unknown", never as "invalid": the
 * lists are deliberately conservative so a valid code is never rejected just because it is rare.
 */
export const VAT_CATEGORY_CODES = ['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M'] as const
export type VatCategoryCode = typeof VAT_CATEGORY_CODES[number]

export const CURRENCY_CODES = new Set([
  'AED','AFN','ALL','AMD','ANG','AOA','ARS','AUD','AWG','AZN','BAM','BBD','BDT','BGN','BHD','BIF','BMD','BND','BOB','BRL',
  'BSD','BTN','BWP','BYN','BZD','CAD','CDF','CHF','CLP','CNY','COP','CRC','CUP','CVE','CZK','DJF','DKK','DOP','DZD','EGP',
  'ERN','ETB','EUR','FJD','FKP','GBP','GEL','GHS','GIP','GMD','GNF','GTQ','GYD','HKD','HNL','HTG','HUF','IDR','ILS','INR',
  'IQD','IRR','ISK','JMD','JOD','JPY','KES','KGS','KHR','KMF','KPW','KRW','KWD','KYD','KZT','LAK','LBP','LKR','LRD','LSL',
  'LYD','MAD','MDL','MGA','MKD','MMK','MNT','MOP','MRU','MUR','MVR','MWK','MXN','MYR','MZN','NAD','NGN','NIO','NOK','NPR',
  'NZD','OMR','PAB','PEN','PGK','PHP','PKR','PLN','PYG','QAR','RON','RSD','RUB','RWF','SAR','SBD','SCR','SDG','SEK','SGD',
  'SHP','SLE','SOS','SRD','SSP','STN','SVC','SYP','SZL','THB','TJS','TMT','TND','TOP','TRY','TTD','TWD','TZS','UAH','UGX',
  'USD','UYU','UZS','VES','VND','VUV','WST','XAF','XCD','XOF','XPF','YER','ZAR','ZMW','ZWL',
])

// ISO 3166-1 alpha-2, as used by EN 16931 for the seller/buyer country (BR-CL-09/10/11).
export const COUNTRY_CODES = new Set([
  'AD','AE','AF','AG','AI','AL','AM','AO','AQ','AR','AS','AT','AU','AW','AX','AZ','BA','BB','BD','BE','BF','BG','BH','BI','BJ',
  'BL','BM','BN','BO','BQ','BR','BS','BT','BV','BW','BY','BZ','CA','CC','CD','CF','CG','CH','CI','CK','CL','CM','CN','CO','CR',
  'CU','CV','CW','CX','CY','CZ','DE','DJ','DK','DM','DO','DZ','EC','EE','EG','EH','ER','ES','ET','FI','FJ','FK','FM','FO','FR',
  'GA','GB','GD','GE','GF','GG','GH','GI','GL','GM','GN','GP','GQ','GR','GS','GT','GU','GW','GY','HK','HM','HN','HR','HT','HU',
  'ID','IE','IL','IM','IN','IO','IQ','IR','IS','IT','JE','JM','JO','JP','KE','KG','KH','KI','KM','KN','KP','KR','KW','KY','KZ',
  'LA','LB','LC','LI','LK','LR','LS','LT','LU','LV','LY','MA','MC','MD','ME','MF','MG','MH','MK','ML','MM','MN','MO','MP','MQ',
  'MR','MS','MT','MU','MV','MW','MX','MY','MZ','NA','NC','NE','NF','NG','NI','NL','NO','NP','NR','NU','NZ','OM','PA','PE','PF',
  'PG','PH','PK','PL','PM','PN','PR','PS','PT','PW','PY','QA','RE','RO','RS','RU','RW','SA','SB','SC','SD','SE','SG','SH','SI',
  'SJ','SK','SL','SM','SN','SO','SR','SS','ST','SV','SX','SY','SZ','TC','TD','TF','TG','TH','TJ','TK','TL','TM','TN','TO','TR',
  'TT','TV','TW','TZ','UA','UG','UM','US','UY','UZ','VA','VC','VE','VG','VI','VN','VU','WF','WS','YE','YT','ZA','ZM','ZW',
])

export interface CodeIssue { field: string; code: string; detail: string }
export interface CodeCheckResult { checked: number; issues: CodeIssue[] }

const FORMATS = { currency: /^[A-Z]{3}$/, country: /^[A-Z]{2}$/ } as const

export function checkInvoiceCodes(input: { currency?: string; country_code?: string; vat_category?: string }): CodeCheckResult {
  const issues: CodeIssue[] = []
  let checked = 0
  if (input.currency !== undefined) {
    checked += 1
    const value = input.currency.trim().toUpperCase()
    if (!FORMATS.currency.test(value)) issues.push({ field: 'currency', code: 'E_INV_CODE_FORMAT', detail: `currency must be three uppercase letters, got "${input.currency}"` })
    else if (!CURRENCY_CODES.has(value)) issues.push({ field: 'currency', code: 'E_INV_CODE_UNKNOWN', detail: `${value} is not in the bundled ISO 4217 list` })
  }
  if (input.country_code !== undefined) {
    checked += 1
    const value = input.country_code.trim().toUpperCase()
    if (!FORMATS.country.test(value)) issues.push({ field: 'country_code', code: 'E_INV_CODE_FORMAT', detail: `country code must be two uppercase letters, got "${input.country_code}"` })
    else if (!COUNTRY_CODES.has(value as string)) issues.push({ field: 'country_code', code: 'E_INV_CODE_UNKNOWN', detail: `${value} is not in the bundled ISO 3166-1 list` })
  }
  if (input.vat_category !== undefined) {
    checked += 1
    const value = input.vat_category.trim().toUpperCase()
    if (!(VAT_CATEGORY_CODES as readonly string[]).includes(value)) {
      issues.push({ field: 'vat_category', code: 'E_INV_CODE_VAT_CATEGORY', detail: `${value || '(empty)'} is not an EN 16931 BR-CL-17 category (${VAT_CATEGORY_CODES.join(', ')})` })
    }
  }
  return { checked, issues }
}
