# 一次完整走查：从「金额少两位小数」到线上确认

这份文档演示 IronLaw 在真实改动上的用法。场景是虚构的，但每一步的动作、命令、产出都是可以直接照抄的。

假设你有一个订单系统，用户反馈：**导出的 CSV 里金额少了两位小数，`1234.56` 变成 `12.34`。**

---

## ② change —— 改动纪律

### 开工六问

动手前先回答（与 `ironlaw-change/references/intake.md` 同一口径），答不上来就先查，不要猜：

| # | 问题 | 这次的答案 |
|---|---|---|
| 1 | **缺数据行为**：金额为空 / null / 非整数分时，判红还是判绿？ | 现状判绿（直接输出 `undefined`）；修复后 `formatMoney` 对非法输入显式判红 |
| 2 | **根因位置**：真源在哪（不是症状出现的地方）？ | **两处实现**：`formatMoney()` 和导出模块里的内联 `amount / 100` —— 单位口径没有唯一真源 |
| 3 | **影响链**：六类（渲染/契约/产物/测试/文档/联动）哪些跟着变？ | 渲染（页面 4 处）、产物（CSV/打印/报表）、测试（断言旧字符串）、文档（AGENTS.md） |
| 4 | **失败可见性**：改坏了谁先发现？多久？ | 修复前没人发现（导出直接错给客户）；修复后 `check-money-format` 在提交前拦 |
| 5 | **反向变异**：把修复去掉，哪条断言转红？ | §2.5 断言 #2（视图层裸用 =0）与 #3（导出走格式化） |
| 6 | **裁定归属**：哪些要用户/产品拍板？ | 金额展示口径（千分位 / 币种符号 / 舍入方式）——列选项一次问完，不自作主张 |

第 2 问就是根因入口。

### 根因

不要停在「少除以 100」。往上追：

```text
现象：CSV 少两位小数
  ↑ 导出模块直接写了 amount（整数分），没有走格式化
  ↑ 导出模块是后加的，作者不知道 amount 是整数分
  ↑ 项目里没有类型约束标明「分」，靠命名偶然传达
根因：金额单位没有单一真源，靠约定口头传播
```

所以修法不是「在导出里补 `/100`」——那样第三个人加导出时还会错。真修法：

**收口成一个 `formatMoney(cents)`，任何展示或导出一律走它，并加守卫禁止裸用 `amount`。**

### 影响链六类

（与 `ironlaw-change` 技能、`references/intake.md` 同一口径：渲染 / 契约 / 产物 / 测试 / 文档 / 联动）

```text
① 渲染点：页面金额展示 4 处，全部改为调用 formatMoney（同类表单/页面横向普查在这里做）
② 契约点：接口仍返回整数分，不改契约——格式化只在展示层；「未触及」也要写明，没写 = 没想过
③ 产物点：CSV 导出、打印模板、报表模板（最容易漏的一类，客户拿到的是导出的单证）
④ 测试点：断言旧字符串的单测同批更新，不许绿着断言旧语义
⑤ 文档点：AGENTS.md 记一条「金额一律用分」
⑥ 联动点：watch / 派生 / 缓存失效——grep 确认未触及并记录
```

产物点（③）最容易漏。应该真的去 `grep`，而不是「应该没问题」。

---

## ③ gate —— 门禁工程

修完代码，把这次的判据钉成机器可查的东西。

### 起手

```bash
cp plugins/ironlaw/skills/ironlaw-gate/assets/guard-skeleton.mjs scripts/check-money-format.mjs
```

通常只改 `RULES` 数组（规则表）即可；判据结构特殊时再改 `evaluate()`。骨架内建：单一真源 `evaluate()`、缺目录 fail-closed、`--selftest` 五条探针（含反向探针）、`--json`。

### 判据（唯一真源）

