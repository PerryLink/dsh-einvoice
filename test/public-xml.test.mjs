import test from 'node:test'
import assert from 'node:assert/strict'
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

test('public MIT invoice XML ingest/parse', async () => {
  const table = new FakeTable()
  const tools = createTools({ table, baseDir: '/tmp/einvoice-public', inputRoots: [process.cwd()] })
  const by = Object.fromEntries(tools.map((tool) => [tool.name, tool]))
  const exec = { callId: 'public-xml', agent: { id: 'tester' } }
  const ingested = await by['invoice.ingest'].execute({ source: { kind: 'file', path: 'fixtures/public/mit/invoice-github-sample.xml' }, entity_id: 'ENT-PUBLIC' }, exec)
  assert.ok(ingested.doc_id)
  const parsed = await by['invoice.parse'].execute({ doc_id: ingested.doc_id }, exec)
  assert.equal(parsed.invoice_no, '25512345000000000091')
  assert.ok(parsed.total_cents > 0)
})
