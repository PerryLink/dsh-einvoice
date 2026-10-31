> **HISTORICAL — customer-evidence work was permanently removed from scope on 2026-10-31. This is not an active plan or reopen condition. See [PUBLIC-ONLY-BOUNDARY.md](../PUBLIC-ONLY-BOUNDARY.md).**

# BUILD-PLAN-04 — SKU-04 全电发票（文件级）

```yaml
sku: SKU-04
install_package: "dsh-einvoice"
engine_package: "dsh-fin-invoice-core"   # S1 先内嵌，S2 拆包
workdir: 04-build/dsh-fin-invoice-core/
owner: P04 财务线 Tech Lead / 财务组
status: plan / public-demo (B2)
target: 0.2.1-rc.3 @ 22ddee3792
evidence: 客户门仍 PARK；本计划只使用 public/open-source + synthetic 夹具，ACCEPTANCE 标 not counted
sources: REQ-EINVOICE §1/§4/§6–§10；DESIGN §1–§10；DECISIONS 04；TOOL-CONTRACTS；DATA-MODELS；TEST-HARNESS；AUDIT §3
```

> **证据门状态**：客户门（≥2 企业 + 1 代账 + 100 真票）仍 FAIL/PARK。用户 2026-10-31 同意“开源样本、协议可行、未来声明”，本计划走 **B2 public demo**：所有 public/synthetic 行不计入 GA，`STATUS: partial`；真实 GA 仍需客户样本。此例外记录在 `PARK.md`。

## 1. 范围

**v0.1 做**（对齐 REQ §1 G1–G3 / DESIGN §1）：
- 文件投递/本地共享目录收票（不做 IMAP/邮箱自动抓取）；
- OFD/XML 解析 adapter：旧式 `original_invoice.xml` + 数电 `CustomTag.xml` + 独立 XML；
- 八字段归一（20 位票号、开票日期、购方名称、购方税号、销方名称、销方税号、价税合计、税额）+ 行明细 + `field_evidence` + `unknown_fields`；
- 票池查询、导出（S1 先做查询；导出 S2 补）；
- 后续 S2/S3：查重、抬头校验、查验队列/回执哈希、红冲勾稽、档案包 + manifest + 30 年复原。

**v0.1 不做**：IMAP/Graph 自动抓取、OCR 引擎、税局自动查验/写接口、ERP 过账、电子签章法律效力判定、他类票据、Client UI（S1）。

**S1 切片（本计划第一交付）**：`invoice.ingest` + `invoice.parse` + `invoice.query` 三个工具；1 个 storage 实体；1 个 parser registry + 1 个 adapter；≤10 个文件（6 源码 + 4 配置）。S1 不做 dedup/verify/receipt/archive/Client。

**范围细化（记录）**：DESIGN §10 S1 含“导出”；S1 工具上限 3，导出改为 S2 的 CLI/工具，S1 用 `invoice.query` 展示票池。不改 15 SKU/季度/定价/验收门。

## 2. 买家与场景

中国 AP 会计（财务共享中心）在本地文件夹/共享盘前，把供应商发来的 OFD/XML 发票变成“八字段可核、原件可定位、未知字段保留”的票池；S1 验收数是 3 个公开/合成票样解析成功 + 负样本 0 误收；v0.1 完整验收见 §12。

## 3. 工具表（≤12；S1 只前 3 个）

