# 一次完整走查：从「金额少两位小数」到线上确认

这份文档演示 IronLaw 在真实改动上的用法。场景是虚构的，但每一步的动作、命令、产出都是可以直接照抄的。

假设你有一个订单系统，用户反馈：**导出的 CSV 里金额少了两位小数，`1234.56` 变成 `12.34`。**

---

## ② change —— 改动纪律

### 开工六问

动手前先回答，答不上来就先查，不要猜：

| # | 问题 | 这次的答案 |
|---|---|---|
| 1 | 用户看到的现象是什么？ | 导出 CSV 金额比页面少 100 倍 |
| 2 | 这个值从哪来、到哪去？ | 数据库整数分 → 服务层 → 前端展示 / 导出 |
| 3 | 判定规则有几份实现？ | **两处**：`formatMoney()` 和导出模块里的内联 `amount / 100` |
| 4 | 改完谁会受影响？ | 页面展示、导出、报表、打印模板 |
| 5 | 怎么证明改对了？ | 一条断言 + 一个端到端导出对比 |
| 6 | 改坏了怎么退？ | 单提交回滚，无数据迁移 |

第 3 问就是根因入口。

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

```text
① 签发点 → 消费点：amount 写入是整数分（不变），所有读取点收敛到 formatMoney
② 守卫条件：新增「禁止在视图层直接使用 amount」
③ 配套防护：类型层给 amount 加后缀（amountCents）或注释约束
④ 同类位置横向普查：报表 / 打印 / 邮件模板 / 移动端，逐个确认
⑤ 文档：在 AGENTS.md 记一条「金额一律用分」
⑥ 回滚：单提交，无副作用
```

横向普查最容易漏。第 ④ 项应该真的去 `grep`，而不是「应该没问题」。

---

## ③ gate —— 门禁工程

修完代码，把这次的判据钉成机器可查的东西。

### 起手

```bash
cp plugins/ironlaw/skills/ironlaw-gate/assets/guard-skeleton.mjs scripts/check-money-format.mjs
```

改三处：`evaluate()`、`ROOTS`、`covers`。

### 判据（唯一真源）

```js
// scripts/check-money-format.mjs
export function evaluate(files) {
  const bad = [];
  for (const f of files) {
    const src = stripComments(readFileSync(f, 'utf8'));
    const lines = src.split('\n');
    lines.forEach((line, i) => {
      // 视图/导出层出现裸 amount（不是 amountCents、不是 formatMoney 调用）
      if (/\bamount\b(?!Cents)/.test(line) && !/formatMoney\(/.test(line)) {
        bad.push({ file: f, line: i + 1, why: '金额必须经 formatMoney()，不得裸用 amount' });
      }
    });
  }
  return bad;
}
```

### 三个必须做的验证

```bash
# 1. 自证：干净样本放行、脏样本判红、边界样本符合预期
node scripts/check-money-format.mjs --selftest

# 2. 正式扫描
node scripts/check-money-format.mjs

# 3. 反向探针：改坏必须转红
```

反向探针配置：

```json
{
  "file": "scripts/check-money-format.mjs",
  "cmd": "node scripts/check-money-format.mjs",
  "cases": [
    { "label": "去掉 formatMoney 白名单", "find": "!/formatMoney\\(/.test(line)", "replace": "false" },
    { "label": "去掉金额判断", "find": "/\\bamount\\b(?!Cents)/.test(line)", "replace": "false" }
  ]
}
```

```bash
node plugins/ironlaw/skills/ironlaw-gate/scripts/reverse-probe.mjs --config probe.json
```

期望输出：

```text
  ✓ 去掉 formatMoney 白名单：转红（exit=1）且复原一致
  ✓ 去掉金额判断：转红（exit=1）且复原一致
[reverse-probe] OK：2 个案例全部「变异转红 + 逐字节复原」
```

**如果变异后仍然全绿，说明这道门禁是假的** —— 它拦不住任何东西，只是给人心理安慰。这时不要继续，回去重写判据。

### 注册

```js
// scripts/check-guards.mjs 的 REGISTRY 里加一行
{ file: 'check-money-format.mjs', covers: '金额单位单一真源', selftestMin: 4 }
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
# 1. bump 版本（三处一致）
npm run bump:version

# 2. 提交
git commit -F .workbuddy/artifacts/commit-msg.txt

# 3. 推送 + 三条判据
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
