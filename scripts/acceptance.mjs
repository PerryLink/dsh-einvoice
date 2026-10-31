/** S1 acceptance: synthetic old/digital/generic invoices + negative inputs. */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { strToU8, zipSync } from 'fflate'
import { ofdZipXmlParser } from '../lib/adapters/ofd-zip-xml.js'
import { InvoiceError } from '../lib/core/invoice.js'
import { createTools } from '../lib/plugin/tools.js'

const root = process.cwd()
const runId = `s1-${new Date().toISOString().replace(/[:.]/g, '-')}`
const evidenceDir = path.join(root, 'evidence', runId)
mkdirSync(evidenceDir, { recursive: true })

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function zip(files) {
  const entries = {}
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text)
  return Buffer.from(zipSync(entries))
}

const oldXml = `<?xml version="1.0" encoding="utf-8"?>
<eInvoice><InvoiceCode>050001700111</InvoiceCode><InvoiceNo>99999951</InvoiceNo><IssueDate>2020年10月10日</IssueDate>
<Buyer><BuyerName>测试买方有限公司</BuyerName><BuyerTaxID>91330106MA2B4C5D6X</BuyerTaxID></Buyer>
<Seller><SellerName>测试卖方有限公司</SellerName><SellerTaxID>91310115MA1K2L3M4N</SellerTaxID></Seller>
<TaxExclusiveTotalAmount>300.00</TaxExclusiveTotalAmount><TaxTotalAmount>18.00</TaxTotalAmount><TaxInclusiveTotalAmount>318.00</TaxInclusiveTotalAmount>
<GoodsInfos><GoodsInfo><Item>*餐饮服务*餐费</Item><Quantity>4</Quantity><Price>75.00</Price><Amount>300.00</Amount><TaxScheme>6%</TaxScheme><TaxAmount>18.00</TaxAmount></GoodsInfo></GoodsInfos>
</eInvoice>`

const digitalTag = `<?xml version="1.0" encoding="UTF-8"?><root>
<InvoiceNo><ObjectRef PageRef="1">1</ObjectRef></InvoiceNo><IssueDate><ObjectRef PageRef="1">2</ObjectRef></IssueDate>
<Buyer><BuyerName><ObjectRef PageRef="1">3</ObjectRef></BuyerName><BuyerTaxID><ObjectRef PageRef="1">4</ObjectRef></BuyerTaxID></Buyer>
<Seller><SellerName><ObjectRef PageRef="1">5</ObjectRef></SellerName><SellerTaxID><ObjectRef PageRef="1">6</ObjectRef></SellerTaxID></Seller>
<TaxExclusiveTotalAmount><ObjectRef PageRef="1">7</ObjectRef></TaxExclusiveTotalAmount><TaxTotalAmount><ObjectRef PageRef="1">8</ObjectRef></TaxTotalAmount>
<TaxInclusiveTotalAmount><ObjectRef PageRef="1">9</ObjectRef><ObjectRef PageRef="1">10</ObjectRef></TaxInclusiveTotalAmount>
<Item><ObjectRef PageRef="1">11</ObjectRef></Item><TaxScheme><ObjectRef PageRef="1">12</ObjectRef></TaxScheme><Amount><ObjectRef PageRef="1">13</ObjectRef></Amount><TaxAmount><ObjectRef PageRef="1">14</ObjectRef></TaxAmount><Price><ObjectRef PageRef="1">15</ObjectRef></Price><Quantity><ObjectRef PageRef="1">16</ObjectRef></Quantity>
</root>`

