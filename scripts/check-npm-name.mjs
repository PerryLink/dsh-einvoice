/** Fail closed unless @perrylink/dsh-einvoice is still unpublished on npm. */

const REGISTRY = 'https://registry.npmjs.org/'
const NAME = '@perrylink/dsh-einvoice'

const response = await fetch(`${REGISTRY}${NAME.replace('/', '%2f')}`, {
  headers: { 'user-agent': 'dsh-einvoice-prepublish' },
  signal: AbortSignal.timeout(15000),
})
if (response.status === 404) {
  console.log(`npm name free: ${NAME}`)
  process.exit(0)
}
console.error(`npm name check failed: ${NAME} returned HTTP ${response.status} (expected 404)`)
process.exit(1)
