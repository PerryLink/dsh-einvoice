/** Assert the npm tarball contains no input fixtures, evidence, source or secrets. */
import { readFileSync } from 'node:fs'
const pack = JSON.parse(readFileSync('pack.json', 'utf8'))
const files = pack[0]?.files?.map((file) => file.path) ?? []
if (files.length === 0) throw new Error('pack.json has no files')
const required = ['package.json', 'cordis.patch.yml', 'README.md', 'LICENSE', 'NOTICE', 'lib/plugin/index.js']
for (const file of required) if (!files.includes(file)) throw new Error(`missing required tarball file: ${file}`)
const forbidden = [/^src\//, /^test\//, /^scripts\//, /^fixtures\//, /^evidence\//, /\.env/, /\.pem$/, /node_modules\//, /\.tgz$/]
for (const file of files) for (const pattern of forbidden) if (pattern.test(file)) throw new Error(`forbidden tarball file: ${file}`)
console.log(`pack ok: ${files.length} files, no fixtures/evidence/source/secrets`)
