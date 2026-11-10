# 推广物料包（内部文档，不随技能分发）

> 用途：发 v1.3.0 后按下面的清单与文案分渠道推广。
> 原则（与产品一致）：**不夸大、可证伪、给证据链**。每条文案里的数字都出自本仓库可验证的事实。

---

## 一、一句话版本

- 中文：**把工程纪律变成机器：AI 和人都能很快写出「看起来对」的代码，IronLaw（铁律）让「这次改动可信」变成机器可查的证明——fail-closed 门禁、机器执行的断言表、反向变异探针、上线真值核验。**
- 英文：**IronLaw turns "this change is trustworthy" into machine-checkable proof — fail-closed gates, machine-executed assertion tables, reverse-mutation probes, and deploy truth verification. As skills for Claude Code / WorkBuddy / Codex.**

## 二、核心差异点（写文案时只许用这几条，全部可验证）

1. 别家的验收清单是给人看的；IronLaw 的 §2.5 断言表是**被脚本逐条执行的**，计数对不上就红。
2. 别家证明「测试写了」；IronLaw 的反向探针证明「**守卫本身会红**」——改坏守卫必须转红并逐字节复原。
3. 别家到 CI 绿为止；IronLaw 管「**push 成功 ≠ 部署了**」：线上只认接口返回的版本号，不认部署脚本 exit 0。
4. 发行包自带 `scripts/smoke.mjs`：**22 项端到端冒烟**，任何机器一条命令复现全部「已验证」声明（我们自己的发行包就是这么验的：下载 zip → md5 一致 → 解压 → 22/22）。
5. 一条命令装进 Claude Code：`/plugin marketplace add One-OK/ironlaw`。

## 三、手动清单（需要仓库管理员权限，约 10 分钟）

- [ ] **Settings → General → Description** 粘贴：
  `把工程纪律变成机器 | Turn engineering discipline into machinery: fail-closed gates, machine-executed assertions, reverse-mutation probes, deploy truth verification.`
- [ ] **Settings → General → Website**：`https://one-ok.github.io/ironlaw/`
- [ ] **Settings → General → Topics** 添加：
  `claude-code` `ai-agents` `agent-skills` `engineering-discipline` `guardrails` `code-review` `spec-driven-development` `tdd` `ci-cd` `devtools` `software-quality` `codex`
- [ ] **Settings → General → Features → Discussions** 勾选；开一个置顶公告「🎉 欢迎 + 提交反馈请带 smoke 输出」
- [ ] **Settings → Social preview** 上传一张 1280×640 图（建议：深底 #14120F + 红方块 logo + 一句话，与 docs/index.html 风格一致）
- [ ] Releases 页确认 v1.3.0 是 Latest（发布后自动是）

## 四、分渠道文案

### 1. X / Twitter（英文，发帖 + 可选自推）

> 96% of devs don't fully trust AI-generated code. Only 48% check it before committing.
>
> IronLaw (MIT, zero-dep) makes "this change is trustworthy" *provable*:
> · assertion tables that are *executed*, not read
> · mutation probes that prove your guards can fail
> · "push succeeded" ≠ deployed — verify live truth instead
>
> Claude Code: `/plugin marketplace add One-OK/ironlaw`
> https://github.com/One-OK/ironlaw

### 2. Show HN（英文，标题 + 首评）

标题：`Show HN: IronLaw – executable engineering discipline for AI-coded changes`

首评正文：

> Hi HN! We built IronLaw after a real commercial product line accumulated 89 guard scripts and a long list of scars: guards that skipped and still reported green, timeouts misread as failed assertions, and "push succeeded" while nothing was deployed for 19 hours.
>
> The thesis: AI and humans both write code that *looks* correct; the bottleneck is proving it. So IronLaw turns discipline into machinery:
>
> - **Machine-executed acceptance**: change records carry an assertion table (regex × scope × expected line-count) that a script actually executes — a placeholder table fails closed.
> - **Reverse probes**: every new guard must prove it turns red when you remove the protection, restored byte-for-byte (md5). A guard you never tried to break is not a guard.
> - **Fail-closed everywhere**: missing files/sections/empty data must go red; SKIP is never counted as PASS.
> - **Deploy truth**: "push succeeded" ≠ deployed. Four truth sources: local / remote / live API / distribution manifest.
>
> It ships as 6 skills (Claude Code marketplace or plain SKILL.md files) plus 4 zero-dependency Node tools. The release package carries its own 22-check end-to-end smoke test: download the zip, verify the md5, run `node scripts/smoke.mjs`.
>
> Docs (2-min read): https://one-ok.github.io/ironlaw/ · 中文: https://one-ok.github.io/ironlaw/
> Code: https://github.com/One-OK/ironlaw (MIT)
>
> Ask us anything — especially skeptical questions about whether "more process" is worth it. Our answer: gates grow from incidents, not from checklists, and every guard must earn its keep (<5s, attributable failures, reverse-probed).

### 3. r/ClaudeAI（英文帖）

标题：`I built a skill suite that makes Claude's changes *provable*, not just plausible (MIT, zero-dep)`

