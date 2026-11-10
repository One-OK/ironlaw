# Changelog

本文件记录 IronLaw 的公开版本变化。

## 1.2.0 — 2026-11-10

与同行（GitHub spec-kit / obra superpowers / BMAD-METHOD / taskmaster）对比后，补齐三个轻量缺口。**工具行为不变**，新增的是程序、判据与生态覆盖；冒烟测试 22 项结果与 1.1.0 相同。

**新增**

- `ironlaw-change/references/debugging-procedure.md` —— 调试程序四段：**复现 → 最小化 → 假设证伪 → 修复回归闭环**。此前只有「根因往上追一层」的定位原则（intake）和设施免责判别（triage），缺「设施没病、真源未知时怎么程序化找根因」的操作程序；本篇补上，并与前两者首尾衔接。
- `ironlaw-change` 新增「测试先行（三种情况）」：修 bug / 新增公共逻辑 / 边界逻辑必须先让测试红（红 → 绿 → 固化），并写明与 §2.5 断言的分工——单测钉行为，断言钉残留与规模；恒真测试与「没做反向探针的守卫」同罪。
- `ironlaw` 总入口路由表新增两行：调试/复现类诉求的分流；上游 spec / PRD → §2.5 断言的衔接口径（有验收标准直接转断言，没有先用开工六问第 6 问补齐）——与 spec-kit 类上游工作流对接，不替代。
- README（中英）新增「装进 Claude Code / Codex」：`install.mjs --target ~/.claude/skills` 直装（SKILL.md 格式通用）；脚手架 `AGENTS.md` 遵循 agents.md 开放格式，Codex 原生读取，Claude Code 用 `@AGENTS.md` 一行引用共享真源、不复制两份。

**已验证**

- `node scripts/smoke.mjs` → 22/22（工具未变，冒烟覆盖与 1.1.0 一致）

## 1.1.0 — 2026-11-10

把上一版「文档承诺了、机器没兑现」的部分补齐：四铁律的机制全部随包落地，并给发行包自带可复现的验证。**新增两条工具**，多处判定行为变化（见下）。

**新增**

- `impact-scope.mjs`（ironlaw-record）—— 铁律四的机器侧：从 diff 算出本次触及的范围键，逐键对照 §2.5 断言范围与 §2.6 理由，漏键点名判红。上一版只有 `verify-record` 执行断言，「没有漏键」靠自觉。
- 脚手架新增 `scripts/safe-push.sh` —— 安全推送模板：对账 → 快进合并 → 推送 → 三判据（`PUSH_RC` / `REFLOG_TIP` / `REMOTE_TIP`），永不 force；远端分叉时拒绝并指回 multi-writer 协议。上一版 ship 技能引用它，但包里没有。
- 脚手架新增 `scripts/bump-version.mjs` —— 多包版本同步 bump：文本替换保格式，缺 `version` 键 fail-closed（不许只 bump 一半）。AGENTS.md 模板一直要求「只用脚本 bump」，现在脚本真的随包来了。
- 脚手架新增 `scripts/verify-record.mjs` —— 档案校验器随仓库分发，pre-push 才有得跑。
- 脚手架 pre-push 新增档案校验闸：存在 `docs/change-records/` 即校验最新档案（`PREPUSH_RECORDS=0` 关闭）；提交信息三段从「只查 HEAD」改为校验**整个推送区间**（读 git 从 stdin 传入的远端..本地范围；新分支退化为只查 HEAD 并明说）。
- `scripts/smoke.mjs` —— 发行包端到端冒烟测试（22 项）：脚手架安装/钩子拦截、verify-record 假绿陷阱、reverse-probe 假守护识别、ship-truth 取不到真值不冒充通过、impact-scope 闭环、bump-version fail-closed、safe-push 三判据与分叉拒绝。CHANGELOG 的「已验证」从此在任何机器上可复现。
- 脚手架新增 `.github/workflows/ci.yml.example` —— 可选 CI：改名才启用，只跑门禁不部署（发布哲学不变）。

**修正**

