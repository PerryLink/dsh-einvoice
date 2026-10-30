# EVIDENCE — SKU-04 客户/样本门（§4.0）

审计时间：**2026-10-30T13:02:57+08:00**（Asia/Shanghai）
审计对象：SKU-04 全电发票 `@perrylink/dsh-fin-invoice-core`
结论：**证据门 FAIL → PARK**；本轮**未写 BUILD-PLAN、未写代码**。

## 1. 门槛（取最严口径）

| 来源 | 要求 | 用途 |
|---|---|---|
| V2 §3 #1 | **≥2 企业 + 1 代账，≥100 张真票**（60 数电 OFD+XML / 25 扫描 / 10 红冲 / 5 异常）；不满足 → PARK | 任务级证据门 |
| `REQ-EINVOICE §7` | **3 家设计伙伴（2 制造 / 1 贸易）+ 1 家代账**；60/25/10/5；另加 500 张压力集 | golden 集来源 |
| `REQ-EINVOICE §9` | **3 家客户真票 + 法务授权**；“发布前必须凑齐 100 张真票，不达标不发版” | 发布依赖 |
| `ROADMAP` | 每 SKU **≥1 家设计伙伴**；W2 前拿到 1 份真实数据 | Q1 门 |
| `TEST-HARNESS §2` | manifest 六项（`sku`/`unit_ids`/`sample_count`/`source`/`redaction`/`metrics`/`expected_sha256`/`runtime`） | 可复算 |
| `CHECKLISTS/MVP-ACCEPTANCE.md:17-18` | 真实样本 ≥10；设计伙伴第 4 周前给过样本，“没有 → 直接停” | MVP 门 |

⇒ 两层门槛：
- **计划门（§3 表，本轮判据）**：≥2 企业 + 1 代账 + ≥100 张真票。
- **GA 目标（REQ §7/§9，更严）**：3 家客户 + 1 家代账 + 法务授权 + 100 张真票（60/25/10/5）。
本审计按更严的 3+1 盘点；即使只按 V2 的 2+1，当前仍是 0，结论不变。

## 2. 当前库存（实测）

| 项 | 要求 | 实测 | 缺口 |
|---|---:|---:|---:|
| 独立样本源（企业） | ≥3 | **0** | 3 |
| 独立样本源（代账） | ≥1 | **0** | 1 |
| 设计伙伴 LOI | ≥1 | **0** | 1 |
| 真票总数 | 100 | **0** | 100 |
| 数电 OFD+XML | 60 | 0 | 60 |
| 300dpi 扫描 | 25 | 0 | 25 |
| 红冲（含 2 张部分红冲） | 10 | 0 | 10 |
| 异常（抬头错/重复/缺 XML/号票不符/作废） | 5 | 0 | 5 |
| 压力集 | 500 | 0 | 500 |
| 法务授权/数据处理协议 | 1 份 | 无 | 1 |
| 脱敏件 + `expected_sha256` | 全量 | 无 | 全量 |
| 公开/合成样本 | 不计入门 | 若干（ofdrw MIT + invoice-github MIT，见 `OPEN-SOURCE-SAMPLES.md`） | — |

依据：

- `program/STATUS.md:44`：Q1 建设“未启动”，待办为“4 个 SKU 的样本与设计伙伴”；`:84` 明写“**设计伙伴 0 家在册**”。
- `program/ROADMAP.md:170`：“每 SKU 1 家设计伙伴：W2 前拿到 1 份真实数据”。
- 搜索（可复跑）：
  - `find 01-research/dsh-plugin-gap-2026-10-29 -type f \( -iname '*.ofd' -o -iname '*.ofdx' -o -iname '*发票*' -o -iname '*einvoice*' -o -iname '*invoice*' \)` → 仅命中 `DESIGN/SKU-04-EINVOICE.md`、`REQUIREMENTS/Q1/REQ-EINVOICE.md` 两份文档。
  - `find 00-live 01-research 02-playbooks -maxdepth 3 \( -iname '*invoice*' -o -iname '*发票*' -o -iname '*ofd*' \)` → 无命中。
  - 全 hub 全盘 `find` 在 `/mnt/d`（drvfs）上 60s 超时，未完成；2026-10-29 的全盘扫描结果为 **0**（见 `04-build/ENV.md`）。`00-live/_scan` / `_tmp-research` 下命中的 fixture 目录是 OSS 调研副本；本轮未逐目录认定其内容，且它们不属于客户授权样本，不能计入证据门。
- 结论：**0 个独立客户源、0 张真票、0 份授权、0 个客户样本哈希**，任何一项都低于门槛。另有公开样本候选若干（见 `OPEN-SOURCE-SAMPLES.md`），但不是客户授权样本，不计入本门。

## 3. 脱敏与哈希（尚未执行）

按 `REQ-EINVOICE §7` 的计划：

- 名称→ENT-A/B；税号重算校验位；票号保 20 位格式重编；金额×0.87；商品名→标准品名；账号留后 4 位。
- **必须保留**：票号位数与校验位规则、税率、金额小数位、红蓝对应关系——脱敏不能破坏可复算。
- 原件只在本机加密盘；入 golden 库只存脱敏件与哈希，不存原票。
- manifest 按 `TEST-HARNESS §2.1`：`source` 写清真实/合成/公开占比，`redaction` 用 `none|partial|full`，`expected_sha256` 覆盖关键产物。
- 当前：**0 份脱敏件、0 个 SHA-256、0 份 manifest**。

## 4. 数据安全

- 本审计未读取任何真实客户数据/PII；未读 `00-live/_key.ps1`、`plugins/发布令牌.md`；未执行 `gh auth token`；未写 `/home/yy/.dsh`。
- 后续收样必须：脱敏后才进仓；真实原件只在本机加密盘；日志按 `CHECKLISTS/SECURITY-PRIVACY.md:23-24` 掩码票号/税号/身份证/手机号/金额；客户数据可导出、可删除。
- 插件仓建立时按 §5.1 写 `.gitignore`：`fixtures/input/`、`evidence/raw/`、`*.pem`、`.env*` 不入仓；本轮未建仓，故未落地。

## 5. 判定

`0 个独立客户源 / 0 张真票 / 0 份授权` < 计划门 `2 企业 + 1 代账 / 100 张`（更不用说 GA 的 3+1） ⇒ **客户门 FAIL**；公开样本不改变此结论。
按 §4.0：客户门未过不得写 BUILD-PLAN、不得写代码；**B2 例外**（用户 2026-10-31 同意 public demo）允许写 `BUILD-PLAN-04`，但 public/synthetic 行必须 `not counted`、`STATUS: partial`，不得声称 GA。写 `PARK.md`（见同目录）。

## 6. 公开开源样本（不计入客户门）

见 [`OPEN-SOURCE-SAMPLES.md`](./OPEN-SOURCE-SAMPLES.md)：ofdrw（MIT）现有 **1 个数电 OFD**（CustomTag 型，无 `original_invoice.xml`）+ **3 个旧式发票 OFD**（含 40 字段 XML）+ **1 个畸形**（`no_page_container`，有票面 XML 无页面）+ 1 个监制章；invoice-github（MIT）有 20 个合成 PDF + 1 个伪 OFD。另：`OfdSharp`/`ofdrw-net`/`rofd`/`FapiaoGenius` 无 LICENSE，`InvoiceHub` 是 AGPL，均排除。可作 parser/public demo 夹具，**不改变本文件 FAIL**；使用前须按 REQ §7 脱敏并保留 LICENSE/署名；原始样本只在 `.tmp`，不进仓。机器清单：[`oss-samples-manifest.json`](./oss-samples-manifest.json)。
