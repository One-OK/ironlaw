#!/usr/bin/env bash
# safe-push.sh —— 安全推送（项目无关模板，随 ironlaw-bootstrap 脚手架铺设）
#
# 铁律：
#   · 永不 force push；永不 rebase（改写 sha 会让变更档案/台账/门禁里的引用失效）
#   · 推送三判据：单独捕获退出码 + reflog + ls-remote（第 3 条是唯一权威，
#     本地 origin/<branch> 会冻结，不作为判据）
#   · 远端领先时只做快进合并；合并 = 代码变了，推送后必须重跑全量门禁
#
# 用法：
#   bash scripts/safe-push.sh                 # 对账 → 快进合并 → 推送 → 三判据
#   bash scripts/safe-push.sh --push-only     # 跳过对账与合并，只推送 + 三判据
#   bash scripts/safe-push.sh --branch main   # 显式指定分支（默认当前分支）
#   bash scripts/safe-push.sh --dry-run       # 只打印将要做什么，不写远端
#
# 退出码：0 三判据全过 / 1 判据失败（推了但对不上）/ 2 环境错误（脏工作区、不可快进、无远端）
#
# 项目扩展点（搜索 EXTENSION）：bump 与台账登记插在推送之前；模板不替项目做假设。
# AUTO_DEPLOY=0 表示「本次推送不要触发自动部署链」——模板只打印提示；
# 若本项目配置了 push 后自动部署，须在该链条处识别此变量并真正跳过。
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

PUSH_ONLY=0; DRY=0; BRANCH=""
while [ $# -gt 0 ]; do
  case "$1" in
    --push-only) PUSH_ONLY=1 ;;
    --dry-run)   DRY=1 ;;
    --branch)    BRANCH="${2:?--branch 需要分支名}"; shift ;;
    -f|--force)  echo "❌ [safe-push] 本脚本永不 force push。按 multi-writer 协议合并后重推。"; exit 2 ;;
    *) echo "❌ [safe-push] 未知参数：$1"; exit 2 ;;
  esac
  shift
done
BRANCH="${BRANCH:-$(git rev-parse --abbrev-ref HEAD)}"
if [ "$BRANCH" = "HEAD" ]; then
  echo "❌ [safe-push] 处于分离 HEAD 状态，先切到分支再推。"
  exit 2
fi

REMOTE_EXISTS=0
if git ls-remote --exit-code origin "refs/heads/$BRANCH" >/dev/null 2>&1; then
  REMOTE_EXISTS=1
fi
if [ "$REMOTE_EXISTS" -eq 0 ]; then
  echo "[safe-push] 远端 origin 尚无分支 $BRANCH —— 将首次推送（无对账对象）"
fi

# ── 对账 + 快进合并 ────────────────────────────────────────────────────────
if [ "$PUSH_ONLY" -ne 1 ] && [ "$REMOTE_EXISTS" -eq 1 ]; then
  git fetch origin "$BRANCH" || { echo "❌ [safe-push] fetch 失败（网络/权限）"; exit 2; }
  remote_tip=$(git rev-parse "origin/$BRANCH")
  local_tip=$(git rev-parse HEAD)
  if [ "$remote_tip" != "$local_tip" ]; then
    behind=$(git rev-list --count "HEAD..origin/$BRANCH")
    ahead=$(git rev-list --count "origin/$BRANCH..HEAD")
    if [ "$behind" -gt 0 ] && [ "$ahead" -gt 0 ]; then
      echo "❌ [safe-push] 本地与远端各有新提交（落后 $behind / 领先 $ahead），不能快进。"
      echo "   按 multi-writer 协议先合并（按内容叠加，禁止整文件取一边），再重跑本脚本。"
      exit 2
    fi
    if [ "$behind" -gt 0 ]; then
      if [ -n "$(git status --porcelain)" ]; then
        echo "❌ [safe-push] 工作区有未提交改动，先提交或暂存，再合并远端。"
        exit 2
      fi
      if [ "$DRY" -eq 1 ]; then
        echo "[safe-push] DRY: 将执行 git merge --ff-only origin/$BRANCH（$behind 个提交）"
      else
        git merge --ff-only "origin/$BRANCH"
        echo "[safe-push] 已快进合并远端（$behind 个提交）。合并 = 代码变了，推送后必须重跑全量门禁。"
      fi
    fi
  fi
fi

# ── EXTENSION：bump 与台账登记插在这里（需要的项目自行取消注释）────────────
#   node scripts/bump-version.mjs patch
#   git commit -am "chore(release): bump ...（三段式）"
#   # 台账登记行追加到 docs/STATUS.md，随本提交一起推送

if [ "${AUTO_DEPLOY:-1}" = "0" ]; then
  echo "[safe-push] AUTO_DEPLOY=0：已请求抑制 push 后自动链；若本项目配置了自动部署，请确认其确实被抑制。"
fi

# ── 推送 + 三判据 ──────────────────────────────────────────────────────────
if [ "$DRY" -eq 1 ]; then
  echo "[safe-push] DRY: 将执行 git push origin HEAD:$BRANCH"
  exit 0
fi

RC=0
git push origin "HEAD:$BRANCH" || RC=$?
echo "PUSH_RC=$RC"                                   # 判据 1：单独捕获，不经管道

REFLOG_TIP=$(git reflog show "origin/$BRANCH" -1 2>/dev/null | head -1 | cut -d' ' -f1 || true)
echo "REFLOG_TIP=${REFLOG_TIP:-（无）}"              # 判据 2：本地视角，会冻结，仅参考

REMOTE_SHA=$(git ls-remote origin "refs/heads/$BRANCH" | cut -f1)   # 判据 3：唯一权威
LOCAL_SHA=$(git rev-parse HEAD)
echo "REMOTE_TIP=${REMOTE_SHA:-（取不到）}"
echo "LOCAL_TIP=$LOCAL_SHA"

if [ "$RC" -ne 0 ]; then
  echo "❌ [safe-push] push 退出码 $RC。先按 multi-writer 协议对账，不要盲目重试。"
  exit 1
fi
if [ -z "$REMOTE_SHA" ] || [ "$REMOTE_SHA" != "$LOCAL_SHA" ]; then
  echo "❌ [safe-push] 远端指针与本地 HEAD 不一致 —— push 报了成功但远端不是这个提交，可能被并行线覆盖。"
  exit 1
fi
echo "[safe-push] OK：三判据一致（$LOCAL_SHA）"
exit 0
