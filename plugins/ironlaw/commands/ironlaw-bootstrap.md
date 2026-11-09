---
description: 给新项目铺工程纪律骨架（钩子 + 门禁 + 共享件 + 文档模板）
argument-hint: "新项目路径，例如：D:/work/my-new-app"
---

<user_input>
$ARGUMENTS
</user_input>

---

**必须**加载 `ironlaw-bootstrap` 技能。

执行安装器：

```bash
node <skill>/scripts/init-project.mjs <目标目录>
```

安装器会铺 18 个文件：`.githooks/`（pre-commit / pre-push）、`scripts/`（5 个守卫 + `verify-record` + `safe-push.sh` + `bump-version.mjs` + 共享件）、`.github/workflows/ci.yml.example`（可选 CI，改名才启用）、`docs/CHANGE-DISCIPLINE.md`、`AGENTS.md`、`.editorconfig`、`.gitattributes`、`.gitignore`、`ship.json.example`。

安装后**必须**实测四件事，缺一不可：

1. `node scripts/check-all.mjs` → 输出独立 `EXIT=0` 哨兵
2. 故意写一条不合格提交信息 → pre-push **必须** exit 1
3. 塞一个未注册的门禁脚本 → 聚合器**必须**判红；删掉**必须**恢复绿
4. `node scripts/bump-version.mjs` → 多包版本同步 bump；`bash scripts/safe-push.sh --dry-run` → 打印推送计划且不写远端

**重要的取舍**：只铺 3~4 条门禁，不是 80 条。跑不完的门禁等于不存在。路线是「每条事故长一条规则」，让规则长得像你的历史事故，而不是像别人的最佳实践清单。

若目标仓库还没有任何提交（HEAD 未指向），安装器与门禁必须仍能跑通——这是建仓第一天的真实场景。
