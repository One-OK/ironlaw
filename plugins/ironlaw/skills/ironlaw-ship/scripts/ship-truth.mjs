#!/usr/bin/env node
/**
 * 上线真值核验（通用，项目无关）
 *
 * 为什么需要它：
 *   「部署脚本 exit 0」≠「服务在服务」；「git push 成功」≠「已上线」。
 *   真值只认**外部可观测的事实**：远端分支指针、线上接口返回的版本号、
 *   分发通道的 manifest、台账文件里的最新登记。
 *
 * 核验六项（可在配置里关掉不适用的）：
 *   1. 版本一致：多个 package.json 版本号相同
 *   2. 工作区干净
 *   3. 本地 HEAD == 远端分支 tip（用 ls-remote，不读本地 origin/main，它会冻结）
 *   4. 线上接口返回的版本 == 本地版本
 *   5. 分发通道 manifest 版本 == 本地版本
 *   6. 台账文件里出现本地版本
 *
 * 用法：
 *   node ship-truth.mjs --config ship.json
 *   node ship-truth.mjs --config ship.json --json
 *   node ship-truth.mjs --config ship.json --skip online,ledger   # 临时跳过（会打印为 SKIP，不计通过）
 *
 * ship.json:
 * {
 *   "versionFiles": ["package.json", "apps/web/package.json", "apps/api/package.json"],
 *   "branch": "main",
 *   "requireClean": true,
 *   "online": { "url": "https://example.com/api/config", "versionPath": "version", "timeoutMs": 15000 },
 *   "packageChannel": { "url": "https://example.com/api/updates/check?product=x&current_version=0.0.0", "versionPath": "manifest.version" },
 *   "ledger": { "file": "docs/STATUS.md", "expectRecentLines": 40 }
 * }
 *
 * 退出码：0 全部一致 / 1 有真值不一致 / 2 无法取得真值（网络/配置）
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EXIT = { OK: 0, MISMATCH: 1, UNKNOWN: 2 };

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--config') o.config = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--skip') o.skip = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean);
    else o._.push(a);
  }
  return o;
}

function sh(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim(), status: r.status };
}

function readJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

function getPath(obj, p) {
  if (!p) return obj;
  return String(p).split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

async function fetchJson(url, timeoutMs = 15000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, headers: { 'cache-control': 'no-cache' } });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 非 JSON 由调用方判 */ }
    return { status: res.status, json, text, error: '' };
  } catch (e) {
    return { status: 0, json: null, text: '', error: String(e.message || e) };
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const skip = new Set(args.skip || []);

  let cfg;
  if (args.config) {
    const p = path.resolve(cwd, args.config);
    if (!existsSync(p)) {
      console.error(`[ship-truth] 配置不存在：${p}`);
      process.exit(EXIT.UNKNOWN);
    }
    cfg = readJson(p);
  } else {
    cfg = {
      versionFiles: ['package.json'],
      branch: 'main',
      requireClean: true,
    };
  }

  const results = [];
  const add = (id, label, state, detail) => results.push({ id, label, state, detail });

  // ① 版本一致
  const vf = (cfg.versionFiles || ['package.json']).filter((f) => existsSync(path.resolve(cwd, f)));
  if (!vf.length) {
    add('version', '版本一致', 'UNKNOWN', '一个版本文件都不存在，无法判定');
  } else {
    const vers = vf.map((f) => ({ f, v: readJson(path.resolve(cwd, f)).version }));
    const uniq = [...new Set(vers.map((x) => x.v))];
    if (uniq.length === 1) add('version', '版本一致', 'PASS', `${uniq[0]}（${vf.length} 处）`);
    else add('version', '版本一致', 'FAIL', vers.map((x) => `${x.f}=${x.v}`).join(' , '));
  }
  const localVersion = vf.length ? readJson(path.resolve(cwd, vf[0])).version : null;

  // ② 工作区干净
  if (cfg.requireClean === false) {
    add('clean', '工作区干净', 'SKIP', '配置要求不检查');
  } else {
    const st = sh('git', ['status', '--porcelain'], cwd);
    if (!st.ok) add('clean', '工作区干净', 'UNKNOWN', '不是 git 仓库或 git 不可用');
    else if (!st.out) add('clean', '工作区干净', 'PASS', '无未提交改动');
    else add('clean', '工作区干净', 'FAIL', `${st.out.split('\n').length} 个改动未提交`);
  }

  // ③ HEAD == 远端 tip（权威真值只认 ls-remote）
  const branch = cfg.branch || 'main';
  const head = sh('git', ['rev-parse', 'HEAD'], cwd);
  const remote = sh('git', ['ls-remote', 'origin', `refs/heads/${branch}`], cwd);
  if (!head.ok || !remote.ok || !remote.out) {
    add('head', '本地 = 远端', 'UNKNOWN', '取不到 git 真值（网络或 remote 未配置）');
  } else {
    const headSha = head.out.trim();
    const remoteSha = remote.out.split(/\s+/)[0];
    if (headSha === remoteSha) add('head', '本地 = 远端', 'PASS', headSha.slice(0, 9));
    else add('head', '本地 = 远端', 'FAIL', `本地 ${headSha.slice(0, 9)} / 远端 ${remoteSha.slice(0, 9)}`);
  }

  // ④ 线上接口
  if (!cfg.online) {
    add('online', '线上版本', 'SKIP', '未配置 online');
  } else if (skip.has('online')) {
    add('online', '线上版本', 'SKIP', '命令行跳过');
  } else {
    const r = await fetchJson(cfg.online.url, cfg.online.timeoutMs || 15000);
    if (r.error) {
      add('online', '线上版本', 'UNKNOWN', `请求失败：${r.error}`);
    } else if (r.status !== 200 || !r.json) {
      add('online', '线上版本', 'UNKNOWN', `HTTP ${r.status} 或响应非 JSON`);
    } else {
      const onlineV = getPath(r.json, cfg.online.versionPath || 'version');
      if (!onlineV) add('online', '线上版本', 'UNKNOWN', `响应里取不到 ${cfg.online.versionPath || 'version'}`);
      else if (String(onlineV) === String(localVersion)) add('online', '线上版本', 'PASS', String(onlineV));
      else add('online', '线上版本', 'FAIL', `线上 ${onlineV} ≠ 本地 ${localVersion}`);
    }
  }

  // ⑤ 分发通道
  if (!cfg.packageChannel) {
    add('channel', '分发版本', 'SKIP', '未配置 packageChannel');
  } else if (skip.has('channel')) {
    add('channel', '分发版本', 'SKIP', '命令行跳过');
  } else {
    const r = await fetchJson(cfg.packageChannel.url, cfg.packageChannel.timeoutMs || 20000);
    if (r.error) add('channel', '分发版本', 'UNKNOWN', `请求失败：${r.error}`);
    else if (!r.json) add('channel', '分发版本', 'UNKNOWN', `HTTP ${r.status} 或响应非 JSON`);
    else {
      const v = getPath(r.json, cfg.packageChannel.versionPath || 'version');
      if (!v) add('channel', '分发版本', 'UNKNOWN', `响应里取不到 ${cfg.packageChannel.versionPath || 'version'}`);
      else if (String(v) === String(localVersion)) add('channel', '分发版本', 'PASS', String(v));
      else add('channel', '分发版本', 'FAIL', `分发 ${v} ≠ 本地 ${localVersion}`);
    }
  }

  // ⑥ 台账登记
  if (!cfg.ledger) {
    add('ledger', '台账已登记', 'SKIP', '未配置 ledger');
  } else if (skip.has('ledger')) {
    add('ledger', '台账已登记', 'SKIP', '命令行跳过');
  } else {
    const p = path.resolve(cwd, cfg.ledger.file);
    if (!existsSync(p)) add('ledger', '台账已登记', 'FAIL', `台账文件不存在：${cfg.ledger.file}`);
    else {
      const lines = readFileSync(p, 'utf8').split(/\r?\n/);
      const tail = lines.slice(-(cfg.ledger.expectRecentLines || 40));
      const found = tail.some((l) => localVersion && l.includes(String(localVersion)));
      if (found) add('ledger', '台账已登记', 'PASS', `最近 ${tail.length} 行含 ${localVersion}`);
      else add('ledger', '台账已登记', 'FAIL', `最近 ${tail.length} 行未见 ${localVersion}`);
    }
  }

  // 输出
  if (args.json) {
    console.log(JSON.stringify({ version: localVersion, results }, null, 2));
  } else {
    console.log(`[ship-truth] 本地版本 ${localVersion ?? '(未知)'}`);
    for (const r of results) {
      const mark = { PASS: '✓', FAIL: '✗', SKIP: '–', UNKNOWN: '?' }[r.state];
      console.log(`  ${mark} ${r.label}：${r.state} — ${r.detail}`);
    }
  }

  const fail = results.filter((r) => r.state === 'FAIL');
  const unknown = results.filter((r) => r.state === 'UNKNOWN');
  const pass = results.filter((r) => r.state === 'PASS');
  const skipN = results.filter((r) => r.state === 'SKIP');

  if (!args.json) {
    console.log(`\n[ship-truth] ${pass.length} 通过 / ${fail.length} 不一致 / ${unknown.length} 无法判定 / ${skipN.length} 跳过`);
  }

  if (fail.length) process.exit(EXIT.MISMATCH);
  if (unknown.length) process.exit(EXIT.UNKNOWN);   // 取不到真值 ≠ 通过
  process.exit(EXIT.OK);
}

main();