| 工具 | S1 | 入参 | 出参 | R | approval | mcp_exposure | 幂等键 | 错误码 |
|---|---|---|---|---|---|---|---|---|
| `invoice.ingest` | ✅ | `source{kind:'file', path, sha256?}`、`entity_id?`、`dry_run?` | `doc_id`、`sha256`、`size`、`existing?` | R1 本地写 | 否 | none | 原件 SHA-256 | `E_INV_FILE_UNREADABLE`、`E_INV_PATH_NOT_ALLOWED`、`E_INV_STORAGE_FAILED` |
| `invoice.parse` | ✅ | `doc_id`、`profile?`、`ocr:'off'` | 八字段 + `lines[]` + `confidence` + `field_evidence` + `unknown_fields` + `parser_version` | R0 只读 | 否 | none | `(doc_id, parser_version)` | `E_INV_DOC_NOT_FOUND`、`E_INV_OFD_UNSUPPORTED`、`E_INV_XML_SCHEMA_DRIFT`、`E_INV_FIELD_MISSING`、`E_INV_UNKNOWN_IMPL` |
| `invoice.query` | ✅ | `filter{entity_id?,period?,lifecycle?,q?}`、`cursor?`、`page?` | `rows[]`、`total`、`next_cursor?` | R0 只读 | 否 | none | 无 | `E_INV_DOC_NOT_FOUND` |
| `invoice.dedup` | S2 | `entity_id`+`period` 或 `doc_ids[]` | `groups[{fingerprint,kind,members,basis}]` | R0 | 否 | none | 只读 | `E_INV_DUP_CONFLICT` |
| `invoice.verify` | S2 | `invoice_ids[]`、`mode=queue\|submit`、`budget` | `queue[]`、`attempts[]`、`manual_tasks[]` | R1 外部只读 | 否 | none | `(invoice_id,attempt_no)` | `E_INV_VERIFY_RATE_LIMITED` 等 |
| `invoice.receipt` | S2 | `invoice_id`、`receipt_file`、`result_code`、`verified_at`、`operator` | `receipt_id`、`receipt_sha256` | R1 + 审批 | 是（`ctx.approval`） | none | `(invoice_id,receipt_sha256)` | `E_INV_RECEIPT_*` |
| `invoice.redlink` | S2/S3 | `red_id`、`blue_id?`、`mode`、`allocation` | `redlink{...}` | R1 | 否 | none | `red_id` | `E_INV_REDLINK_*` |
| `invoice.archive` | S3 | `entity_id`、`period`、`template_id`、`include_receipts` | `pkg_id`、`manifest_sha256`、`zip_path`、`file_count`、`check_state` | R1 + 审批 | 是 | none | `(entity,period,member_hash_set)` | `E_INV_ARCHIVE_*` |
| `invoice.check` | S3 | `pkg_id` 或 `path` | `{missing,hash_mismatch,dir_violation,signable}` | R0 | 否 | none | 只读 | `E_INV_ARCHIVE_MISSING_PART` |

- **MCP**：S1 全部 `none`（V2 §8 更严；DESIGN 说 parse/query/check 可 `metadata_only`，差异记录在 §8）。
- **R2/R3**：v0.1 不注册；`risk===3` 直接抛 `R3 disabled in v0.1`。
- **错误形态**：DSH 的 `defineTool` 用 throw/非法输出表示 `isError`；项目 envelope 只用于 CLI/JSON 包装，**不把 `{ok:false}` 当成功返回**。

## 4. 数据

- storage domain：`defineDomain({name:'fin_invoice', version:1, tables:{invoices: domainTable(InvoiceSchema)}})` → `ctx.storageDomain.open`。
- S1 单表 `invoices`；`lines[]` 嵌套在 Invoice 文档内（KV 文档，≤64KB/条；超限拆行/压缩）。
- 主键 `doc_id`（ULID）；业务唯一 `(entity_id, invoice_no)` 由应用层校验；`sha256` 唯一用于幂等。
- 关键字段：`doc_id`、`entity_id`、`invoice_no`、`invoice_code?`、`issue_date`、`buyer{name,tax_id}`、`seller{name,tax_id}`、`amount_cents`、`tax_cents`、`total_cents`、`currency:'CNY'`、`lines[]`、`confidence`、`field_evidence`、`unknown_fields`、`parser_version`、`source{kind,path,sha256,size}`、`lifecycle`、`created_at`、`updated_at`、`run_id`、`actor`、`evidence_sha256`。
- 金额整数分；税率/比例用两位小数字符串；时间 ISO8601 UTC；30 年保留、软删。
- **无 migration、无跨表事务**；schema 变更只能新域版本/手工 JSONL 迁移；S1 不写 SQLite 例外。
- Client：无（S1）；S2 再评估三个 slot。

## 5. Client

**无**。S1 不注册 `dsh.client`，不做票据池 UI；S2/S3 评估后仍 defer（见 `CLIENT-DECISION.md`）；若未来做，必须空/错/加载三态。

## 6. 外部系统

S1 **无**：只读本地文件/目录，无 IMAP/SMB/税局/网络。S2 的 IMAP/SMB 属 v0.1 非目标（V2 只做文件投递/共享盘），至少 S2 不做自动抓取；税局查验只半自动、人工确认，绝不破解验证码。凭据：S1 不需要；S2 若接 IMAP 才用 `ctx.credentials`。