```js
// scripts/check-money-format.mjs —— 只改 RULES，其余骨架原样保留
const RULES = [
  {
    id: 'no-raw-amount-in-views',
    desc: '视图层不得裸用 amount（必须经 formatMoney）',
    scope: 'src/views',
    ext: ['.ts', '.tsx', '.vue'],
    pattern: /\bamount\b(?!Cents)/g,
    expect: 'absent',          // 零残留
  },
  {
    id: 'no-raw-amount-in-export',
    desc: '导出模块不得裸用 amount（整数分必须经换算）',
    scope: 'src/export',
    ext: ['.ts'],
    pattern: /\bamount\b(?!Cents)/g,
    expect: 'absent',
  },
  {
    id: 'format-money-exists',
    desc: 'formatMoney 唯一实现存在',
    scope: 'src/utils',
    ext: ['.ts'],
    pattern: /export function formatMoney/g,
    expect: 'present',         // 必须存在
    min: 1,
  },
];
```

### 三个必须做的验证

```bash
# 1. 自证：干净样本放行、脏样本判红、边界样本符合预期
node scripts/check-money-format.mjs --selftest

# 2. 正式扫描
node scripts/check-money-format.mjs

# 3. 反向探针：改坏必须转红
```

反向探针配置（`find` 必须在文件里精确命中，命中数默认必须为 1）：

```json
{
  "file": "scripts/check-money-format.mjs",
  "cmd": "node scripts/check-money-format.mjs",
  "cases": [
    { "label": "视图层零残留判据被改成永不命中",
      "find": "ext: ['.ts', '.tsx', '.vue'],\n    pattern: /\\bamount\\b(?!Cents)/g,",
      "replace": "ext: ['.ts', '.tsx', '.vue'],\n    pattern: /__NEVER_MATCH__/g," },
    { "label": "存在性判据被改成永不命中",
      "find": "pattern: /export function formatMoney/g,",
      "replace": "pattern: /__NEVER_MATCH__/g," }
  ]
}
```

```bash
node plugins/ironlaw/skills/ironlaw-gate/scripts/reverse-probe.mjs --config probe.json
```

期望输出：

```text
  ✓ 视图层零残留判据被改成永不命中：转红（exit=1）且复原一致
  ✓ 存在性判据被改成永不命中：转红（exit=1）且复原一致
[reverse-probe] OK：2 个案例全部「变异转红 + 逐字节复原」
```

**如果变异后仍然全绿，说明这道门禁是假的** —— 它拦不住任何东西，只是给人心理安慰。这时不要继续，回去重写判据。

### 注册

```js
// scripts/check-guards.mjs 的 REGISTRY 里加一行
{ file: 'check-money-format.mjs', name: '金额单位单一真源', timeoutMs: 60_000 }
```

不注册的门禁等于不存在——聚合器根本不会跑它。

---

## ④ record —— 变更档案

### 七段档案

```bash
cp plugins/ironlaw/skills/ironlaw-record/assets/change-record-template.md \
   docs/change-records/2026-11-10-fix-money-export.md
```

关键是 **§2.5 断言表**，它是「影响链已闭环」的机器证明：