> Claude (and me) can both write code that looks correct. What neither of us can do is *prove* it. So I extracted 6 skills + 4 tools from a commercial product line's engineering history into **IronLaw**:
>
> - `/ironlaw-change` — six opening questions, root-cause discipline, impact-chain across 6 categories, debug procedure (reproduce → minimize → falsify → fix)
> - `/ironlaw-gate` — turn any judgement into a check script, and **prove it turns red when broken** (reverse mutation probe, byte-identical restore)
> - `/ironlaw-record` — seven-section change record whose assertion table is *executed* by a script (placeholder tables fail closed — the most common fake-green trap)
> - `/ironlaw-ship` — push ≠ deployed; four truth sources incl. live API version and distribution manifest
> - `/ironlaw-bootstrap` — hooks + guards + AGENTS.md scaffold for a new repo (18 files, fail-closed installer)
>
> Install in Claude Code: `/plugin marketplace add One-OK/ironlaw` → `/plugin install ironlaw@ironlaw`
> The release zip verifies itself: md5 reproducible, 22-check smoke included.
> MIT, zero third-party deps. Repo: https://github.com/One-OK/ironlaw · Docs: https://one-ok.github.io/ironlaw/
>
> Feedback wanted — especially: which of your team's "we always forget to check X" would you turn into a guard first?

### 4. V2EX（中文，节点 /programmer 或 /create）

标题：「把工程纪律变成机器：IronLaw，给 AI 编程时代补上『改动可信』的证明层（开源/MIT/零依赖）」

> 背景一句话：AI 和人都能很快写出「看起来对」的代码，但没人能证明它真的对。有调研说 96% 的开发者不完全信任 AI 生成代码，只有 48% 提交前会检查。
>
> 我们从一条商业化产品线的真实工程史（89 个门禁脚本、838 行变更纪律、一长串事故）里提炼了一套可执行的纪律：IronLaw。
>
> 和常见「规范文档 / 验收清单」的区别：清单是给人看的，IronLaw 的断言表是给机器跑的——
>
> 1. 变更档案里的 §2.5 断言表（正则 × 范围 × 期望行数）由脚本**逐条执行**，占位表格直接判红；
> 2. 每条新守卫必须过**反向探针**：把保护改坏 → 必须转红 → md5 逐字节复原。没验证过「会红」的守卫等于没有；
> 3. fail-closed 贯彻到底：缺文件/缺章节/空数据必须红，跳过不许计通过；
> 4. push 成功 ≠ 部署了。四方真值核验：本地 / 远端指针 / 线上接口版本 / 分发通道 manifest；
> 5. 发行包自带 22 项冒烟测试：下载 zip → md5 可复现 → node scripts/smoke.mjs 一条命令验证全部声明。
>
> 安装（Claude Code）：`/plugin marketplace add One-OK/ironlaw`
> 仓库：https://github.com/One-OK/ironlaw （MIT，零第三方依赖）
> 文档：https://one-ok.github.io/ironlaw/ （两分钟看完它是什么）
>
> 求拍砖：你们团队「总是忘记检查的 X」，值得做成哪条守卫？

### 5. 掘金（中文，可基于 V2EX 版扩写）

在 V2EX 版基础上加：
- 一个真实案例小节（照抄 docs/walkthrough.md 的「金额少两位小数」：§2.5 断言 #5 抓出报表模板漏改）
- 「门禁从事故里长出来，不从清单里抄下来」一节（rollout.md 的四阶段渐进路线）
- 标签：`Claude Code`、`工程效能`、`开源`、`代码质量`

### 6. Awesome List PR 草稿（目标：hesreallyhim/awesome-claude-code）

PR 标题：`Add IronLaw — executable engineering discipline skills (gates, change records, deploy truth)`

条目行（按该仓库格式，提交前先看 README 的当前格式）：

> **[IronLaw](https://github.com/One-OK/ironlaw)** — Turns "this change is trustworthy" into machine-checkable proof: fail-closed gates, machine-executed change-record assertions, reverse-mutation probes for guards, and deploy truth verification. 6 skills + 4 zero-dep tools. `/plugin marketplace add One-OK/ironlaw`

PR 描述要点：MIT、无第三方依赖、技能格式官方校验器通过、发行包自带 22 项冒烟可复现。

（注：向第三方仓库提 PR 属对外行为，提交前请过目草稿；也可以先只发 X/V2EX/掘金。）

## 五、节奏建议

1. **第 1 天**：手动清单（10 分钟）→ 发 X + V2EX + 掘金；HN 选工作日上午（美东时间）发。
2. **第 3 天**：把所有渠道的提问汇总到 Discussions；高频问题直接变成 FAQ 进 README 或 docs/why.html。
3. **第 1 周**：第一个外部 issue/PR 无论多小，响应 <24h——早期贡献者的体验决定星标转化。
4. **持续**：每条真实用户事故 → 一条新守卫 → 在 CHANGELOG 里点名致谢报告者。「规则长得像用户的事故」本身就是最好的推广素材。

## 六、禁止事项（品牌纪律）

- 不说「保证不出 bug」；只说「改动可信可以被证明」。
- 不拿 star 数当产品指标宣传；拿 smoke 22/22、md5 可复现这类**可证伪事实**说话。
- 不贬损同行（spec-kit/superpowers/BMAD 各管一层，IronLaw 是补全不是替代）。
