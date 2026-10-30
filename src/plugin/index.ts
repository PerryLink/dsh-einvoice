/** DSH Host entry for SKU-04 S1. */

import path from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { createTools } from './tools.js'
import { openInvoiceTable } from './storage.js'

export const name = 'dsh-einvoice'
export const inject = ['tools', 'storageDomain']

export async function apply(ctx: Context): Promise<void> {
  const baseDir =
    process.env.DSH_EINVOICE_HOME ??
    path.join(process.env.DSH_HOME ?? process.cwd(), 'storages', 'dsh-einvoice')
  const roots = (process.env.DSH_EINVOICE_INPUT_ROOTS ?? process.cwd())
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean)
  const table = await openInvoiceTable(ctx)
  for (const tool of createTools({ table, baseDir, inputRoots: roots })) {
    ctx.tools.register(tool)
  }
}
