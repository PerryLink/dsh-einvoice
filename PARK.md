# PARK — SKU-04 证据门未过（pre-plan）

状态：**parked（客户门）+ B2 public demo 已获准** · 时间：2026-10-31T00:31+08:00
关联：[EVIDENCE.md](./EVIDENCE.md) · [BUILD-QUEUE.md](../BUILD-QUEUE.md) §1 · [OPEN-SOURCE-SAMPLES.md](./OPEN-SOURCE-SAMPLES.md)

> 2026-10-31：用户同意“开源样本、协议可行、未来声明”并按 B2 进入计划轮；**客户证据门仍 PARK**。计划轮的 public/synthetic 行不计入 GA 验收，`STATUS: partial`。

## 1. 卡点

- 独立样本源 **0**（要求 ≥2 企业 + 1 代账；GA 目标 3 客户 + 1 代账）。
- 真票 **0**（要求 ≥100：60 OFD+XML / 25 扫描 / 10 红冲 / 5 异常）。
- 法务授权/数据处理协议 **0**；脱敏件/SHA-256/manifest **0**。
- `program/STATUS.md:84` 明写“**设计伙伴 0 家在册**”；Q1 建设“未启动”。

## 2. 缺什么

1. **人**：≥2 家企业 + 1 家代账的样本提供方（计划门）；GA 另需第 3 家客户 + 法务授权。
2. **LOI**：至少 1 家设计伙伴的书面意向/样本使用授权（ROADMAP：W2 前 1 份真实数据）。
3. **样本**：100 张真票，分布 60/25/10/5；另 500 张压力集。
4. **合规**：法务授权、脱敏记录、加密存储、删除路径。
5. **可复算**：每份样本的 SHA-256、`manifest.json`（TEST-HARNESS §2.1 六项）、脱敏前后对照说明。

## 3. 怎么补（最小路径）

1. **GTM/PO（截止 2026-11-12，STATUS T7）**：先签 1 家设计伙伴，拿到 **10 张真实脱敏样本**（MVP-ACCEPTANCE 门槛），再扩到计划门的 2+1 与 100 张。
2. **法务**：签样本使用授权/数据处理协议；原件只在本机加密盘，**不进仓、不进日志、不进会话**。
3. **Data Steward**：按 REQ §7 脱敏（名称→ENT-A/B、税号重算、票号 20 位重编、金额×0.87、商品名标准、账号后 4 位；保留税率/小数位/红蓝关系），出 SHA-256 与 manifest。
4. **复评**：更新 `EVIDENCE.md` 的库存表；达到计划门后，才进入计划轮（BUILD-PLAN + 10 行摘要）。

## 4. 解除条件（四选一）

- **A. 满足计划门**：≥2 企业 + 1 代账 + ≥100 张真票（含分布）+ 脱敏/哈希 → 解除 PARK，进入计划轮；GA 仍须补到 3 客户 + 法务授权。
- **B. 用户书面“先做 synthetic demo”**：可进入计划轮，但 `ACCEPTANCE` 全部标 `synthetic (not counted)`、`STATUS: partial`；**不得**用合成票满足 GA 门，也不得对外承诺 GA。
- **B2. 公开开源样本 demo**：用 [`OPEN-SOURCE-SAMPLES.md`](./OPEN-SOURCE-SAMPLES.md) 的 MIT/Apache 样本（ofdrw / invoice-github）做 parser/public demo；`ACCEPTANCE` 标 `public (not counted)`、`STATUS: partial`；**不替代**客户门，GA 仍需真实样本；含 PII 的样本必须脱敏后才能进仓。
- **C. 2026-11-12 仍无伙伴/样本**：按 ROADMAP 只做 beta、不追 GA；若 PO 判定无路径 → 写 `DROP.md`。

**不接受**：公开渠道爬取发票、伪造票、把演示数据冒充真实样本、用 1 家 LOI + 10 份样本替代 SKU-04 的 100 张门（REQ §9 明确“不达标不发版”）。

## 5. 本轮不做什么

- B2 只允许**计划轮**（`BUILD-PLAN-04` 已写），不建插件仓、不写业务代码，直到计划门通过。
- 不生成假“真票”夹具；public/synthetic 必须显式标注 `not counted`，不得冒充真实客户样本。
- 不修改 15 SKU 名单/季度/定价/验收门；不写 `CONFLICT.md`（这是证据门，不是范围/季度冲突）。

## 6. 需要谁决定

- **决定人**：用户 / PO / GTM。
- **最小继续条件**：按 §4 A（满足计划门）、B（书面 synthetic）或 B2（公开样本 demo，标 not counted）。
- **下一次复查**：2026-11-12（STATUS T7 的设计伙伴/样本检查点）。

## 7. 与现有产品的关系（2026-10-31 补）

- `PerryLink/dsh-invoice-ledger`（Apache-2.0，v0.1.1）已覆盖“发票台账级”核对（重复报销/价税勾稽/抬头/日期/占位符）；SKU-04 只做**文件级**解析→回执→归档，不重写台账/查重。详见 [`PRIOR-ART-OVERLAP.md`](../PRIOR-ART-OVERLAP.md)。
- 若 SKU-04 需要台账导入/核对，直接依赖 `dsh-invoice-ledger` 或复用其重复键设计（代码+号码，不用金额），不要另造第二套规则。
