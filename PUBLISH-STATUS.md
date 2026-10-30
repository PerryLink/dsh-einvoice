# PUBLISH-STATUS — npm 0.1.0-alpha.0

状态：**published (alpha)** · 2026-10-31T01:02+08:00
包：`@perrylink/dsh-einvoice@0.1.0-alpha.0`

## 结果

- `npm publish --access public --tag next --registry=https://registry.npmjs.org/` 最终成功；npm 在首次发布时创建了临时 `0.0.0-stage` 占位符，几分钟后真实版本可见。
- `npm view @perrylink/dsh-einvoice dist-tags version --json`：
  - `latest: 0.1.0-alpha.0`
  - `next: 0.1.0-alpha.0`
  - `version: 0.1.0-alpha.0`
- tarball shasum：`81912733aa84c7144cd5b12c0b18c694339b88d7`
- owner：`perrylink <novelnexusai@outlook.com>`；access：public。
- 没有执行 `npm unpublish` / `npm deprecate` / `npm stage approve`。

## registry install smoke

- 临时 `DSH_HOME` 中 `dsh plugin add @perrylink/dsh-einvoice@0.1.0-alpha.0` 成功安装，`--dump-config` 出现 `# == @perrylink/dsh-einvoice` 层；remove 后层消失。

## 注意

- 因为这是包的**第一个也是唯一一个版本**，npm 把 `latest` 也指向了 `0.1.0-alpha.0`；这不是 GA。下一版 GA `0.1.x` 发布时再用 `latest` 覆盖，README/市场文案不得把 alpha 说成 GA。
- `0.0.0-stage` 是 npm 首次发布/处理期间出现的临时占位符，真实版本可见后已不再作为安装目标；不要手动删除它。
- 下一步：用 registry 安装做一次 profile 冒烟；S2 再做 dedup/verify/receipt。

## 0.1.0-alpha.1 — submitted 2026-10-31T01:08+08:00

- `npm publish --access public --tag next --registry=https://registry.npmjs.org/` → exit 0; server accepted; tarball shasum `f16de997ead1ed64c2de7ff255553f597f37023a`.
- At 01:10 the registry still showed `next: 0.1.0-alpha.0`; the new version was processing. Re-check `npm view @perrylink/dsh-einvoice dist-tags` before announcing it.
- No unpublish/deprecate; `latest` remains `0.1.0-alpha.0` (still alpha, not GA).

### Update 2026-10-31T01:12+08:00

- `dist-tags` now `{ latest: "0.1.0-alpha.0", next: "0.1.0-alpha.1" }`; `npm view @perrylink/dsh-einvoice@0.1.0-alpha.1 version` returns `0.1.0-alpha.1`.
- `0.1.0-alpha.1` is installable from the registry; `latest` intentionally remains the older alpha (there is no GA yet).

## 0.1.0-alpha.2 — submitted 2026-10-31T01:16+08:00

- `npm publish --access public --tag next --registry=https://registry.npmjs.org/` → exit 0; server accepted; tarball shasum `aceb20e5843e2b5f692d9a05981977328e89e6d6`.
- At 01:17 UTC+8 the registry still showed `next: 0.1.0-alpha.1`; alpha.2 was processing. Re-check before announcing.
- No unpublish/deprecate; `latest` remains `0.1.0-alpha.0` (not GA).

### Update 2026-10-31T01:19+08:00

- `dist-tags` now `{ latest: "0.1.0-alpha.0", next: "0.1.0-alpha.2" }`; `npm view @perrylink/dsh-einvoice@0.1.0-alpha.2 version` returns `0.1.0-alpha.2`.
- Registry install smoke (`dsh plugin add ...@0.1.0-alpha.2`) passed; layer removed after.
