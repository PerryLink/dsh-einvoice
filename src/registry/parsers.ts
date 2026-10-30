/** Frozen parser registry: exactly one S1 adapter. */

import { ofdZipXmlParser, type ParserAdapter } from '../adapters/ofd-zip-xml.js'
import { InvoiceError } from '../core/invoice.js'

const registry = new Map<string, ParserAdapter>()
for (const parser of [ofdZipXmlParser]) {
  if (registry.has(parser.id)) throw new Error(`duplicate parser id: ${parser.id}`)
  registry.set(parser.id, parser)
}
Object.freeze([...registry.keys()])

export const DEFAULT_PARSER_ID = ofdZipXmlParser.id

export function getParser(id: string = DEFAULT_PARSER_ID): ParserAdapter {
  const parser = registry.get(id)
  if (!parser) throw new InvoiceError('E_INV_UNKNOWN_IMPL', `unknown parser implementation: ${id}`)
  return parser
}

export function listParsers(): readonly string[] {
  return [...registry.keys()]
}
