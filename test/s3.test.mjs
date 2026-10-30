import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
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

function xml(invoiceNo, amount, tax, total) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice><InvoiceNo>${invoiceNo}</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate>
<Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller>
<Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer>
<Items><Item><Description>技术服务费</Description><Quantity>1</Quantity><UnitPrice>${amount}</UnitPrice><Amount>${amount}</Amount><TaxRate>6</TaxRate><TaxAmount>${tax}</TaxAmount></Item></Items>
<Amount>${amount}</Amount><TaxAmount>${tax}</TaxAmount><TotalAmount>${total}</TotalAmount></Invoice>`
}

async function setup(dir) {
  const table = new FakeTable()
  const tools = createTools({ table, baseDir: path.join(dir, 'store'), inputRoots: [dir] })
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const exec = { callId: 's3-call', agent: { id: 'agent-s3' } }
  const blueIngest = await byName['invoice.ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'blue.xml') }, entity_id: 'ENT-A' }, exec)
  const redIngest = await byName['invoice.ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'red.xml') }, entity_id: 'ENT-A' }, exec)
  await byName['invoice.parse'].execute({ doc_id: blueIngest.doc_id }, exec)
  await byName['invoice.parse'].execute({ doc_id: redIngest.doc_id }, exec)
  return { table, byName, exec, blueId: blueIngest.doc_id, redId: redIngest.doc_id }
}

test('redlink binds a negative red invoice and archive/check/restore round-trip', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-s3-'))
  try {
    await writeFile(path.join(dir, 'blue.xml'), xml('25512345000000000091', '1000.00', '60.00', '1060.00'))
    await writeFile(path.join(dir, 'red.xml'), xml('25512345000000000092', '-1000.00', '-60.00', '-1060.00'))
    const receiptFile = path.join(dir, 'receipt.txt')
    await writeFile(receiptFile, '平台结果码=100; 验真\n')
    const { byName, exec, blueId, redId } = await setup(dir)

    const linked = await byName['invoice.redlink'].execute({ red_id: redId }, exec)
    assert.equal(linked.blue_id, blueId)
    assert.equal(linked.amount_delta_cents, 0)
    assert.equal(linked.tax_delta_cents, 0)

    await byName['invoice.receipt'].execute({
      invoice_id: blueId, receipt_file: receiptFile, result_code: '100', result: 'pass',
      verified_at: '2026-08-02T10:00:00+08:00', operator: 'tester',
    }, exec)

    const pkg = await byName['invoice.archive'].execute({ entity_id: 'ENT-A', period: '2026-08' }, exec)
    assert.match(pkg.pkg_id, /^pkg_[0-9a-f]{16}$/)
    assert.equal(pkg.check_state, 'ok')
    assert.ok(pkg.file_count >= 4)

    const check = await byName['invoice.check'].execute({ pkg_id: pkg.pkg_id }, exec)
    assert.equal(check.signable, true)
    assert.deepEqual(check.missing, [])
    assert.deepEqual(check.hash_mismatch, [])
    assert.deepEqual(check.dir_violation, [])

    const restored = await byName['invoice.restore'].execute({ pkg_id: pkg.pkg_id }, exec)
    assert.equal(restored.pkg_id, pkg.pkg_id)
    assert.ok(restored.restored >= 3)
    assert.deepEqual(restored.mismatches, [])
    const restoredBlue = await readFile(path.join(restored.restore_dir, 'members', blueId, 'blue.xml'), 'utf8')
    assert.match(restoredBlue, /25512345000000000091/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('redlink and archive fail closed on invalid inputs', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-s3-'))
  try {
    await writeFile(path.join(dir, 'blue.xml'), xml('25512345000000000091', '1000.00', '60.00', '1060.00'))
    await writeFile(path.join(dir, 'red.xml'), xml('25512345000000000092', '-2000.00', '-120.00', '-2120.00'))
    const { byName, exec, redId } = await setup(dir)
    await assert.rejects(() => byName['invoice.redlink'].execute({ red_id: redId }, exec), /E_INV_REDLINK_UNBOUND/)
    await assert.rejects(() => byName['invoice.archive'].execute({ entity_id: 'NO-SUCH' }, exec), /E_INV_ARCHIVE_EMPTY/)
    await assert.rejects(() => byName['invoice.check'].execute({ pkg_id: 'pkg_0000000000000000' }, exec), /E_INV_ARCHIVE_NOT_FOUND/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
