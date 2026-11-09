---
name: ironlaw-bootstrap
description: 给新项目（或缺少纪律设施的老项目）一次性铺设工程纪律骨架。当用户说「开个新项目」「初始化仓库」「把规范铺上」「这个项目也要有门禁」「整理开发流程」，或准备从零开发一个可交付项目时使用。提供可直接运行的安装器（钩子 + 门禁 + 共享件 + 文档模板）、渐进落地路线、目录契约，避免一上来铺 80 个门禁导致没人跑。触发词：新项目、初始化、脚手架、bootstrap、scaffold、搭骨架、铺规范、项目模板、setup repo。
display_name_zh: 铁律 · 项目脚手架
display_name_en: IronLaw · Project Bootstrap
agent_created: true
---

# 新项目纪律脚手架

## 这个技能解决什么

纪律设施的价值随项目寿命增长，但**建它的成本必须在第一天就付**——否则后面每加一次都要停下业务。

反过来说：第一天就把 89 个门禁全铺上，也没人跑得动（一次全量 20 分钟）。所以正确做法是**最小可用集合 + 按事故增长**。

本技能提供一套已经跑通的骨架，装完即可用；后续按项目实际需求往里加规则，而不是一次抄完。

## 五步落地

```bash
# 1. 装脚手架（幂等，不覆盖已有文件）
node <skill>/scripts/init-project.mjs /path/to/repo

# 2. 自证：确认装的东西真的在守
cd /path/to/repo
node scripts/check-guards.mjs --selftest

# 3. 全量门禁：建仓当天就应该绿（末尾必须是独立一行 EXIT=0）
node scripts/check-all.mjs

# 4. 验证钩子真能拦
#    故意写一条不合格提交信息，pre-push 必须 exit 1
git commit --allow-empty -m "update stuff" && bash .githooks/pre-push; echo $?

# 5. 填实 AGENTS.md 的「项目事实」与「验收门」
```

第 4 步不能跳。**没验证过的钩子等于没装**——很多人装完之后第一次被拦，才发现路径写错了。

## 装了什么

| 文件 | 作用 |
|---|---|
| `.githooks/pre-commit` | 敏感文件/构建产物/硬编码密钥/编码/BOM，秒级 |
| `.githooks/pre-push` | 提交信息三段（整个推送区间）/多包版本一致/落后远端/**档案校验**（`PREPUSH_RECORDS=0` 可关）/可选全量门禁 |
| `scripts/check-encoding.mjs` | UTF-8 无乱码（U+FFFD） |
| `scripts/check-json-bom.mjs` | JSON 无 BOM（BOM 会让 JSON.parse 崩） |
| `scripts/check-commit-discipline.mjs` | 提交信息三段，行首匹配 |
| `scripts/check-guards.mjs` | 注册守卫 + 聚合执行 |
| `scripts/check-all.mjs` | 全量入口，落日志 + `EXIT=` 哨兵；超时/设施错误退出 2，与产品红分开 |
| `scripts/verify-record.mjs` | 变更档案断言校验器（`ironlaw-record` 同源工具，随仓库分发） |
| `scripts/safe-push.sh` | 安全推送：对账 → 快进合并 → 推送 → 三判据，永不 force |
| `scripts/bump-version.mjs` | 多包版本同步 bump（文本替换保格式；缺键 fail-closed） |
| `scripts/lib/gate-runner.mjs` | 失败行抽取/EXIT 码/哨兵，**唯一真源** |
| `.github/workflows/ci.yml.example` | 可选 CI：改名 `ci.yml` 才启用，只跑门禁不部署 |
| `docs/CHANGE-DISCIPLINE.md` | 仓库内可执行摘要 |
| `AGENTS.md` | 项目规范模板（需填实） |
| `ship.json.example` | 上线真值核验配置 |

脚本零依赖（只用 Node 内置模块），不引入任何运行时包。

## 目录契约

```
repo/
├── .githooks/{pre-commit,pre-push}     # git config core.hooksPath .githooks
├── scripts/
│   ├── check-all.mjs                   # 全量入口（步骤表）
│   ├── check-guards.mjs                # 注册表 + 聚合
│   ├── check-*.mjs                     # 各专项守卫
│   ├── verify-record.mjs               # 档案断言校验
│   ├── safe-push.sh                    # 安全推送 + 三判据
│   ├── bump-version.mjs                # 多包同 bump
│   └── lib/
│       ├── gate-runner.mjs             # 失败行/EXIT/哨兵（单一真源）
│       └── <domain-scope>.mjs          # 跨脚本共用的判定口径
├── docs/
│   ├── CHANGE-DISCIPLINE.md
│   └── change-records/                 # 变更档案
└── AGENTS.md
```

**判据单一真源的落点**：任何被两个脚本共用的判定（产品口径/范围键/失败行/版本读取）都放 `scripts/lib/`，别复制。

## 渐进路线（别一次抄完）

| 阶段 | 加什么 | 触发条件 |
|---|---|---|
| 第 1 天 | 上面这 18 个文件 | 建仓 |
| 第 1 周 | 类型检查 + 单测 + 构建进 `check-all` 的 STEPS | 有了第一个可跑的测试 |
| 第 1 月 | 契约检查、禁用词、死代码、权限基线 | 出现第一次"两边不一致" |
| 之后 | **每次事故加一条** | 复盘第 3 问的答案 |

原则：**门禁从事故里长出来，不从清单里抄下来。** 抄来的规则没人认，事故长的规则没人敢删。

## 加第一条自己的规则

```bash
cp <skill>/assets/guard-skeleton.mjs scripts/check-<topic>.mjs
# 只改 RULES 数组
node scripts/check-<topic>.mjs --selftest   # 必须全过
node scripts/check-<topic>.mjs              # 正式扫描
# 然后登记进 check-guards.mjs 的 REGISTRY（否则注册守卫会判红）
```

骨架已内建单一真源 `evaluate()`、缺目录 fail-closed、5 条自证探针（含反向探针）。

## 三条容易装错的

| 坑 | 现象 | 修法 |
|---|---|---|
| 钩子没生效 | 提交时什么都没发生 | `git config core.hooksPath` 是否指向 `.githooks`；文件是否可执行 |
| 骨架铺在错误层级 | 门禁找不到 `scripts/` | 必须铺在**仓库根**，不是子目录 |
| 空仓库门禁红 | 建仓第一次跑门禁就失败 | 提交纪律守卫对"无提交"应显式跳过（脚手架已处理） |

## 验收

装完必须能给出这四组输出：

```
node scripts/check-guards.mjs --selftest   → 4 个守卫各自 selftest 全通过
node scripts/check-all.mjs                 → EXIT=0
bash .githooks/pre-push（不合格消息）      → exit 1
bash .githooks/pre-push（合格消息）        → exit 0
```

四组都拿到，才算装好。

## 资源

- `scripts/init-project.mjs` — 幂等安装器（已实测：空仓库 → 18 文件 → 门禁 EXIT=0 → 钩子拦截；以 `scripts/smoke.mjs` A 组为机器可查凭证）
- `assets/scaffold/` — 全部骨架文件（可直接读改）
- `references/rollout.md` — 渐进落地路线与"什么时候该加门禁"
