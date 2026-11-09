# Changelog

本文件记录 IronLaw 的公开版本变化。

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
