# AGENTS.md · <项目名>

> 本文件是项目的执行规范。任何 Agent / 成员 / 会话都必须遵循；与临时做法冲突时以本文为准。
> 方法论来源：WorkBuddy 技能 `ironlaw-change` / `ironlaw-gate` / `ironlaw-record` / `ironlaw-ship`。

## 0 开工必做

1. **先同步再动手**：`git fetch && git log --oneline HEAD..origin/main`，看清远端有没有前进。
2. **推送只用安全脚本**，永不 force。
3. **部署只在本地执行**，不依赖 CI 自动上线。

## 1 项目事实（填实，别留占位）

- 仓库 / 分支：
- 应用与目录：`apps/web`（前端）｜`apps/api`（后端）｜...
- 版本真源：根 `package.json` / `apps/web/package.json` / `apps/api/package.json`，三处必须同号
- 版本 bump：只用 `npm run bump:version`（禁止手改，手改是三处不一致与 BOM 的共同根源）
- 包管理器与锁文件：
- 部署方式：<平台 / 命令>
- 线上版本接口：`GET <url>` → 字段 `version`

## 2 验收门（唯一的"绿"）

| 层 | 命令 |
|---|---|
| 后端类型 | `npx tsc --noEmit --incremental false` |
| 前端类型 | `npx vue-tsc --noEmit`（或 `tsc --noEmit`） |
| 单测 | `npx jest --runInBand` / `npx vitest run` |
| 构建 | `npm run build` |
| 门禁 | `node scripts/check-all.mjs`（日志末尾必须有 `EXIT=0`） |

不允许用 `npx eslint` 之类"坏掉但没人修"的工具当门禁——要么修好，要么移除。

## 3 数据与安全铁律

- 禁止提交 `.env` / 真实数据库 / 任何密钥；新增配置走 `.env.example`
- 判断字段语义以**写入路径代码**为准，dev 库采样只能作佐证且标注样本量
- 权限过滤必须 `AND: [scopeWhere, cond]`，禁止 `where.OR = [...]`（会覆盖作用域 → 越权）
- create/update 必须校验目标对象归属，不能只校验源对象
- 用户可见文案禁止工程话术："实体"叫"数据表格"；不写"待接入/未映射/见日志"

## 4 结构与术语

- 菜单/导航/路由/默认落地页的增删改 = 信息架构变更，**必须先取得产品明确批准**
- 改名/迁移/合并：只改唯一真源，`path` 与 `legacyPaths` 成对交换，旧词全仓零残留
- 术语必须跨行业通用，不自造行业黑话

## 5 改动纪律

见 `docs/CHANGE-DISCIPLINE.md`。摘要：

- 四条铁律：fail-closed / 反向探针 / 单一真源 / 机器算覆盖率
- 开工六问，答不全不动手
- 五段：验证设施免责 → 动手前 → 修复中 → 复检 → 固化
- 重产品代码的改动必须写变更档案（七段 + §2.5 断言）

## 6 上线

见技能 `ironlaw-ship`。摘要：

- 推送 ≠ 上线；出包到分发通道 + manifest 登记才算发版
- 顺序：bump → commit → push → 门禁 → 出包 → 台账 → 部署 → 复验 → 回填
- 部署后必须对**线上接口**核验，不是看部署脚本日志

## 7 已知坑（持续追加，不整篇重写）

| 坑 | 现象 | 修法 |
|---|---|---|
|  |  |  |