## 7. 错误与失败路径（≥8）

| 错误码 | 类 | 触发 | 可重试 | 用户下一步 |
|---|---|---|---|---|
| `E_INV_FILE_UNREADABLE` | fatal | 零字节/损坏/加密 | 否 | 隔离原件，人工复核 |
| `E_INV_PATH_NOT_ALLOWED` | fatal | 路径越出 allowlist/符号链接逃逸 | 否 | 移到允许目录 |
| `E_INV_DOC_NOT_FOUND` | fatal | doc_id 不存在 | 否 | 先 `invoice.ingest` |
| `E_INV_OFD_UNSUPPORTED` | fatal | 非 GB/T 33190/缺结构件 | 否 | 只读 XML 降级或人工 |
| `E_INV_XML_SCHEMA_DRIFT` | needs_review | 未知节点/版本超前 | 是（复核后） | 保留 unknown_fields，人工裁决 |
| `E_INV_FIELD_MISSING` | needs_review | 八字段缺一 | 是 | 补票/人工录入 |
| `E_INV_ENTITY_MISMATCH` | needs_review | 购方税号不在主体映射 | 否 | 标非本主体 |
| `E_INV_DUP_CONFLICT` | needs_review | 同票号字段不一致 | 否 | 不覆盖，进待裁决 |
| `E_INV_STORAGE_FAILED` | retryable | 介质/写失败 | 是（3 次） | 检查磁盘/权限 |
| `E_INV_UNKNOWN_IMPL` | fatal | registry 未知 parser key | 否 | 用已注册 profile |
| `E_INV_EXPORT_FAILED` | retryable | S2 导出写失败 | 是 | 检查目标目录 |

- CLI 退出码：`0` 成功；`2` needs_review；`3` fatal；`4` 用法错误。
- 重试上限 3；退避 1s/2s/4s；不重试 fatal。

## 8. 安全 / 隐私

- 无网络、无凭据、无外部写；R2/R3 不注册。
- 路径 allowlist（默认插件配置的 `storageDir`/`inputRoots`）；拒绝 `..`、符号链接逃逸；文件 ≤50MB；解压限制条目数/总字节，防 zip bomb；XML 关闭外部实体/实体扩展。
- 日志只留 `doc_id`、`run_id`、错误码；不打印票号/税号/金额/名称；CLI 输出默认脱敏（税号前 4 后 4，金额仅汇总）。
- 原件存本地 `storageDir/originals/<sha256>`；DB 只存路径+哈希；不写入会话日志正文。
- 公开样本含 PII：**原件只在 `.tmp`，不进仓**；入仓夹具必须按 REQ §7 脱敏 + 哈希。
- MCP `none`（S1）；若后续开 `metadata_only`，只回计数/哈希/字段名。

## 9. 测试

| 层 | 内容 | 门 |
|---|---|---|
| 单测 | 旧式 XML、数电 CustomTag/ObjectRef、独立 XML、金额/税号校验、unknown_fields、路径逃逸 | 核心 ≥85% |
| 集成 | 临时 `DSH_HOME`，`dsh plugin add` → ingest 3 个公开 OFD + 合成 XML → parse → query → remove | 全通过、卸载无层残留 |
| Golden | 4 个公开 OFD（MIT，脱敏）+ 100 个合成票（60 数电/25 扫描占位/10 红冲/5 异常） | `manifest.json` 六项齐全 |
| 负样本 | 零字节、加密、zip bomb、缺页、坏 XML、抬头错、重复 | `false_accept=0` |
| 失败注入 | 磁盘满、权限拒绝、parser 抛错、超时 | fail-closed / needs_review |
| 可复现 | `TZ=Asia/Shanghai LC_ALL=C.UTF-8`；seed 固定；产物哈希两次一致 | 无“≤2%”口径 |

- `fixtures/sku-04/manifest.json`：`sample_count`、`source:"public(ofdrw MIT, redacted)+synthetic"`、`redaction:"partial"`、`metrics`、`expected_sha256`、`runtime`；public/synthetic 行标 `not_counted`。
- 验收脚本 `scripts/acceptance.mjs` 从 `evidence/<run_id>/result.json` 生成 `ACCEPTANCE.csv`；缺 actual/script/sha 即 exit 1。