```markdown
| # | 断言 | 检索式（JS 正则） | 范围 | 期望 |
|---|------|------------------|------|------|
| 1 | 格式化函数唯一 | `export function formatMoney` | src | =1 |
| 2 | 视图层不再裸用 amount | `\bamount\b(?!Cents)` | src/views | =0 |
| 3 | 导出模块已走格式化 | `formatMoney\(` | src/export | >=1 |
| 4 | 移动端同步修复 | `formatMoney\(` | mobile/src | >=1 |
| 5 | 报表模板同步修复 | `formatMoney\(` | src/reports | >=1 |
```

第 5 条最容易漏。写档案的过程就是发现自己漏改的过程——这正是它的价值。

### 校验

```bash
node plugins/ironlaw/skills/ironlaw-record/scripts/verify-record.mjs \
  docs/change-records/2026-11-10-fix-money-export.md
```

```text
[verify-record] docs/change-records/2026-11-10-fix-money-export.md
  ✓ #1 格式化函数唯一：1 行（期望 =1）
  ✓ #2 视图层不再裸用 amount：0 行（期望 =0）
  ✓ #3 导出模块已走格式化：2 行（期望 >=1）
  ✓ #4 移动端同步修复：1 行（期望 >=1）
  ✗ #5 报表模板同步修复：0 行（期望 >=1）

[verify-record] FAIL：1 项不合格
  - 断言 #5（报表模板同步修复）不成立：期望 >=1，实际 0 行
```

**这就是它有用的地方**：第 5 条红了，说明报表模板漏改。回去改代码，不是改断言。

> 铁律：断言红了就改代码。放宽断言让它变绿，等于把测量仪器砸了。

### 覆盖闭环（「没有漏键」的机器证明）

`verify-record` 证明「写下的断言成立」；`impact-scope` 证明「没有漏键」（铁律四的机器侧）：

```bash
node plugins/ironlaw/skills/ironlaw-record/scripts/impact-scope.mjs \
  --base <基线提交> --record docs/change-records/2026-11-10-fix-money-export.md
```

```text
[impact-scope] <基线>..HEAD：11 个文件 → 4 个范围键（depth=2）
  ✓ src/views（4 个文件）— 断言范围：src/views
  ✓ src/export（2 个文件）— 断言范围：src/export
  ✓ src/utils（1 个文件）— 断言范围：src
  ✗ src/reports（2 个文件）— 未被任何断言范围覆盖，§2.6 也没有提到

[impact-scope] FAIL：1 个范围键未闭环
```

`src/reports` 被点名——和 §2.5 断言 #5 红的是同一个漏改。两条独立的机器路径咬合同一个真相，这才叫闭环。

### 提交信息

```text
fix(export): CSV 金额少两位小数

根因: 金额单位没有单一真源。amount 存整数分，但项目里靠命名口头传达，
导出模块后加时不知道，直接输出了裸 amount。修法不是补一处 /100，
而是收口成 formatMoney() 唯一入口，并加守卫禁止视图层裸用。

影响链: ① 新增 src/utils/money.ts#formatMoney 唯一实现；
② 视图层 4 处、导出 2 处、报表 3 处、移动端 1 处改为调用它；
③ 新增 check-money-format.mjs 守卫，注册进聚合器；
④ AGENTS.md 记「金额一律用分」；
⑤ 无数据迁移，单提交可回滚。

验证: check-money-format --selftest 4/4 且正式扫描 0 违规；
reverse-probe 2 个案例均变异转红且 md5 复原；verify-record 5/5 断言成立；
check-all 全量门禁 EXIT=0；导出对比 3 个订单金额与页面一致。
```

---

## ⑤ ship —— 上线闭环

```bash
# 1. bump 版本（三处一致；脚手架自带 bump-version.mjs，禁止手改）
node scripts/bump-version.mjs minor

# 2. 提交
git commit -F .workbuddy/artifacts/commit-msg.txt

# 3. 推送（脚手架自带 safe-push.sh：对账 + 快进合并 + 推送 + 三判据，永不 force）
bash scripts/safe-push.sh
# 手工推送时按三判据逐条核对：
git push origin main; PUSH_RC=$?      # 单独捕获，禁止管道
git reflog show origin/main | head -1  # 本地视角
git ls-remote origin refs/heads/main   # 远端视角
```

三个结果一致才算推上去了。

```bash
# 4. 出包 / 部署
npm run build && ./scripts/deploy.sh

# 5. 四方真值核验
node plugins/ironlaw/skills/ironlaw-ship/scripts/ship-truth.mjs --config ship.json
```

```text
[ship-truth] 本地版本 1.4.2
  ✓ 版本一致：PASS — 1.4.2（3 处）
  ✓ 工作区干净：PASS — 无未提交改动
  ✓ 本地 = 远端：PASS — abc1234de
  ✓ 线上版本：PASS — 1.4.2
  ✓ 分发版本：PASS — 1.4.2
  ✓ 台账已登记：PASS — 最近 40 行含 1.4.2

[ship-truth] 6 通过 / 0 不一致 / 0 无法判定 / 0 跳过
```

### 卡住的时候看这里

| 症状 | 通常是什么 |
|---|---|
| 线上版本 = 旧版 | 部署了但没生效；或部署的是另一条线 |
| 本地 = 远端 红 | 忘了 push，或 push 到了别的分支 |
| 分发版本 = 旧版 | 出了包但没上传，或上传到了别的通道 |
| 台账红 | 手抄件与机读源脱节 |

---

## 收尾检查

改完之后问自己四个问题：

1. 根因是一句话机制，还是只是复述了症状？
2. 影响链是机器算的覆盖率，还是「我觉得都改了」？
3. 新守卫做反向探针了吗？改坏真的会红吗？
4. 线上真值是接口返回的，还是部署脚本说的？

四个都答得实，这次改动才算闭环。
