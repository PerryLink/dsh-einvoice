# Troubleshooting — dsh-einvoice

每条错误都按 **症状 / 原因 / 动作** 三行写。错误格式：`<一句人话>（E_INV_…）｜下一步：<一个动作>`。
原件与索引在 `$DSH_HOME/storages/dsh-einvoice/`；报告问题时只发**合成**样例，不要附加真实发票或客户数据。

---

## E_INV_FILE_UNREADABLE — 找不到这个发票文件

- **症状**：`invoice.ingest` 提示「找不到这个发票文件（E_INV_FILE_UNREADABLE）｜下一步：…」。
- **原因**：路径写错、文件被移动；或文件 0 字节 / 超过 50 MB。
- **动作**：确认路径存在且在输入根目录内；先用自带样例 `samples/quickstart/input/invoice-a.xml` 跑通，再换自己的文件。

## E_INV_PATH_NOT_ALLOWED — 路径不在允许的输入目录里

- **症状**：提示「这个路径不在允许的输入目录里（E_INV_PATH_NOT_ALLOWED）」。
- **原因**：文件不在输入根目录下（根目录缺省是启动进程的 cwd，可用 `DSH_EINVOICE_INPUT_ROOTS` 配，多个用路径分隔符隔开）。
- **动作**：把文件放进输入根目录，或设置 `DSH_EINVOICE_INPUT_ROOTS` 指向它所在目录后重试。

## E_INV_DUP_CONFLICT — 这张发票已经入过池了

- **症状**：`invoice.parse` 提示「这张发票在这个主体下已经入过池了（E_INV_DUP_CONFLICT）」。
- **原因**：同一 `entity_id` 下发票号唯一；这是防重复入池的保护，不是解析失败。
- **动作**：用 `invoice.query` 查已有记录；若确属两个主体各报一次，改用不同的 `entity_id` 再解析（自带样例演示的就是这种跨主体查重）。

## E_INV_OFD_UNSUPPORTED — 这不是可识别的 OFD

- **症状**：提示「missing OFD.xml」或「no recognized invoice XML in OFD」。
- **原因**：ZIP 不是 OFD，或 OFD 里既没有 `Attachs/original_invoice.xml`，也没有 `Tags/CustomTag.xml`。
- **动作**：确认文件是开票方下载的原始 `.ofd`；必要时让开票方重新下载。PDF/图片发票不支持。

## E_INV_XML_SCHEMA_DRIFT — 字段对不上

- **症状**：提示 `total != amount + tax` 或「parser failed」。
- **原因**：价税合计 ≠ 金额 + 税额，或 XML 结构与本包支持的两种票面不一致。
- **动作**：对照 `field_evidence` 看每个字段来自哪个节点；先确认票面没有被二次编辑。

## E_INV_FIELD_MISSING — 缺字段

- **症状**：提示 `missing fields: …` 或某个字段「has no text」。
- **原因**：票面缺购销方/税号/日期等必填项，或自定义标签里的 `ObjectRef` 找不到对应文本对象。
- **动作**：核对原文件；本包按「缺就报错」处理，不猜值。

## E_INV_STORAGE_FAILED — 文件存不下

- **症状**：提示「cannot store original」。
- **原因**：写入目录不可写（权限、只读挂载、磁盘满）。
- **动作**：把 `DSH_EINVOICE_HOME` 指向可写目录后重试。

---

## 装不上 / 启用不了

- **症状**：`dsh plugin add dsh-einvoice` 报版本不满足。
- **原因**：Node 或 DSH 版本低于包要求（`node >=24.9 <25`，`dsh >=0.2.1-rc.3 <0.4.0`）。
- **动作**：`node --version`、`dsh --version` 各看一次；升级后重试，并用 `--dump-config | grep dsh-einvoice` 确认已启用。

## 结果看起来不对

- 先看 `field_evidence`（字段来自哪个部件/节点）和 `unknown_fields`（票面里有、但本包不用的字段）。
- 本包**不联网、不做验真**：`invoice.record_receipt` 只记录本地回执，`tax_verified=false`。
- 金额一律用整数分做勾稽，避免浮点误差。

## 跑测试

```sh
pnpm install --frozen-lockfile
pnpm build && node --test test/*.test.mjs
```

6 项 skip 是公开样本缺失导致的正常跳过，不是失败。

## 报告

到 <https://github.com/PerryLink/dsh-einvoice/issues> 提交：包版本、工具调用、报错原文、一份**合成**发票。真实发票请先脱敏，或只描述结构。