- `ship-truth.mjs`：配置里写了但磁盘上不存在的版本文件，原先被**静默丢弃**（「3 处一致」悄悄缩水成「1 处一致」）；现在显式报 UNKNOWN（exit 2）并点名缺失文件——fail-closed 补课。
- `check-all.mjs` / `check-guards.mjs`：超时/被杀原先计入 exit 1（产品红），违反自己的 EXIT 纪律；现在区分为**设施类失败**，只有设施类失败时退出 2，子步骤的 exit 2 也向上传播。无效步号同样退出 2。
- `reverse-probe.mjs`：守卫命令原先没有超时——挂死会带着探针一起挂死；现在支持 `timeoutMs`（配置级/案例级，默认 120s），超时按设施错误退出 2，结论作废。
- `verify-record.mjs`：新增 `--root`，并在文档写明范围相对仓库根解析（此前未文档化）。
- `install.mjs`：不再使用 `import.meta.dirname`（Node < 20.11 会直接 TypeError 崩溃）。
- 文档一致性（按铁律三自查）：「影响链六类」「开工六问」此前在 walkthrough / change 命令里是**另一套口径**，与技能/intake 定义冲突，已统一；README 与 walkthrough 的「改三处：evaluate / ROOTS / covers」是私有仓库旧 API 残留，已改为骨架真实的 `RULES`；walkthrough 的 REGISTRY 示例字段改为真实 schema；「EXIT 码三态」实为四态，已更正；期望值口径统一为 `>=N / =N / <=N` 三种算子（`=0` 是 `=N` 的特例）；脚手架文件数 13 → 18（实测）；`commit-msg-template.txt` 一处未闭合的 `<` 已补。
- pre-commit 密钥粗筛注明可选接入 gitleaks（引入第三方依赖，不改变零依赖默认）。

**已验证**

- `node scripts/smoke.mjs` → 22/22 通过（脚手架安装、钩子拦截、档案校验、假守护识别、真值语义、范围键闭环、多包 bump、安全推送与分叉拒绝）
- 冒烟过程本身抓出并修掉两处真缺陷：pre-push 钩子对 MSYS2/Git Bash 管道 stdin 的 `/dev/stdin` 依赖（管道下不存在）；G 组夹具对版本一致性检查的污染路径
- 三个原有工具在真实仓库上的行为与 1.0.1 兼容（新增的 exit 2 只影响超时/配置错误场景，正常通过/判红路径不变）

## 1.0.1 — 2026-11-09

文档与分发补全。**技能逻辑与工具行为没有变化**，升级不改变任何判定结果。

**新增**

- `docs/en.html` — 英文首页，与中文页同构，导航与页脚双向切换。
- `docs/why.html` — 长文《一个永远变绿的门禁，成本比没有门禁更高》：七种假绿、三种假红、探针三态、十问清单。
- `docs/.nojekyll` — Pages 跳过 Jekyll。技术文档里迟早出现 `{{ }}`，被当成模板语法解析只会静默少字，不会报错。
- `scripts/package.mjs` — 纯 Node 打包器：零依赖、固定时间戳与固定排序，同样内容打出同样 md5；`--check` 校验现有包与当前树是否逐字节一致。

**修正**

- 英文首页的示例输出原先是英文译文，与工具真实打印（中文）不符。已全部换成逐字原文，并在页脚注明「输出为中文，动词照抄即可对上」。
- 中文长文缺 `prefers-reduced-motion` 下的 `scroll-behavior:auto`，系统关掉动画时锚点跳转仍会平滑滚动。
- 三处文档的示例输出里留着 `← 漏了！` 这类手写旁注，与「逐字原文」自相矛盾；已移入正文说明。

## 1.0.0 — 2026-11-09

首个公开版本。

**技能（6）**

- `ironlaw` — 总入口与路由
- `ironlaw-change` — 改动纪律（四铁律、开工六问、影响链六类、复盘三问、多写者合并协议）
- `ironlaw-gate` — 门禁工程（门禁七要素、fail-closed、反向探针、单一真源、EXIT 三态、假红假绿目录）
- `ironlaw-record` — 变更档案（七段模板、§2.5 断言文法、§7 负控制、三段式提交信息）
- `ironlaw-ship` — 上线闭环（七步顺序、推送三判据、真值源矩阵、回滚）
- `ironlaw-bootstrap` — 项目脚手架（13 文件骨架、幂等安装器、渐进落地路线）

**命令（6）**

`/ironlaw`、`/ironlaw-change`、`/ironlaw-gate`、`/ironlaw-record`、`/ironlaw-ship`、`/ironlaw-bootstrap`

**工具（3）**

- `reverse-probe.mjs` — 反向变异探针，含命中数校验与 md5 复原
- `verify-record.mjs` — 执行档案 §2.5 断言表
- `ship-truth.mjs` — 四方真值核验（本地 / 远端 / 线上 / 分发）

**文档**

- `README.md` / `README.en.md` — 中英文主文档（定位、四铁律、五段流程、安装、调用）
- `docs/walkthrough.md` — 完整走查：从「金额少两位小数」到线上确认，五段逐步演示，含命令与真实输出

**已验证**

- 五个技能全部通过官方 skill 校验器
- `verify-record.mjs` 在真实 14 条断言档案上输出与项目侧门禁完全一致
- `reverse-probe.mjs` 三条路径（正常 0 / 假守护 1 / 配置错 2）均正确，变异后 md5 复原一致
- 脚手架在空仓库端到端跑通：安装 → 4 个守卫自证 → `check-all` 输出 `EXIT=0` → 钩子拦住不合格提交 → 未注册门禁被判红