function page(values) {
  const objects = values.map(([id, text]) => `<ofd:TextObject ID="${id}"><ofd:TextCode>${text}</ofd:TextCode></ofd:TextObject>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer>${objects}</ofd:Layer></ofd:Content></ofd:Page>`
}

const digital = zip({
  'OFD.xml': '<OFD/>',
  'Doc_0/Tags/CustomTag.xml': digitalTag,
  'Doc_0/Pages/Page_0/Content.xml': page([
    ['1', '25512345000000000091'], ['2', '2026年08月01日'], ['3', '测试买方有限公司'], ['4', '91310115MA1K2L3M4N'],
    ['5', '测试卖方有限公司'], ['6', '91330106MA2B4C5D6X'], ['7', '1000.00'], ['8', '60.00'], ['9', '¥'], ['10', '1060.00'],
    ['11', '技术服务费'], ['12', '6%'], ['13', '1000.00'], ['14', '60.00'], ['15', '500.00'], ['16', '2'],
  ]),
})

const genericXml = `<?xml version="1.0" encoding="UTF-8"?><Invoice><InvoiceNo>25512345000000000091</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate><Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller><Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer><Items><Item><Description>技术服务费</Description><Quantity>2</Quantity><UnitPrice>500.00</UnitPrice><Amount>1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>60.00</TaxAmount></Item></Items><Amount>1000.00</Amount><TaxAmount>60.00</TaxAmount><TotalAmount>1060.00</TotalAmount></Invoice>`

const samples = [
  { name: 'old-ofd', buffer: zip({ 'OFD.xml': '<OFD/>', 'Doc_0/Attachs/original_invoice.xml': oldXml }) },
  { name: 'digital-ofd', buffer: digital },
  { name: 'generic-xml', buffer: Buffer.from(genericXml) },
]

const parsedSamples = []
const durations = []
for (const sample of samples) {
  const started = performance.now()
  const parsed = ofdZipXmlParser.parse({ buffer: sample.buffer, fileName: `${sample.name}.ofd` })
  durations.push(performance.now() - started)
  const eight = [parsed.invoice_no, parsed.issue_date, parsed.buyer.name, parsed.buyer.tax_id, parsed.seller.name, parsed.seller.tax_id, parsed.total_cents, parsed.tax_cents]
  if (eight.some((value) => value === '' || value === undefined || value === null)) throw new Error(`missing field in ${sample.name}`)
  parsedSamples.push({ name: sample.name, sha256: sha256(sample.buffer), kind: parsed.document_kind, fields: 8 })
}

let negativeHandled = 0
for (const bad of [Buffer.alloc(0), zip({ 'not-ofd.txt': 'nope' })]) {
  try {
    ofdZipXmlParser.parse({ buffer: bad, fileName: 'negative' })
  } catch (error) {
    if (error instanceof InvoiceError) negativeHandled += 1
  }
}

const p95 = durations.sort((a, b) => a - b)[Math.max(0, Math.ceil(durations.length * 0.95) - 1)]
const metrics = [
  { req_id: 'SKU-04-A01', metric: '八字段完整率（S1 合成样本）', threshold: '>=0.98', actual: 1, pass: true, counted: false },
  { req_id: 'SKU-04-A02', metric: '扫描/OCR（未实现）', threshold: 'not_run', actual: 'not_run', pass: false, skipped: true, counted: false },
  { req_id: 'SKU-04-A06', metric: '单票解析 P95（S1）', threshold: '<20s', actual: p95 / 1000, pass: p95 < 20000, counted: false },
  { req_id: 'SKU-04-A07', metric: '负样本处理率 + 字段证据覆盖（S1）', threshold: '100%', actual: negativeHandled === 2 ? 1 : 0, pass: negativeHandled === 2, counted: false },
]

// S2: a synthetic invoice -> ingest -> parse -> receipt; hash + idempotency + lifecycle.
class FakeTable {
  map = new Map()
  get(key) { return this.map.get(key) }
  entries() { return this.map.entries() }
  keys() { return this.map.keys() }
  get size() { return this.map.size }
  async put(key, value) { this.map.set(key, value) }
  async delete(key) { return this.map.delete(key) }
  async update(key, fn) { const next = fn(this.map.get(key)); this.map.set(key, next); return next }
}

let receiptOk = false
const receiptDir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-accept-'))
try {
  const invoicePath = path.join(receiptDir, 'invoice.xml')
  const receiptPath = path.join(receiptDir, 'receipt.txt')
  await writeFile(invoicePath, genericXml)
  await writeFile(receiptPath, '平台结果码=100; 验真\n')
  const table = new FakeTable()
  const tools = createTools({ table, baseDir: path.join(receiptDir, 'store'), inputRoots: [receiptDir] })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const exec = { callId: 'acceptance-s2', agent: { id: 'acceptance' } }
  const ing = await byName['invoice.ingest'].execute({ source: { kind: 'file', path: invoicePath }, entity_id: 'ENT-A' }, exec)
  await byName['invoice.parse'].execute({ doc_id: ing.doc_id }, exec)
  const receipt = await byName['invoice.receipt'].execute({
    invoice_id: ing.doc_id, receipt_file: receiptPath, result_code: '100', result: 'pass',
    verified_at: '2026-08-02T10:00:00+08:00', operator: 'acceptance',
  }, exec)
  const duplicate = await byName['invoice.receipt'].execute({
    invoice_id: ing.doc_id, receipt_file: receiptPath, result_code: '100', result: 'pass',
    verified_at: '2026-08-02T10:00:00+08:00', operator: 'acceptance',
  }, exec)
  receiptOk = receipt.duplicate === false && receipt.lifecycle === 'verified' && /^[0-9a-f]{64}$/.test(receipt.receipt_sha256) && duplicate.duplicate === true
} catch {
  receiptOk = false
} finally {
  await rm(receiptDir, { recursive: true, force: true })
}
metrics.push({ req_id: 'SKU-04-A05', metric: '回执完整率（S2 单票）', threshold: '100%', actual: receiptOk ? 1 : 0, pass: receiptOk, counted: false })

let redlinkOk = false
let restoreOk = false
const s3Dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-accept-s3-'))
try {
  const bluePath = path.join(s3Dir, 'blue.xml')
  const redPath = path.join(s3Dir, 'red.xml')
  const redXml = `<?xml version="1.0" encoding="UTF-8"?><Invoice><InvoiceNo>25512345000000000092</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate><Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller><Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer><Items><Item><Description>红字技术服务费</Description><Quantity>1</Quantity><UnitPrice>-1000.00</UnitPrice><Amount>-1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>-60.00</TaxAmount></Item></Items><Amount>-1000.00</Amount><TaxAmount>-60.00</TaxAmount><TotalAmount>-1060.00</TotalAmount></Invoice>`
  await writeFile(bluePath, genericXml)
  await writeFile(redPath, redXml)
  const table = new FakeTable()
  const tools = createTools({ table, baseDir: path.join(s3Dir, 'store'), inputRoots: [s3Dir] })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const exec = { callId: 'acceptance-s3', agent: { id: 'acceptance' } }
  const blue = await byName['invoice.ingest'].execute({ source: { kind: 'file', path: bluePath }, entity_id: 'ENT-A' }, exec)
  const red = await byName['invoice.ingest'].execute({ source: { kind: 'file', path: redPath }, entity_id: 'ENT-A' }, exec)
  await byName['invoice.parse'].execute({ doc_id: blue.doc_id }, exec)
  await byName['invoice.parse'].execute({ doc_id: red.doc_id }, exec)
  const linked = await byName['invoice.redlink'].execute({ red_id: red.doc_id }, exec)
  redlinkOk = linked.blue_id === blue.doc_id && linked.amount_delta_cents === 0
  const pkg = await byName['invoice.archive'].execute({ entity_id: 'ENT-A', period: '2026-08' }, exec)
  const checked = await byName['invoice.check'].execute({ pkg_id: pkg.pkg_id }, exec)
  const restored = await byName['invoice.restore'].execute({ pkg_id: pkg.pkg_id }, exec)
  restoreOk = checked.signable && pkg.check_state === 'ok' && restored.restored >= 2 && restored.mismatches.length === 0
} catch {
  redlinkOk = false
  restoreOk = false
} finally {
  await rm(s3Dir, { recursive: true, force: true })
}
metrics.push({ req_id: 'SKU-04-A03', metric: '红蓝勾稽（S3 单对）', threshold: '100%', actual: redlinkOk ? 1 : 0, pass: redlinkOk, counted: false })
metrics.push({ req_id: 'SKU-04-A04', metric: '归档复原（S3 单包）', threshold: '100%', actual: restoreOk ? 1 : 0, pass: restoreOk, counted: false })

const result = {
  run_id: runId,
  timestamp: new Date().toISOString(),
  scope: 'SKU-04-S1/S2/S3',
  status: 'partial',
  counted: false,
  note: 'public/synthetic only; S2 dedup/verify/receipt + S3 redlink/archive/check/restore; customer evidence gate remains PARK',
  samples: parsedSamples,
  metrics,
  pass: metrics.every((metric) => metric.pass || metric.skipped),
}
const resultText = `${JSON.stringify(result, null, 2)}\n`
writeFileSync(path.join(evidenceDir, 'result.json'), resultText)
const evidenceSha = sha256(resultText)
const csv = [
  'req_id,metric,threshold,actual,script,evidence_sha256,pass,source,counted',
  ...metrics.map((metric) => `${metric.req_id},${metric.metric},${metric.threshold},${metric.actual},scripts/acceptance.mjs,${evidenceSha},${metric.pass},public/synthetic,${metric.counted}`),
].join('\n') + '\n'
writeFileSync(path.join(root, 'ACCEPTANCE.csv'), csv)
if (!result.pass) {
  console.error(JSON.stringify(result, null, 2))
  process.exit(1)
}
console.log(`acceptance ok: ${runId}; evidence=${path.join('evidence', runId, 'result.json')}; sha=${evidenceSha.slice(0, 12)}`)
