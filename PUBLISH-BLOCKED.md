# PUBLISH-BLOCKED — npm 0.1.0-alpha.0 等待 2FA/批准

状态：**blocked (npm only)** · 2026-10-31T01:00+08:00
包：`@perrylink/dsh-einvoice@0.1.0-alpha.0`
本地状态：build/lint/typecheck/test/gate 全绿；tarball 已生成；npm 发布命令返回 exit 0。

## 已发生

- `npm publish --access public --tag next --registry=https://registry.npmjs.org/`：
  - `PUT https://registry.npmjs.org/@perrylink/dsh-einvoice` → **202**
  - npm 打印 `+ @perrylink/dsh-einvoice@0.1.0-alpha.0`
  - tarball shasum `81912733aa84c7144cd5b12c0b18c694339b88d7`
- 但 registry 根元数据仍 **404**；`/-/package/@perrylink/dsh-einvoice/dist-tags` 返回
  `{"latest":"0.0.0-stage"}`。
- `npm access get status @perrylink/dsh-einvoice` → `public`；`npm owner ls` → `perrylink <novelnexusai@outlook.com>`。
- `npm stage list @perrylink/dsh-einvoice` → `[]`；全量 stage list 里没有该包。
- npm 文档：当 staged publish 一个**尚不存在**的包时，registry 会先发一个公开占位版本 `0.0.0-stage`；真正的 staged 版本要 maintainer 用 **2FA** 批准后才公开（<https://docs.npmjs.com/staged-publishing/>）。

## 判定

`0.0.0-stage` 占位符 + 根元数据 404 + 我们的版本不可见 ⇒ 这是一次 **staged publish / 待批准**，不是可安装的 live 版本。当前不能从 npm 安装 `0.1.0-alpha.0`。

## 需要你（或 npm 管理员）

1. 打开 <https://www.npmjs.com/> → **Staged Packages**（或包页面），找到 `@perrylink/dsh-einvoice@0.1.0-alpha.0`，用 2FA 点 **Approve**；或
2. 提供有效的 2FA/OTP / trusted publishing 方式，让我用 `npm stage approve <stage-id>` 完成；或
3. 如果占位符是历史遗留、你确认可以清掉：明确授权 `npm unpublish @perrylink/dsh-einvoice@0.0.0-stage` 后再发；**在此之前不删除任何 npm 版本**。

## 未做的事

- 没有 `npm unpublish`、`npm deprecate`、`npm stage approve`（缺 stage-id/2FA）。
- 没有把 `0.0.0-stage` 当作发布成功写进 ACCEPTANCE；S1 仍是 `STATUS: partial`。
