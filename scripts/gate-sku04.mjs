/** Gate for the S1 slice: run acceptance and require every emitted row to pass. */

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

try {
  execFileSync(process.execPath, ['scripts/acceptance.mjs'], { stdio: 'inherit' })
} catch {
  process.exit(1)
}
const csv = readFileSync('ACCEPTANCE.csv', 'utf8').trim().split('\n')
const rows = csv.slice(1).map((line) => line.split(','))
if (rows.length === 0) {
  console.error('gate: no acceptance rows')
  process.exit(2)
}
for (const row of rows) {
  const [reqId, metric, threshold, actual, script, sha, pass] = row
  if (!reqId || !metric || !threshold || !actual || !script || !sha || pass !== 'true') {
    console.error(`gate: incomplete or failing row: ${row.join(',')}`)
    process.exit(1)
  }
}
console.log(`gate ok: ${rows.length} rows (S1/S2/S3 public/synthetic, not counted toward GA)`)
