# BLOCKED — SKU-04 计划轮（证据门）

> 2026-10-31：B2 public demo 获用户批准，`BUILD-PLAN-04` 已写；本 BLOCKED 仅保留“客户门仍 PARK”的记录，不再阻塞计划轮。

状态：**blocked** · 时间：2026-10-30T13:03+08:00
关联：[EVIDENCE.md](./EVIDENCE.md) · [PARK.md](./PARK.md)

## 卡点

真实样本/设计伙伴低于 SKU-04 证据门：**0 个独立源、0 张真票、0 份法务授权**；计划门要求 ≥2 企业 + 1 代账 + ≥100 张真票（GA 目标 3 客户 + 1 代账 + 法务授权）。

## 已试

1. 有界搜索 `01-research/dsh-plugin-gap-2026-10-29`、`00-live`、`02-playbooks`（`*.ofd`/`*invoice*`/`*发票*`）→ 仅命中 DESIGN/REQ 文档。
2. 查 `program/STATUS.md` → “设计伙伴 0 家在册”、Q1 建设未启动。
3. 全 hub 全盘 `find` 在 `/mnt/d` 上 60s 超时；沿用 2026-10-29 全盘扫描结果 0（见 `04-build/ENV.md`）。
4. 复核 `REQ-EINVOICE §7/§9`、`DESIGN §9/§10`、`ROADMAP`、`CHECKLISTS/MVP-ACCEPTANCE.md` 的门槛，未见可替代来源。

## 需要谁决定

用户 / PO / GTM：提供满足门的样本与授权，或书面同意“先做 synthetic demo”，或按 ROADMAP 降级/放弃。

## 最小继续条件

- A：≥2 企业 + 1 代账 + ≥100 张真票（60/25/10/5）+ 脱敏与 SHA-256 → 进入计划轮。
- B：用户书面“先做 synthetic demo” → 进入计划轮，但 `ACCEPTANCE` 全标 `synthetic (not counted)`、`STATUS: partial`。
- C：2026-11-12 仍无伙伴/样本 → 只做 beta 或 `DROP.md`。

## 本轮未做

`BUILD-PLAN-04`、插件仓、代码、假样本、验收脚本均未创建。
