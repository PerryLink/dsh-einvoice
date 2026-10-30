# OPEN-SOURCE-SAMPLES — SKU-04 公开样本候选（不计入客户门）

盘点时间：**2026-10-30T23:47–2026-10-31T00:25+08:00**（Asia/Shanghai）
用途：只解决“有没有可合法用作 parser/demo 夹具的公开样本”；**不替代** SKU-04 的客户证据门（≥2 企业 + 1 代账 + 100 张真票）。
结论：**唯一可用的许可来源仍是 ofdrw（MIT）**；另有 invoice-github（MIT）合成件。新增的 2020 旧票、畸形票均来自 ofdrw；代码搜到的其他仓虽有票样，但**无 LICENSE / AGPL / 含真实 PII**，按 deny-by-default 排除。数量仍远不足以覆盖 60/25/10/5 的 GA 夹具。

> 机器可读清单：[oss-samples-manifest.json](./oss-samples-manifest.json)（19 个 OFD，含 SHA-256/pages/invoice_xml/customtag）。原始文件只在 `04-build/.tmp/oss-samples/from-subagent/`，**不进仓**。

## 1. 可用候选（许可清晰）

| # | 来源 | LICENSE | 文件 / 数量 | 格式 | 判定 |
|---|---|---|---|---|---|
| 1 | [ofdrw/ofdrw](https://github.com/ofdrw/ofdrw) | **MIT**（© 2020 Quan guanyu） | `reader/发票示例.ofd` = `converter/20240531141733.ofd`，46,091 B，SHA-256 `757c576d18e5f2278b42a7a6c99c4e5ec2b4196e1f7ed129db4f614acfccdfdc` | **2024 数电票 OFD**；20 位票号；字段在 `Tags/CustomTag.xml`，全部 ObjectRef 指向页内对象；**不带 `original_invoice.xml`** | 最佳数电 parser 夹具；含真实企业 PII；仅 1 份 |
| 2 | ofdrw/ofdrw | MIT | `converter/src/test/resources/1.ofd`，16,048 B，SHA-256 `bf41627e626a0cd1…`（全量见 manifest） | 2020 浙江增值税电子普通发票；`Attachs/original_invoice.xml` 2,287 B（40 字段）+ `CustomTag.xml` | 旧式发票解析对照；PII 重；需脱敏 |
| 3 | ofdrw/ofdrw | MIT | `converter/src/test/resources/999.ofd`，29,752 B，SHA-256 `a2b9080ae3518413…` | 2020 电子普票（5 页清单）；XML 39,970 B（40 字段） | 多页/清单夹具；PII 重 |
| 4 | ofdrw/ofdrw | MIT | `converter/src/test/resources/发票示例.ofd`，13,584 B，SHA-256 `f52f1df911c3d849…` | 2020 旧版电子发票；内嵌 `original_invoice.xml` + 签章；含银行账号等 | 可测旧式 XML/签章；PII 重 |
| 5 | ofdrw/ofdrw | MIT | `layout/src/test/resources/no_page_container.ofd`，7,707 B，SHA-256 `e7cac8d149ef0d5f…` | 有发票 XML，但 Pages 被删 → **畸形 OFD** | 异常夹具首选（结构级，不是发票语义异常） |
| 6 | ofdrw/ofdrw | MIT | `converter/src/test/resources/发票监制章-数科.ofd`，19,424 B，SHA-256 `6cf19b83504d726c…` | 监制章/签章 OFD，无发票字段 | 只测签章/资源 |
| 7 | [cuicuicuicui1/invoice-github](https://github.com/cuicuicuicui1/invoice-github) | **MIT**（© 2026 invoice-github developers） | `fixtures/fixture_01..10_*.pdf` + 20 个 QR PNG + `样例/样例发票.ofd` + `.xml` | **合成**测试件；XML 含 20 位数电号/测试企业；OFD 只有 `<OFD/>` + 一个 XML，**不是合法 OFD** | 可作 XML schema/二维码/异常输入；不是真实票 |
| 8 | [DLTech21/ofd.js](https://github.com/DLTech21/ofd.js) | **Apache-2.0** | `public/2.ofd` 4,278,691 B；`999/h/n.ofd` 与 ofdrw 逐字节一致 | `2.ofd` 是 89 页扫描件（196 JPG，Foxit 2017），**无发票文本/无 CustomTag** | 只能做大文件/扫描性能夹具，不是发票；`n.ofd` 含真实人名 PII |

**数电票结构的重要差异**：2024 数电票**没有** `original_invoice.xml`，字段靠 `Tags/CustomTag.xml` 的 `<ofd:root>` + ObjectRef 解引用；2020 旧票才有 `Attachs/original_invoice.xml`。parser 必须两条路径都支持。

## 2. 新增代码搜索（GitHub token）与排除项

| 来源 | LICENSE | 内容 | 处理 |
|---|---|---|---|
| `swpudp/OfdSharp` | **无 LICENSE** | `src/UnitTests/Files/test.ofd`、`test1.ofd`、`original_invoice.xml`（57 KB） | 排除；只可读结构，不复制 |
| `lllooollpp/ofdrw-net` | **无 LICENSE** | `发票示例`（疑似 ofdrw 拷贝）+ 29 MB `output.ofd` | 排除；疑似重复 |
| `jianse/rofd` | **无 LICENSE** | `samples/000.ofd`、`001.ofd` + 解包 XML | 排除；可能含票样 |
| `mawenshui/FapiaoGenius` | **无 LICENSE** | `res/` 下 20+ 真实 PDF（行程/酒店/餐补，含 PII） | 排除；真实 PII + 无许可 |
| `lyc1126/InvoiceHub` | **AGPL-3.0** | `tests/fixtures/sample_invoice.xml`（合成） | 排除（AGPL） |
| `zc310/ofd` | Apache-2.0 | 仅 crypt testdata，无发票样本 | 不采用 |
| `renoyuan/easyofd` | Apache-2.0 | 无 OFD 样本 | 不采用 |
| Gitee 搜索（带 token） | — | 4 个查询均返回 200 空结果 | 未能补搜；不声称“Gitee 无样本” |

## 3. 公开数据集（全部落空）

- HuggingFace 镜像：`invoice`/`fapiao`/`票据`/`chinese invoice` → 无中文发票集；通用英文 invoice 集不能映射中国 8 字段。
- Kaggle：`发票`/`fapiao`/`chinese invoice`/`invoice ofd` → 无可用中文发票集；`Invoice-OCR` 是 CC BY-NC-SA（排除）。
- ModelScope 命中均排除：`MIKL2077/SyntheticInvoice`（素材为网络爬取真实发票，PII/来源不清）、`DatatangBeijing/...`（实为商业采集真实票据，商用受限/PII）、阿里日文发票集。
- Roboflow Universe 403、OpenDataLab 无公开检索端点、grep.app/Sourcegraph/searchcode 不可用。

## 4. 数量缺口（对照 SKU-04 发布门）

| 类别 | 需要 | 当前公开可用 | 缺口 |
|---|---:|---:|---:|
| 数电 OFD+XML | 60 | **1** 个数电 OFD（CustomTag；无独立 XML） | 59 |
| 旧式发票 OFD+XML（对照用） | — | 3 个唯一样本（1/999/converter 示例） | — |
| 扫描件 300dpi | 25 | **0**（2.ofd 是扫描件但不是发票） | 25 |
| 红冲（含部分红冲） | 10 | **0**（现有票 TypeCode=0、金额为正） | 10 |
| 异常（发票语义） | 5 | **0**；结构级 7 份（含 no_page_container）可先顶 | 5 |
| 压力集 | 500 | 0 | 500 |
| 独立客户源 | ≥2 企业 + 1 代账 | 0（公开样本不是客户/伙伴） | 全部 |

⇒ **公开样本只能支持 parser 开发与 public demo，不能把 EVIDENCE 的客户门改成通过。**

## 5. 许可证与署名（若使用）

- ofdrw：MIT；保留 `LICENSE` 与 “ofdrw test resources, MIT, Copyright (c) 2020 Quan guanyu”；记录文件 SHA-256。
- invoice-github：MIT；保留 “Copyright (c) 2026 invoice-github developers”。
- ofd.js：Apache-2.0；若只用 `2.ofd` 做扫描性能夹具，保留 `LICENSE`/`NOTICE`；改动文件写 `Modified by PerryLink 2026-10`。
- **不复制**无 LICENSE / AGPL 仓的代码或样本；`FapiaoGenius` 的真实 PDF 不下载、不入库。

## 6. PII 与脱敏（必须先做）

ofdrw 的 1/2/3 号票含购/销方名称、18 位税号、地址电话、开户行/账号、开票人/收款人/复核人；`n.ofd` 也含真实人名。按 `REQ-EINVOICE §7`：

- 名称→ENT-A/B；税号重算校验位；票号保 20 位格式重编；金额×0.87；商品名→标准品名；账号留后 4 位。
- 保留票号位数/校验位、税率、金额小数位、红蓝对应关系（不能破坏可复算）。
- 原件只在本机加密盘；入 golden 库只存脱敏件 + 哈希；日志按 SECURITY-PRIVACY 掩码。原始文件只在 `.tmp`，不进仓。

## 7. 下一步（建议）

1. **用 ofdrw MIT 的字段结构程序化生成合成夹具**：按 1/2/3 号 XML 的 40 字段生成 60 张数电票（20 位号、红冲负数、缺字段/坏 XML/多页清单），再用 ofdrw/渲染器生成 25 张扫描件（加噪/旋转/倾斜）和 10 张红冲、5 张异常；全部标 `synthetic`。
2. **public demo 路径**：`BUILD-PLAN` 的 `source` 写 `public/open-source + synthetic`，`ACCEPTANCE` 标 `public/synthetic (not counted)`，`STATUS: partial`；GA 仍需真实客户样本。
3. **真实票**：仍只能走 `PARK.md` 的客户/伙伴通道；公开样本不改变 `EVIDENCE.md` 的 FAIL。
4. Gitee 搜索如后续拿到有效 token/接口，再补 `发票`/`数电票`/`ofd`；本轮不声称已穷尽。

## 9. Parser compatibility run (2026-10-31, local `.tmp` only)

These runs use the MIT public samples in `04-build/.tmp/oss-samples/`; no raw file or PII is committed. They are **parser/public-demo evidence only** and do not count toward the customer gate.

| Sample | Result | Note |
|---|---|---|
| `ofdrw-tests/1.ofd` | **OK** old OFD, total 526.00, 1 line | its `Price` is `510.679612`; unit price now rounds to cents (`priceToCents`), totals stay strict |
| `ofdrw-20240531.ofd` | **OK** 数电 OFD, total 4449.00, 2 lines | 20-digit number; values resolved through `CustomTag` + ObjectRef text |
| `ofdrw-invoice-sample.ofd` | **OK** old OFD, total 318.00 | old XML + stamp |
| `invoice-github/样例/样例发票.ofd` | **OK** standalone XML, total 1060.00 | synthetic XML in a placeholder OFD |
| `ofdrw-tests/999.ofd` | `E_INV_FIELD_MISSING` | buyer tax id is empty in the sample (personal invoice); known limitation, needs review |
| `ofdrw-tests/signout.ofd`, `y.ofd` | `E_INV_FIELD_MISSING` | `CustomTag.xml` is `LogicalStructure`, not an invoice; classify as unsupported |
| `2.ofd`, `h.ofd`, `n.ofd`, stamp/scan OFDs | `E_INV_OFD_UNSUPPORTED` | no invoice XML / no invoice text; expected |
| `no_page_container.ofd` | `E_INV_FIELD_MISSING` | malformed Pages; amount sentinel `***`; expected fail-closed |

**Action**: public sample test is `test/public-samples.test.mjs`; it skips when `.tmp` is absent. The customer gate remains **PARK**.
