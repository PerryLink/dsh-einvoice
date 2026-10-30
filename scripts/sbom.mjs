/** Generate a CycloneDX 1.6 SBOM from the pnpm production tree. */
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const tree = JSON.parse(execFileSync('pnpm', ['list', '--prod', '--json', '--depth=Infinity'], { encoding: 'utf8' }))
const root = tree[0]
const components = new Map()

function licenseOf(pkgPath) {
  const manifest = JSON.parse(readFileSync(`${pkgPath}/package.json`, 'utf8'))
  const raw = manifest.license
  if (typeof raw === 'string') return raw
  if (raw && typeof raw === 'object' && typeof raw.type === 'string') return raw.type
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0]
  return 'UNKNOWN'
}

function walk(dependencies) {
  for (const [name, entry] of Object.entries(dependencies ?? {})) {
    if (!entry || typeof entry !== 'object') continue
    const { version, path: pkgPath, dependencies: children } = entry
    if (name && version && pkgPath && !components.has(`${name}@${version}`)) {
      components.set(`${name}@${version}`, {
        type: 'library',
        name,
        version,
        purl: `pkg:npm/${name.replace('@', '%40')}@${version}`,
        licenses: [{ license: { id: licenseOf(pkgPath) } }],
      })
    }
    walk(children)
  }
}
walk(root.dependencies)
for (const component of components.values()) {
  if (component.licenses[0].license.id === 'UNKNOWN') throw new Error(`unknown license: ${component.name}@${component.version}`)
}
const sbom = {
  bomFormat: 'CycloneDX',
  specVersion: '1.6',
  serialNumber: `urn:uuid:${randomUUID()}`,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: { type: 'application', name: root.name, version: root.version },
  },
  components: [...components.values()].sort((a, b) => a.name.localeCompare(b.name)),
}
writeFileSync('sbom.cdx.json', `${JSON.stringify(sbom, null, 2)}\n`)
console.log(`sbom ok: ${sbom.components.length} production components`)