## 10. 切片

| 片 | 范围 | 交付 | 验收数 |
|---|---|---|---|---|
| **S1 W1–2** | ingest + parse + query；1 domain/table；1 registry + 1 adapter；6 源码 + 4 配置 | 投递 4 个公开票样（1 数电 + 3 旧票；单文件 ingest 调用 4 次）→ 票池可看八字段 + 原件路径 + unknown_fields | 合成：八字段 100%（3/3 已知票样）、负样本 0 误收；公开 4 票样可选；**not counted** |
| S2 W3–4 | dedup + 抬头校验 + 异常分类 + 导出 | 重复组、异常清单、pool.xlsx | 重复 100%、0 静默 |
| S3 W5–6 | 查验队列 + 回执哈希 + 红冲勾稽 | 回执链、10/10 勾稽 | 回执完整 100% / 勾稽 10/10 |
| S4 W7–8 | 档案包 + manifest + 复原 + 审计导出 | `archive-check.json` | 复原 100%、三项 0 |

S1 DoD：`pnpm build/lint/typecheck/test/gate:sku04` 全绿；`npm pack --dry-run` 无 `.env/.pem/fixtures/input`；`npm publish --dry-run --tag next` 可跑；`npm view` 复核名未占。
**首版发布口径**：`version: 0.1.0-alpha.0`，`npm publish --access public --tag next`，**不占用 `latest`**；GA 才发 `0.1.0`/`latest`。发布必须显式 `--registry=https://registry.npmjs.org/`（本机默认可能是 npmmirror），2FA/trusted publishing；**不发 0.0.0 空包占名**。

## 11. 依赖 / 许可

| 依赖 | SPDX | 类 | 用途 / 边界 |
|---|---|---|---|
| `fflate` | MIT | A | OFD zip 解包/打包；进 tarball |
| `fast-xml-parser` | MIT | A | XML 解析；关闭实体扩展 |
| `zod` | MIT | A | storage domain schema |
| `@deepseek-ai/dsh-tools` | Apache-2.0 | peer | `defineTool` |
| `@deepseek-ai/cordis` | Apache-2.0 | peer | plugin context |
| `@deepseek-ai/dsh-storage-domain` | Apache-2.0 | peer | `ctx.storageDomain` |
| `ofdrw` | MIT | **B** | Java 参考/可选验签进程；不进 tarball、不自动安装；缺失不阻断 S1 |
| `ofd.js` | Apache-2.0 | C/B | 参考实现；S1 不依赖 |
| `dsh-invoice-ledger` | Apache-2.0 | C | 台账级可选集成；不复制代码 |
| `better-sqlite3` | MIT | 不用 | 无 JOIN/事务需求，不写 ADR |

- 无 GPL/AGPL/SSPL/商业 SDK；`ofdrw` 只作 B 类参考；`gs/mutool/poppler/veraPDF` 不用。
- 价格锚：REQ §10 单点 ¥1,999/月或 ¥1.2 万/年（试点 ¥6,000/年）；竞品百望/合思公开报价未核实，**不编**。
- `packageManager: pnpm@11.28.5`；`engines.node >=24 <25`；`engines.dsh >=0.2.1-rc.3 <0.3.0`；Apache-2.0 + NOTICE + THIRD-PARTY-NOTICES + SBOM。

## 12. 验收映射

REQ-EINVOICE §8 七行 → `SKU-04-A01..A07`；S1 只跑 **A01（八字段，public/synthetic 子集）+ A06（P95）+ A07（审计）**；A02–A05 是 S2/S3，未跑即 `not run`，不得写 pass。

| req_id | 指标 | S1 脚本 | 证据 |
|---|---|---|---|
| SKU-04-A01 | 八字段准确率 ≥98% | `scripts/parse.eval.mjs` | `result.json` |
| SKU-04-A02 | 扫描件 ≥92% | S2（S1 无 OCR） | not run |
| SKU-04-A03 | 红冲勾稽 10/10 | S2 | not run |
| SKU-04-A04 | 归档复原 100% | S3 | not run |
| SKU-04-A05 | 回执完整率 100% | S3 | not run |
| SKU-04-A06 | 单票 P95 <20s | S1 公开样本 | `result.json` |
| SKU-04-A07 | 崩溃/审计覆盖 100% | S1 | `result.json` |

