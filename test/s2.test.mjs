import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createTools } from '../lib/plugin/tools.js'

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

function xml(invoiceNo, buyerName = '测试买方有限公司') {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice><InvoiceNo>${invoiceNo}</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate>
<Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller>
<Buyer><Name>${buyerName}</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer>
<Items><Item><Description>技术服务费</Description><Quantity>2</Quantity><UnitPrice>500.00</UnitPrice><Amount>1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>60.00</TaxAmount></Item></Items>
<Amount>1000.00</Amount><TaxAmount>60.00</TaxAmount><TotalAmount>1060.00</TotalAmount></Invoice>`
}

async function setup(dir) {
  const table = new FakeTable()
  const tools = createTools({ table, baseDir: path.join(dir, 'store'), inputRoots: [dir] })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const exec = { callId: 's2-call', agent: { id: 'agent-s2' } }
  const ingestA = await byName['invoice_ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'a.xml') }, entity_id: 'ENT-A' }, exec)
  const ingestB = await byName['invoice_ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'b.xml') }, entity_id: 'ENT-B' }, exec)
  await byName['invoice_parse'].execute({ doc_id: ingestA.doc_id }, exec)
  await byName['invoice_parse'].execute({ doc_id: ingestB.doc_id }, exec)
  return { table, byName, exec, docA: ingestA.doc_id, docB: ingestB.doc_id }
}

test('dedup groups by seller+date+total and verify flags entity mismatch', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-s2-'))
  try {
    await writeFile(path.join(dir, 'a.xml'), xml('25512345000000000091'))
    await writeFile(path.join(dir, 'b.xml'), xml('25512345000000000091', '测试买方乙有限公司'))
    const { table, byName, exec } = await setup(dir)

    const groups = await byName['invoice_dedup'].execute({}, exec)
    assert.equal(groups.total, 1)
    assert.equal(groups.groups[0].kind, 'invoice_no')
    assert.equal(groups.groups[0].members.length, 2)

    const good = await byName['invoice_verify'].execute({ entity_tax_id: '91310115MA1K2L3M4N' }, exec)
    assert.equal(good.total, 2)
    assert.ok(good.queue.every((item) => item.entity_match === true))

    const bad = await byName['invoice_verify'].execute({ entity_tax_id: '000000000000000000' }, exec)
    assert.ok(bad.queue.every((item) => item.entity_match === false))
    assert.ok(bad.queue.every((item) => item.needs_review.includes('entity_mismatch')))
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('receipt records a hash, is idempotent by receipt bytes, and moves lifecycle', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-s2-'))
  try {
    await writeFile(path.join(dir, 'a.xml'), xml('25512345000000000091'))
    await writeFile(path.join(dir, 'b.xml'), xml('25512345000000000091', '测试买方乙有限公司'))
    const receiptFile = path.join(dir, 'receipt.txt')
    await writeFile(receiptFile, '平台结果码=100; 验真\n')
    const { table, byName, exec, docA, docB } = await setup(dir)

    const first = await byName['invoice_receipt'].execute({
      invoice_id: docA,
      receipt_file: receiptFile,
      result_code: '100',
      result: 'pass',
      verified_at: '2026-08-02T10:00:00+08:00',
      operator: 'tester',
    }, exec)
    assert.equal(first.duplicate, false)
    assert.equal(first.lifecycle, 'verified')
    assert.match(first.receipt_sha256, /^[0-9a-f]{64}$/)
    assert.equal(table.get(docA).lifecycle, 'verified')

    const duplicate = await byName['invoice_receipt'].execute({
      invoice_id: docA,
      receipt_file: receiptFile,
      result_code: '100',
      result: 'pass',
      verified_at: '2026-08-02T10:00:00+08:00',
      operator: 'tester',
    }, exec)
    assert.equal(duplicate.duplicate, true)
    assert.equal(duplicate.receipt_id, first.receipt_id)

    const failFile = path.join(dir, 'fail.txt')
    await writeFile(failFile, '平台结果码=999; 验伪\n')
    const failed = await byName['invoice_receipt'].execute({
      invoice_id: docB,
      receipt_file: failFile,
      result_code: '999',
      result: 'fail',
      verified_at: '2026-08-02T10:01:00+08:00',
      operator: 'tester',
    }, exec)
    assert.equal(failed.lifecycle, 'quarantined')
    assert.equal(table.get(docB).lifecycle, 'quarantined')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
