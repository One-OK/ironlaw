# ROADMAP

> 本文件跟踪「已交付 / 推广看板 / 用户反馈 / 候选方向」。原则与产品一致：可证伪、每项有触发条件、不写没有触发条件的空头方向。

## 已交付（明细见 CHANGELOG.md）

| 版本 | 主题 | 关键交付 |
|---|---|---|
| 1.1.0 | 机制补齐 | `impact-scope.mjs`（铁律四机器侧）、脚手架 safe-push / bump-version / verify-record、smoke 22 项、多处 fail-closed 修正 |
| 1.2.0 | 方法论补齐 | 调试程序四段、测试先行三情况、spec/PRD → §2.5 断言衔接 |
| 1.3.0 | 分发与触达 | `.claude-plugin` 插件市场一键安装、六技能英文触发词、promotion-kit 推广物料 |

## 推广看板（当前活跃）

状态：☐ 待办 · ◐ 进行中 · ☑ 完成

- ☐ 仓库 Settings：description / website / topics（文案见 `promotion-kit.md` 第三节）
- ☐ Discussions 开通 + 置顶欢迎帖
- ☐ Social preview 上传（`docs/social-preview.png` 已生成，1280×640）
- ☐ X / V2EX / 掘金 首发（文案见 `promotion-kit.md` 第四节）
- ☐ Show HN（选工作日上午，美东时间）
- ☐ r/ClaudeAI 帖
- ☐ awesome-claude-code PR（草稿已备，提交前人工过目）
- ☐ 第一个外部 issue/PR：响应 < 24h

## 用户反馈区

> 第一波真实反馈进来后逐条登记：反馈 → 定性（bug / 误解 / 需求）→ 处置。登记本身就是推广素材（「规则长得像用户的事故」）。

| 日期 | 渠道 | 反馈 | 定性 | 处置 |
|---|---|---|---|---|
| — | — | （暂无） | | |

## 候选方向（有触发条件才启动）

| 候选 | 触发条件 | 说明 |
|---|---|---|
| SKILL.md 英文全文版 | 外部英文用户占比可观，或有人明确提出 | 当前 description 双语触发词已覆盖自动触发 |
| code-review 协议技能 | 出现「AI diff 二段审查」的真实需求场景 | 参考 SonarSource 双层验证思路，做成参考文档而非强制仪式 |
| 规则命中台账 | 门禁数量 > 20 且出现「僵尸规则」争议 | 统计每条规则拦到过几次，作为删改依据——规则也要能被证伪 |
| `--package` 冒烟模式 | 需要频繁在 CI 验证发行包时 | smoke 目前针对仓库树；发行包已有洁净室人工流程 |

## 不做清单（越界即负债）

- 多角色 agent 编排（BMAD 式）——不是本套件要解决的问题
- PRD / 任务图产品（taskmaster 式）——上游产品，会稀释定位
- 全家桶 TDD 仪式——违背「门禁数量与事故正相关」的克制哲学
