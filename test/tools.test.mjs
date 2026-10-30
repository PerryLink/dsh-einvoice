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

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice>
  <InvoiceNo>25512345000000000091</InvoiceNo>
  <InvoiceIssueDate>2026-08-01</InvoiceIssueDate>
  <Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller>
  <Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer>
  <Items><Item><Description>技术服务费</Description><Quantity>2</Quantity><UnitPrice>500.00</UnitPrice><Amount>1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>60.00</TaxAmount></Item></Items>
  <Amount>1000.00</Amount><TaxAmount>60.00</TaxAmount><TotalAmount>1060.00</TotalAmount>
</Invoice>`

test('ingest -> parse -> query end to end', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-test-'))
  try {
    const file = path.join(dir, 'invoice.xml')
    await writeFile(file, xml)
    const table = new FakeTable()
    const tools = createTools({ table, baseDir: path.join(dir, 'store'), inputRoots: [dir] })
    const ingest = tools.find((tool) => tool.name === 'invoice.ingest')
    const parse = tools.find((tool) => tool.name === 'invoice.parse')
    const query = tools.find((tool) => tool.name === 'invoice.query')
    const exec = { callId: 'call-1', agent: { id: 'agent-1' } }

    const first = await ingest.execute({ source: { kind: 'file', path: file }, entity_id: 'ENT-A' }, exec)
    assert.equal(first.existing, false)
    assert.match(first.sha256, /^[0-9a-f]{64}$/)
    const second = await ingest.execute({ source: { kind: 'file', path: file }, entity_id: 'ENT-A' }, exec)
    assert.equal(second.existing, true)
    assert.equal(second.doc_id, first.doc_id)

    const parsed = await parse.execute({ doc_id: first.doc_id }, exec)
    assert.equal(parsed.invoice_no, '25512345000000000091')
    assert.equal(parsed.total_cents, 106000)
    assert.equal(parsed.buyer.tax_id, '91310115MA1K2L3M4N')

    const pool = await query.execute({ filter: { entity_id: 'ENT-A' } }, exec)
    assert.equal(pool.total, 1)
    assert.equal(pool.rows.length, 1)
    assert.equal(pool.rows[0].doc_id, first.doc_id)
    assert.equal(pool.rows[0].lifecycle, 'parsed')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('rejects paths outside configured roots and unknown docs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-test-'))
  try {
    const tools = createTools({ table: new FakeTable(), baseDir: path.join(dir, 'store'), inputRoots: [dir] })
    const ingest = tools.find((tool) => tool.name === 'invoice.ingest')
    const parse = tools.find((tool) => tool.name === 'invoice.parse')
    const exec = { callId: 'call-2' }
    await assert.rejects(() => ingest.execute({ source: { kind: 'file', path: '/etc/hosts' } }, exec), /E_INV_PATH_NOT_ALLOWED/)
    await assert.rejects(() => parse.execute({ doc_id: 'missing' }, exec), /E_INV_DOC_NOT_FOUND/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