- `scripts/gate:sku04` = parse.eval + acceptance；`ACCEPTANCE.csv` 由脚本生成；public/synthetic 行标 `not_counted`，不得计入 GA。
- 真实客户门（100 真票）未过前，`STATUS: partial`，不对外承诺 GA。

## 13. 不造清单复核

| 条目 | 结论 |
|---|---|
| DOCX/PDF/IFC/AP/QMS/碳/条款等复用件 | 本 SKU 不涉及 |
| OFD 收票/解析 | 用 thin `ofd-zip-xml` adapter（fflate + fast-xml-parser）读容器/XML；ofdrw 仅 B 类参考；**不重做税局收票平台** |
| 商业 SDK（Aspose/Draftable/百望） | 不嵌入 |
| GPL/AGPL/SSPL | 无；`InvoiceHub` AGPL 只读参考未复制 |
| Ghostscript/mutool/poppler/veraPDF | 不用 |
| PIM/ERP/Odoo/Firefly | 不涉及 |

结论：**无 DROP**；S1 不命中禁止项。

## 14. COMPONENT-MAP

| 层 | 文件 | 职责 | 允许依赖 | 禁止依赖 |
|---|---|---|---|---|
| core | `src/core/invoice.ts` | 八字段归一、金额/税号校验、unknown_fields、`ParsedInvoice` 类型 | 纯 TS（无第三方运行时） | `ctx.`、`@deepseek-ai/*`、`dsh` |
| adapters | `src/adapters/ofd-zip-xml.ts` | 解 OFD zip、读 old XML/数电 CustomTag、独立 XML → `ParsedInvoice` | `fflate`、`fast-xml-parser`、core | `ctx.tools.register` |
| registry | `src/registry/parsers.ts` | 冻结的 parser 表；key `ofd-zip-xml`；未知 key `E_INV_UNKNOWN_IMPL`；重复 key 启动失败 | core/adapters | 运行中可变 |
| plugin | `src/plugin/index.ts` | `inject=['tools','storageDomain']`、开 domain、注册 3 工具、注册 parser | core/adapters/registry、DSH services | 业务规则 |
| plugin | `src/plugin/tools.ts` | `invoice.ingest/parse/query` 的 `defineTool` 薄封装 | plugin/core/adapters | 直接读文件绕过 adapter |
| plugin | `src/plugin/storage.ts` | domain spec/打开/关闭、InvoiceSchema、应用层唯一校验 | `ctx.storageDomain`、zod | SQL/事务假设 |

- S1 源文件 6 + 配置 4（`package.json`、`cordis.patch.yml`、`tsconfig.json`、`tsdown.config.ts`）= 10；测试另计。
- `package.json#dsh.bundle.patch` → `cordis.patch.yml`；`insert` 用裸包名 `dsh-einvoice`；无 `dsh.client`。
- `registry` 启动时冻结；S1 只有 1 个 registry + 1 个 adapter + 1 个 core 模块。
- `core/` 出现 `ctx.`/`@deepseek-ai/*`/`dsh` 即 CI 红。

## 10 行摘要（给计划门）

1. SKU-04 走 **B2 public demo**；客户门仍 PARK，public/synthetic 全部 `not counted`。
2. 安装包 `dsh-einvoice`；引擎 `dsh-fin-invoice-core` S2 再拆。
3. S1 = `invoice.ingest` + `invoice.parse` + `invoice.query`，3 工具。
4. 1 个 storage 实体 `fin_invoice.invoices`；无 migration/事务。
5. 1 个 registry + 1 个 adapter：`ofd-zip-xml`（fflate + fast-xml-parser）。
6. 旧式 `original_invoice.xml` 与数电 `CustomTag` 两条解析路径。
7. 八字段 + lines + field_evidence + unknown_fields；金额整数分。
8. S1 源文件 6 + 配置 4 = 10；无 Client、无外部系统、无 R2/R3、MCP none。
9. 依赖全 MIT/Apache；ofdrw 只 B 类参考；无 GPL/商业 SDK。
10. 验收脚本 `gate:sku04` + `ACCEPTANCE.csv`；npm 发布前 `npm view`/`publish --dry-run`/SBOM/tarball hash。
