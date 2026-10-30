/** Minimal repository lint for S1: layer direction + bundle manifest. */

import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const failures = []

function filesUnder(directory) {
  const base = path.join(root, directory)
  return readdirSync(base, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => path.join(entry.parentPath ?? base, entry.name))
}

for (const file of filesUnder('src/core')) {
  const text = readFileSync(file, 'utf8')
  if (/\bctx\./.test(text) || /@deepseek-ai\//.test(text) || /from ['"]dsh['"]/.test(text)) {
    failures.push(`${file}: core must not import ctx/DSH`)
  }
}
for (const file of filesUnder('src/adapters')) {
  const text = readFileSync(file, 'utf8')
  if (/ctx\.tools\.register/.test(text)) failures.push(`${file}: adapters must not register tools`)
}
for (const file of filesUnder('src/registry')) {
  const text = readFileSync(file, 'utf8')
  if (/ctx\.tools\.register/.test(text)) failures.push(`${file}: registry must not register tools`)
}

const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'))
if (pkg.name !== '@perrylink/dsh-einvoice') failures.push('package.json: unexpected name')
if (pkg.version !== '0.1.0-alpha.1') failures.push('package.json: version must be 0.1.0-alpha.0')
if (!pkg.dsh?.bundle?.patch) failures.push('package.json: missing dsh.bundle.patch')
if (!pkg.engines?.dsh) failures.push('package.json: missing engines.dsh')
if (pkg.dsh?.client) failures.push('package.json: S1 must not declare a Client')
for (const forbidden of ['.env', '.pem', 'fixtures/input']) {
  if (JSON.stringify(pkg.files ?? []).includes(forbidden)) failures.push(`package.json: files includes ${forbidden}`)
}
const patch = readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8')
if (!patch.includes("name: '@perrylink/dsh-einvoice'")) failures.push('cordis.patch.yml: bare package name missing')

if (failures.length > 0) {
  console.error('lint failed:')
  for (const failure of failures) console.error(` - ${failure}`)
  process.exit(1)
}
console.log('lint ok: core/adapters/registry direction + bundle manifest')
