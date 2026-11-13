import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { strToU8, zipSync } from 'fflate'
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

function xml(invoiceNo) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice><InvoiceNo>${invoiceNo}</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate>
<Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller>
<Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer>
<Items><Item><Description>技术服务费</Description><Quantity>1</Quantity><UnitPrice>1000.00</UnitPrice><Amount>1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>60.00</TaxAmount></Item></Items>
<Amount>1000.00</Amount><TaxAmount>60.00</TaxAmount><TotalAmount>1060.00</TotalAmount></Invoice>`
}

function makeTools(baseDir, inputRoots = [baseDir]) {
  const table = new FakeTable()
  const tools = createTools({ table, baseDir, inputRoots })
  return {
    table,
    byName: Object.fromEntries(tools.map((tool) => [tool.name, tool])),
    exec: { callId: 'security-call', agent: { id: 'security-tester' } },
  }
}

function manifest(pkgId, members = []) {
  return {
    schema_version: 1,
    pkg_id: pkgId,
    entity_id: 'ALL',
    period: 'ALL',
    template_id: 'test-v1',
    created_at: '2026-08-02T00:00:00.000Z',
    created_by: 'security-test',
    members,
  }
}

async function writeArchive(baseDir, pkgId, archiveManifest, files = {}) {
  const archiveDir = path.join(baseDir, 'archives')
  await mkdir(archiveDir, { recursive: true })
  const entries = { 'manifest.json': strToU8(JSON.stringify(archiveManifest)) }
  for (const [name, bytes] of Object.entries(files)) entries[name] = bytes
  await writeFile(path.join(archiveDir, `${pkgId}.zip`), Buffer.from(zipSync(entries)))
}

test('restore accepts a well-formed pkg_id and stays under the restore root', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-restore-ok-'))
  try {
    const file = path.join(dir, 'a.xml')
    await writeFile(file, xml('25512345000000000091'))
    const baseDir = path.join(dir, 'store')
    const { byName, exec } = makeTools(baseDir, [dir])
    const ingested = await byName['invoice_ingest'].execute({ source: { kind: 'file', path: file }, entity_id: 'ENT-A' }, exec)
    await byName['invoice_parse'].execute({ doc_id: ingested.doc_id }, exec)
    const pkg = await byName['invoice_archive'].execute({ entity_id: 'ENT-A' }, exec)

    const restored = await byName['invoice_restore'].execute({ pkg_id: pkg.pkg_id }, exec)
    assert.equal(restored.pkg_id, pkg.pkg_id)
    assert.match(restored.pkg_id, /^pkg_[0-9a-f]{16}$/)
    assert.ok(restored.restored >= 1)
    const root = path.resolve(path.join(baseDir, 'restore'))
    assert.ok(path.resolve(restored.restore_dir).startsWith(root + path.sep))
    assert.match(await readFile(path.join(restored.restore_dir, 'members', ingested.doc_id, 'a.xml'), 'utf8'), /25512345000000000091/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('restore rejects a manifest pkg_id that tries to escape the restore root', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-restore-evil-'))
  try {
    const baseDir = path.join(dir, 'store')
    // The outer file name is a valid pkg_id, so resolveArchiveFile finds it; the
    // manifest inside is attacker-controlled and claims a traversal pkg_id.
    await writeArchive(baseDir, 'pkg_0123456789abcdef', manifest('../../evil'))
    const { byName, exec } = makeTools(baseDir)
    await assert.rejects(
      () => byName['invoice_restore'].execute({ pkg_id: 'pkg_0123456789abcdef' }, exec),
      (error) => error?.code === 'E_INV_PKG_ID_INVALID',
    )
    await assert.rejects(() => access(path.join(dir, 'evil')), /ENOENT/)
    await assert.rejects(() => access(path.join(baseDir, 'restore')), /ENOENT/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('restore refuses a package that is not signable', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-restore-signable-'))
  try {
    const baseDir = path.join(dir, 'store')
    await writeArchive(
      baseDir,
      'pkg_0123456789abcdef',
      manifest('pkg_0123456789abcdef', [{
        doc_id: 'doc-1',
        invoice_no: '',
        lifecycle: 'parsed',
        source_sha256: '',
        files: [{ path: 'members/doc-1/a.xml', sha256: '0'.repeat(64), size: 3 }],
      }]),
      { 'members/doc-1/a.xml': strToU8('abc') },
    )
    const { byName, exec } = makeTools(baseDir)
    await assert.rejects(
      () => byName['invoice_restore'].execute({ pkg_id: 'pkg_0123456789abcdef' }, exec),
      (error) => error?.code === 'E_INV_NOT_SIGNABLE',
    )
    await assert.rejects(() => access(path.join(baseDir, 'restore')), /ENOENT/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('dedup does not fabricate a seller_date_total:::0 group from unparsed records', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'dsh-einvoice-dedup-unparsed-'))
  try {
    await writeFile(path.join(dir, 'a.xml'), xml('25512345000000000091'))
    await writeFile(path.join(dir, 'b.xml'), xml('25512345000000000092'))
    const { byName, exec } = makeTools(path.join(dir, 'store'), [dir])
    await byName['invoice_ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'a.xml') }, entity_id: 'ENT-A' }, exec)
    await byName['invoice_ingest'].execute({ source: { kind: 'file', path: path.join(dir, 'b.xml') }, entity_id: 'ENT-A' }, exec)

    const dedup = await byName['invoice_dedup'].execute({}, exec)
    assert.equal(dedup.total, 0)
    assert.deepEqual(dedup.groups, [])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
