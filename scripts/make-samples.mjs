/**
 * Build the PS1 quickstart samples for dsh-einvoice.
 *
 * Both files are synthetic and describe the same (invented) invoice, so the demo can show
 * dedup. Nothing here comes from a real invoice, a tax bureau, or a customer export:
 *   - invoice number 25512345000000000091 is invented
 *   - tax ids 91330106TESTBUYER0 / 91310115TESTSELLER are obviously fake (letters "TEST")
 *   - parties are 「示例买方（合成）有限公司」/「示例卖方（合成）有限公司」
 *
 *   invoice-a.xml      standalone invoice XML  -> generic XML parser path
 *   invoice-a-copy.ofd  minimal OFD container  -> 数电票 CustomTag/ObjectRef parser path
 *
 * The OFD is zipped here with fflate: OFD.xml + Doc_0/Tags/CustomTag.xml +
 * Doc_0/Pages/Page_0/Content.xml (no layout/rendering parts, and no claim to be a
 * renderable OFD — only the invoice-tag path is exercised).
 *
 *   node scripts/make-samples.mjs
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { strToU8, zipSync } from 'fflate'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

const INVOICE_NO = '25512345000000000091'
const ISSUE_DATE = '2026-08-01'
const BUYER = { name: '示例买方（合成）有限公司', tax: '91330106TESTBUYER0' }
const SELLER = { name: '示例卖方（合成）有限公司', tax: '91310115TESTSELLER' }

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Synthetic sample for the dsh-einvoice quickstart. Invented invoice number and
     obviously fake tax ids (TEST...); not a real invoice and not tax-authority data. -->
<Invoice>
  <InvoiceNo>${INVOICE_NO}</InvoiceNo>
  <InvoiceIssueDate>${ISSUE_DATE}</InvoiceIssueDate>
  <InvoiceTypeName>电子发票（普通发票）</InvoiceTypeName>
  <Buyer>
    <Name>${BUYER.name}</Name>
    <TaxID>${BUYER.tax}</TaxID>
  </Buyer>
  <Seller>
    <Name>${SELLER.name}</Name>
    <TaxID>${SELLER.tax}</TaxID>
  </Seller>
  <Items>
    <Item>
      <Description>技术服务费（合成样例）</Description>
      <Quantity>2</Quantity>
      <UnitPrice>500.00</UnitPrice>
      <Amount>1000.00</Amount>
      <TaxRate>6%</TaxRate>
      <TaxAmount>60.00</TaxAmount>
    </Item>
  </Items>
  <Amount>1000.00</Amount>
  <TaxAmount>60.00</TaxAmount>
  <TotalAmount>1060.00</TotalAmount>
</Invoice>
`

const ofdXml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Minimal OFD container for the quickstart sample: only the invoice-tag and page-content
     parts are present. Not a renderable OFD, and no real invoice data. -->
<ofd:OFD xmlns:ofd="http://www.ofdspec.org/2016" Version="1.0" DocType="OFD"/>
`

const customTag = `<?xml version="1.0" encoding="UTF-8"?>
<root>
  <InvoiceNo><ObjectRef PageRef="1">1</ObjectRef></InvoiceNo>
  <IssueDate><ObjectRef PageRef="1">2</ObjectRef></IssueDate>
  <Buyer><BuyerName><ObjectRef PageRef="1">3</ObjectRef></BuyerName><BuyerTaxID><ObjectRef PageRef="1">4</ObjectRef></BuyerTaxID></Buyer>
  <Seller><SellerName><ObjectRef PageRef="1">5</ObjectRef></SellerName><SellerTaxID><ObjectRef PageRef="1">6</ObjectRef></SellerTaxID></Seller>
  <TaxExclusiveTotalAmount><ObjectRef PageRef="1">7</ObjectRef></TaxExclusiveTotalAmount>
  <TaxTotalAmount><ObjectRef PageRef="1">8</ObjectRef></TaxTotalAmount>
  <TaxInclusiveTotalAmount><ObjectRef PageRef="1">9</ObjectRef><ObjectRef PageRef="1">10</ObjectRef></TaxInclusiveTotalAmount>
  <Item><ObjectRef PageRef="1">11</ObjectRef></Item>
  <TaxScheme><ObjectRef PageRef="1">12</ObjectRef></TaxScheme>
  <Amount><ObjectRef PageRef="1">13</ObjectRef></Amount>
  <TaxAmount><ObjectRef PageRef="1">14</ObjectRef></TaxAmount>
  <Price><ObjectRef PageRef="1">15</ObjectRef></Price>
  <Quantity><ObjectRef PageRef="1">16</ObjectRef></Quantity>
</root>
`

const pageValues = [
  ['1', INVOICE_NO],
  ['2', '2026年08月01日'],
  ['3', BUYER.name],
  ['4', BUYER.tax],
  ['5', SELLER.name],
  ['6', SELLER.tax],
  ['7', '1000.00'],
  ['8', '60.00'],
  ['9', '¥'],
  ['10', '1060.00'],
  ['11', '技术服务费（合成样例）'],
  ['12', '6%'],
  ['13', '1000.00'],
  ['14', '60.00'],
  ['15', '500.00'],
  ['16', '2'],
]

const textObjects = pageValues
  .map(([id, value]) => `      <ofd:TextObject ID="${id}"><ofd:TextCode>${value}</ofd:TextCode></ofd:TextObject>`)
  .join('\n')

const pageContent = `<?xml version="1.0" encoding="UTF-8"?>
<ofd:Page xmlns:ofd="http://www.ofdspec.org/2016">
  <ofd:Content>
    <ofd:Layer>
${textObjects}
    </ofd:Layer>
  </ofd:Content>
</ofd:Page>
`

const ofd = Buffer.from(zipSync({
  'OFD.xml': strToU8(ofdXml),
  'Doc_0/Tags/CustomTag.xml': strToU8(customTag),
  'Doc_0/Pages/Page_0/Content.xml': strToU8(pageContent),
}, { mtime: new Date('2026-11-02T00:00:00Z') }))

const outDir = path.join(root, 'samples', 'quickstart', 'input')
mkdirSync(outDir, { recursive: true })

const files = {
  'invoice-a.xml': Buffer.from(xml, 'utf8'),
  'invoice-a-copy.ofd': ofd,
}
for (const [name, buffer] of Object.entries(files)) {
  writeFileSync(path.join(outDir, name), buffer)
  console.log(`wrote samples/quickstart/input/${name} (${buffer.length} B, sha256 ${sha256(buffer)})`)
}
console.log('synthetic only: invented invoice number, fake tax ids (TEST...), no real invoice data')
