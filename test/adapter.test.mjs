import test from 'node:test'
import assert from 'node:assert/strict'
import { zipSync, strToU8 } from 'fflate'
import { ofdZipXmlParser } from '../lib/adapters/ofd-zip-xml.js'
import { InvoiceError } from '../lib/core/invoice.js'

function zip(files) {
  const entries = {}
  for (const [name, text] of Object.entries(files)) entries[name] = strToU8(text)
  return Buffer.from(zipSync(entries))
}

const oldXml = `<?xml version="1.0" encoding="utf-8"?>
<eInvoice Version="1.0">
  <InvoiceCode>050001700111</InvoiceCode>
  <InvoiceNo>99999951</InvoiceNo>
  <IssueDate>2020年10月10日</IssueDate>
  <Buyer><BuyerName>测试买方有限公司</BuyerName><BuyerTaxID>91330106MA2B4C5D6X</BuyerTaxID></Buyer>
  <Seller><SellerName>测试卖方有限公司</SellerName><SellerTaxID>91310115MA1K2L3M4N</SellerTaxID></Seller>
  <TaxExclusiveTotalAmount>300.00</TaxExclusiveTotalAmount>
  <TaxTotalAmount>18.00</TaxTotalAmount>
  <TaxInclusiveTotalAmount>318.00</TaxInclusiveTotalAmount>
  <GoodsInfos><GoodsInfo>
    <Item>*餐饮服务*餐费</Item><Quantity>4</Quantity><Price>75.00</Price><Amount>300.00</Amount><TaxScheme>6%</TaxScheme><TaxAmount>18.00</TaxAmount>
  </GoodsInfo></GoodsInfos>
</eInvoice>`

const digitalCustomTag = `<?xml version="1.0" encoding="UTF-8"?>
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
</root>`

function pageContent(values) {
  const objects = values.map(([id, text]) => `<ofd:TextObject ID="${id}"><ofd:TextCode>${text}</ofd:TextCode></ofd:TextObject>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><ofd:Page xmlns:ofd="http://www.ofdspec.org/2016"><ofd:Content><ofd:Layer>${objects}</ofd:Layer></ofd:Content></ofd:Page>`
}

test('parses an old OFD invoice XML attachment', () => {
  const buffer = zip({
    'OFD.xml': '<OFD/>',
    'Doc_0/Attachs/original_invoice.xml': oldXml,
  })
  const parsed = ofdZipXmlParser.parse({ buffer, fileName: 'old.ofd' })
  assert.equal(parsed.document_kind, 'ofd-old')
  assert.equal(parsed.invoice_no, '99999951')
  assert.equal(parsed.issue_date, '2020-10-10')
  assert.equal(parsed.buyer.tax_id, '91330106MA2B4C5D6X')
  assert.equal(parsed.total_cents, 31800)
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.unknown_fields.InvoiceCode, undefined)
})

test('parses a 数电票 CustomTag/ObjectRef OFD', () => {
  const values = [
    ['1', '25512345000000000091'], ['2', '2026年08月01日'],
    ['3', '测试买方有限公司'], ['4', '91310115MA1K2L3M4N'],
    ['5', '测试卖方有限公司'], ['6', '91330106MA2B4C5D6X'],
    ['7', '1000.00'], ['8', '60.00'], ['9', '¥'], ['10', '1060.00'],
    ['11', '技术服务费'], ['12', '6%'], ['13', '1000.00'], ['14', '60.00'], ['15', '500.00'], ['16', '2'],
  ]
  const buffer = zip({
    'OFD.xml': '<OFD/>',
    'Doc_0/Tags/CustomTag.xml': digitalCustomTag,
    'Doc_0/Pages/Page_0/Content.xml': pageContent(values),
  })
  const parsed = ofdZipXmlParser.parse({ buffer, fileName: 'digital.ofd' })
  assert.equal(parsed.document_kind, 'ofd-digital')
  assert.equal(parsed.invoice_no, '25512345000000000091')
  assert.equal(parsed.issue_date, '2026-08-01')
  assert.equal(parsed.total_cents, 106000)
  assert.equal(parsed.lines.length, 1)
  assert.equal(parsed.lines[0].description, '技术服务费')
  assert.match(parsed.field_evidence.invoice_no, /#1/)
})

test('parses a standalone generic invoice XML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice><InvoiceNo>25512345000000000091</InvoiceNo><InvoiceIssueDate>2026-08-01</InvoiceIssueDate>
<Seller><Name>测试卖方有限公司</Name><TaxID>91330106MA2B4C5D6X</TaxID></Seller>
<Buyer><Name>测试买方有限公司</Name><TaxID>91310115MA1K2L3M4N</TaxID></Buyer>
<Items><Item><Description>技术服务费</Description><Quantity>2</Quantity><UnitPrice>500.00</UnitPrice><Amount>1000.00</Amount><TaxRate>6</TaxRate><TaxAmount>60.00</TaxAmount></Item></Items>
<Amount>1000.00</Amount><TaxAmount>60.00</TaxAmount><TotalAmount>1060.00</TotalAmount></Invoice>`
  const parsed = ofdZipXmlParser.parse({ buffer: Buffer.from(xml), fileName: 'synthetic.xml' })
  assert.equal(parsed.document_kind, 'xml')
  assert.equal(parsed.total_cents, 106000)
  assert.equal(parsed.buyer.tax_id, '91310115MA1K2L3M4N')
})

test('rejects empty and unrecognized inputs', () => {
  assert.throws(() => ofdZipXmlParser.parse({ buffer: Buffer.alloc(0), fileName: 'empty' }), InvoiceError)
  const buffer = zip({ 'not-ofd.txt': 'nope' })
  assert.throws(() => ofdZipXmlParser.parse({ buffer, fileName: 'bad.ofd' }), InvoiceError)
})
