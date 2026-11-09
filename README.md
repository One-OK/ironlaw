# IronLaw

**把工程纪律变成机器。**

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

## 来源

从一条商业化软件产品线的真实工程史里提炼——那里积累了 89 个门禁脚本、838 行变更纪律、以及一长串踩过的坑：假绿（跳过却算通过）、假红（超时被当成判据失败）、真因被正则吞掉、台账手抄脱节、并行发布线互相覆盖、`push` 成功但没部署。

IronLaw 抽的是这些坑背后的**机制**，不是那套业务代码。所以它对任何需要「改动可信」的项目都成立。

## 这套东西不做什么

- 不替你决定产品怎么做——它只管「改动是否可信」。
- 不追求门禁数量——跑不完的门禁等于不存在。
- 不假装成功——「push 成功」≠「部署了」，「脚本说 OK」≠「线上是新的」。

## License

MIT
