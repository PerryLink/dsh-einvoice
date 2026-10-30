/** Fail closed unless this exact version is still unpublished on npm. */
import { readFileSync } from 'node:fs'

const REGISTRY = 'https://registry.npmjs.org/'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const name = pkg.name
const version = pkg.version

const response = await fetch(`${REGISTRY}${name.replace('/', '%2f')}`, {
  headers: { 'user-agent': 'dsh-einvoice-prepublish', 'cache-control': 'no-cache' },
  signal: AbortSignal.timeout(15000),
})
if (response.status === 404) {
  console.log(`npm version free: ${name}@${version}`)
  process.exit(0)
}
if (response.status === 200) {
  const metadata = await response.json()
  if (!metadata.versions?.[version]) {
    console.log(`npm version free: ${name}@${version} (package exists)`)
    process.exit(0)
  }
  console.error(`npm version already published: ${name}@${version}`)
  process.exit(1)
}
console.error(`npm name check failed: ${name} returned HTTP ${response.status}`)
process.exit(1)
