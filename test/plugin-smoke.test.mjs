import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import * as plugin from '../lib/plugin/index.js'

const kv = () => {
  const m = new Map()
  return {
    get: (k) => m.get(k),
    entries: () => m.entries(),
    get size() {
      return m.size
    },
    put: async (k, v) => {
      m.set(k, v)
    },
    delete: async (k) => m.delete(k),
    values: () => [...m.values()],
  }
}

const fakeHost = () => {
  const tools = []
  const ctx = new Context()
  ctx.provide('tools', {
    register(tool) {
      tools.push(tool)
    },
  })
  ctx.provide('storageDomain', {
    async open() {
      return { table: () => kv(), close() {} }
    },
  })
  return { ctx, tools }
}

test('apply() registers the tools against a minimal host', async () => {
  process.env.DSH_EINVOICE_HOME = mkdtempSync(join(tmpdir(), 'dsh-fin-invoice-core-smoke-'))
  process.env.DSH_EINVOICE_INPUT_ROOTS = process.env.DSH_EINVOICE_HOME
  const { ctx, tools } = fakeHost()
  await ctx.plugin(plugin)

  const names = tools.map((tool) => tool.name)
  console.log(`[${plugin.name}] registered ${tools.length}: ${names.join(', ')}`)

  assert.equal(plugin.name, 'dsh-einvoice')
  assert.deepEqual(plugin.inject, ["tools","storageDomain"])
  assert.equal(tools.length, 14)
  for (const tool of tools) {
    assert.equal(typeof tool.name, 'string')
    assert.ok(tool.name.length > 0)
    assert.equal(typeof tool.description, 'string')
    assert.ok(tool.description.length > 0)
    assert.equal(typeof tool.execute, 'function')
    assert.ok(tool.name.startsWith('invoice_'), `unexpected prefix: ${tool.name}`)
  }
  for (const name of names) assert.ok(name.startsWith('invoice_'), `unexpected prefix: ${name}`)
  assert.equal(new Set(names).size, names.length)
})
