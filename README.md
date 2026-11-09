# IronLaw

**把工程纪律变成机器。**

`https://github.com/One-OK/ironlaw`

在线读（不用装也能看懂）：**https://one-ok.github.io/ironlaw/**

一套 WorkBuddy Skill 套件。解决一个具体问题：

> AI 和人都能很快写出「看起来对」的代码，但没人能证明它真的对。

IronLaw 不提升写代码的速度，它提升的是**「这次改动可信」的可证明程度**。做法是把每一次判断都落成机器能查的东西：门禁、断言、真值核验。

## 装了什么

| 技能 | 一句话 |
|---|---|
| `ironlaw` | 总入口，一句话路由到下面五个 |
| `ironlaw-change` | 改动纪律：开工六问 → 根因 → 影响链 → 修复 → 复盘 |
| `ironlaw-gate` | 门禁工程：把判据钉成机器可查的守卫，并证明改坏会转红 |
| `ironlaw-record` | 变更档案：七段档案 + 机器可执行断言表 + 三段式提交信息 |
| `ironlaw-ship` | 上线闭环：推送 → 出包 → 部署 → 线上真值核验 → 台账 |
| `ironlaw-bootstrap` | 项目脚手架：给新仓库一次性铺钩子、门禁、共享件、文档 |

外加 **6 个斜杠命令** 和 **3 个零依赖的 Node 工具**。

## 四条铁律

整套东西立在四条铁律上。违反任何一条，其余部分就退化成「文档」：

1. **必填必须 fail-closed** —— 缺文件、缺章节、空数据分支必须判红。放行等于条款不存在。
2. **新守卫必须带反向探针** —— 去掉保护必须转红，且能逐字节复原。不验证「改坏会红」的守卫等于没有守卫。
3. **跨脚本口径放单一真源** —— 同一个判定只能有一份实现，禁止两份正则互相掩护。
4. **影响链用机器算的覆盖率逐键闭环** —— 漏掉的键必须点名，不许用「都检查过了」结案。

## 五段流程

```
① bootstrap  一次性：把设施铺好（新项目才需要）
      ↓
② change     每次改动：开工六问 → 根因 → 影响链 → 修复
      ↓
③ gate       把这次判据钉成机器可查的守卫
      ↓
④ record     七段档案 + §2.5 断言 + 三段式提交信息
      ↓
⑤ ship       推送 → 出包 → 部署 → 线上真值核验 → 台账
```

不必每次五段全跑：

- 改一行文案 → 只跑 ②
- 改产品代码 → ②③④⑤
- 只加门禁 → ②③④
- 新项目 → ①，等第一次真实改动再走 ②

## 三个能跑的工具

不是示例，是能直接用的东西。无第三方依赖。

```bash
# 反向变异：改坏 → 必须转红 → 逐字节复原
node plugins/ironlaw/skills/ironlaw-gate/scripts/reverse-probe.mjs --config probe.json

# 执行变更档案的 §2.5 断言表，逐条报告
node plugins/ironlaw/skills/ironlaw-record/scripts/verify-record.mjs docs/change-records/xxx.md

# 四方真值核验：本地 / 远端 / 线上 / 分发
node plugins/ironlaw/skills/ironlaw-ship/scripts/ship-truth.mjs --config ship.json
```

## 安装

不想 clone 仓库的话，直接下发行包：**[ironlaw-1.0.0.zip](https://github.com/One-OK/ironlaw/releases/download/v1.0.0/ironlaw-1.0.0.zip)**（122 KB），解压后同样跑 `node scripts/install.mjs`。

### 方式一：一键装进 WorkBuddy（推荐）

拿到仓库后执行一次：

```bash
node scripts/install.mjs
```

它会做四件事：包自检 → 复制 6 个技能到 `~/.workbuddy/skills/` → 装后复验 → 打印可用命令。

常用参数：

```bash
node scripts/install.mjs --dry-run        # 只看会做什么，不改文件
node scripts/install.mjs --prune-legacy   # 顺手把旧版散装技能归档（不删除）
node scripts/install.mjs --list           # 列出包内容
node scripts/install.mjs --target <dir>   # 装到项目级 .workbuddy/skills
```

装完**重启 WorkBuddy 会话**才会被扫描到。

### 方式二：作为插件 marketplace 挂载

仓库根有 `.codebuddy-plugin/marketplace.json`，`plugins/ironlaw/` 是完整插件（含 `commands/` 与 `skills/`）。
在 WorkBuddy 的插件市场里以「目录」形式添加本仓库根目录即可。

**两种方式的差别**：方式二会额外启用 `commands/`，斜杠命令带参数提示（`argument-hint`）；
方式一下技能名本身就是斜杠命令，功能一致，但没有参数提示。

### 方式三：只要技能文件

```bash
cp -r plugins/ironlaw/skills/* ~/.workbuddy/skills/
```

## 怎么调用

装好重启后，三种调用方式都成立：

| 方式 | 例子 | 说明 |
|---|---|---|
| **斜杠命令** | `/ironlaw-change` | 直接调起对应技能 |
| **快捷短语** | 「用铁律修这个 bug」 | 命中 description 里的触发词 |
| **自然语言** | 「这个门禁老假红怎么办」 | 技能描述匹配后自动加载 |

不确定用哪个就走总入口：

```
/ironlaw
```

或者直接说「走一遍铁律流程」，它会先问清这次属于哪一段，再加载对应技能。

## 快速开始

**新项目：**

```bash
node plugins/ironlaw/skills/ironlaw-bootstrap/scripts/init-project.mjs /path/to/new-repo
```

**已有项目只补纪律：** 读 `ironlaw-change`，从「开工六问」开始，第一次改动就把 ②③④ 走一遍。

**只想加一道门禁：**

```bash
cp plugins/ironlaw/skills/ironlaw-gate/assets/guard-skeleton.mjs scripts/check-<topic>.mjs
# 改三处：evaluate / ROOTS / covers
```

## 文档

- [`docs/walkthrough.md`](docs/walkthrough.md) —— **一次完整走查**：从「金额少两位小数」到线上确认，五段是怎么走的，每一步的命令和产出长什么样。**第一次用就从这里开始。**
- [`README.en.md`](README.en.md) —— English version
- [`CHANGELOG.md`](CHANGELOG.md) —— 版本变化

## 来源

从一条商业化软件产品线的真实工程史里提炼——那里积累了 89 个门禁脚本、838 行变更纪律、以及一长串踩过的坑：假绿（跳过却算通过）、假红（超时被当成判据失败）、真因被正则吞掉、台账手抄脱节、并行发布线互相覆盖、`push` 成功但没部署。

IronLaw 抽的是这些坑背后的**机制**，不是那套业务代码。所以它对任何需要「改动可信」的项目都成立。

## 这套东西不做什么

- 不替你决定产品怎么做——它只管「改动是否可信」。
- 不追求门禁数量——跑不完的门禁等于不存在。
- 不假装成功——「push 成功」≠「部署了」，「脚本说 OK」≠「线上是新的」。

## License

MIT
