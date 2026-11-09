# 真值源对照表

## 核心原则

> 任何"我认为已经上线"的判断，都必须能指向一个**外部可观测**的事实。

自己脚本的输出、自己的日志、自己的命令行没有报错——都不算。

---

## 六类真值

| # | 问题 | 真值命令 | 常见伪真值 |
|---|---|---|---|
| 1 | 代码推上去了吗 | `git ls-remote origin refs/heads/main` | 命令行无报错、本地 `origin/main` |
| 2 | 线上跑的是哪版 | `curl -s https://<host>/api/config` | 部署脚本日志、CI 状态 |
| 3 | 客户机拿到的是哪版 | `curl -s "https://<host>/api/v1/updates/check?product=X&current_version=0.0.0"` | 打包脚本输出、上传成功提示 |
| 4 | 台账说的对不对 | 台账 vs `package.json` vs manifest 三方比对 | 只读台账 |
| 5 | 包里是不是这次的代码 | 拉线上入口 chunk 后 grep | 构建日志里的 hash |
| 6 | 服务是否健康 | `GET /api/health` + 关键接口 200 | 进程存在（`pm2 status` 绿） |

---

## 取数细节

### 1 · 远端指针

```bash
git ls-remote origin refs/heads/main
# 输出：<sha>\trefs/heads/main
```

**不要**用 `git log origin/main -1`：本地的 remote-tracking 分支只在 fetch 时更新，长时间任务期间会冻结，看起来"已同步"其实落后。

### 2 · 线上版本

```bash
curl -s --max-time 20 https://<host>/api/config
# {"version":"1.2.3","commit":"abc1234","buildTime":"..."}
```

关注三个字段：

- `version` —— 是否等于本地
- `commit` —— 是否等于本地 HEAD（有时会被别的线覆盖，需解释）
- `buildTime` —— 是否在最近一次部署之后

> 如果 `version` 对但 `commit` 是别人的，说明**有并行线在同时部署**。要查清是谁、部署了什么，不能因为"版本号对了"就放过。

### 3 · 分发通道

```bash
# 旧版本号 → 应返回"有更新"+ 新版本 manifest
curl -s "https://<host>/api/v1/updates/check?product=X&current_version=<上一个版本>"

# 新版本号 → 应返回 204 无更新
curl -s -o /dev/null -w '%{http_code}' "https://<host>/api/v1/updates/check?product=X&current_version=<当前版本>"
```

两条都要验。只验前一条，可能是缓存；只验后一条，可能根本没包。

### 4 · 台账三方比对

| 来源 | 版本 |
|---|---|
| `package.json`（机读真源） | A |
| 台账「仓库当前版本」行 | 必须 = A |
| 台账「平台/分发」行 | 必须 = manifest 实际版本 |

任一处不等 → 台账是手抄件，已脱节。

### 5 · 产物指纹

```bash
HTML=$(curl -s https://<host>/)
ENTRY=$(printf '%s' "$HTML" | grep -o 'assets/index-[A-Za-z0-9_-]*\.js' | head -1)
curl -s "https://<host>/$ENTRY" -o /tmp/entry.js
wc -c < /tmp/entry.js
grep -c '<本版新增符号>' /tmp/entry.js    # >=1
grep -c '<本版删除文案>' /tmp/entry.js    # =0
```

**为什么需要"删除项 = 0"**：新增项可能是巧合（旧代码里也有这个词），删除项为零才是"这次构建生效"的强证据。

### 6 · 服务健康

```bash
curl -s -o /dev/null -w '%{http_code}' https://<host>/api/health
```

进程存在 ≠ 服务可用（进程可能启动后崩在第一个请求）。以接口 200 为准。

---

## 时间窗口陷阱

部署进行中的短暂 502/504 是正常的（进程重启）。判断方法：

1. 同一接口连打 3 次，全部正常 → 瞬时抖动
2. 查线上 commit / buildTime 是否在复验期间**变过** → 有并行线在部署
3. 查服务日志有无异常堆栈 → 无堆栈 = 更可能是回源/重启

三者齐了才能定性为"设施抖动"，并把结论写进档案，**不许口头豁免**。

---

## 反向核对：把"成功"证伪

| 你以为 | 如何证伪 |
|---|---|
| "版本号对了就是上了" | 拉入口 chunk，grep 本版才有的字符串 |
| "CI 绿了就是发了" | 查分发通道的 manifest 版本 |
| "脚本 exit 0 就是部署了" | 查线上 `/api/config` |
| "台账写了就是发了" | 查 manifest 实际版本 |
| "客户机自动更新了" | 用 `current_version=0.0.0` 拉一次，看返回的版本 |

**每一条都能被独立证伪，才叫闭环。**
