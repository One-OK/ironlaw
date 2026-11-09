#!/usr/bin/env node
/**
 * 影响链范围键计算器（通用，项目无关）—— 铁律四的机器侧
 *
 * 为什么需要它：
 *   铁律四要求「影响链用机器算的覆盖率逐键闭环」。verify-record.mjs 负责
 *   执行 §2.5 的断言表；本工具负责另一半：从 diff 机器算出「本次触及哪些
 *   范围键」，再逐键对照 §2.5 的断言范围与 §2.6 的不适用理由，漏掉的键点名。
 *   没有这一半，「逐键闭环」就退化成人工自觉。
 *
 * 用法：
 *   node impact-scope.mjs --base <sha|tag> [--head <sha>] [--depth N] [--record <md>] [--root <dir>] [--json]
 *
 *   --base    必填。对比起点（提交/分支/tag），如 HEAD~1、v1.0.0
 *   --head    对比终点，默认 HEAD
 *   --depth   范围键取路径前 N 段**目录**（默认 2：apps/mobile/src/x.vue → apps/mobile；
 *             根目录文件没有目录段，键就是文件名本身）
 *   --record  变更档案路径。提供后逐键判定覆盖状态；不提供则只列范围键（探察模式）
 *   --root    仓库根（默认当前目录；git 命令与档案里的相对范围都在此解析）
 *
 * 覆盖判定口径：
 *   键 K 被覆盖，当且仅当（二选一）：
 *   a. §2.5 存在断言，其范围 S 满足：S===K，或 K 在 S 之下（S 是 K 的祖先），
 *      或 S 在 K 之下（窄覆盖——断言收窄到 K 内部，也算作者对该键表过态）
 *   b. §2.6 存在一行提到 K，且该行去掉 K 的字样后仍有 ≥8 字理由
 *   两者皆无 → 未覆盖，逐键点名，退出 1。
 *
 * 范围列解析口径与 verify-record.mjs 一致：表格取第 4 列，空格/逗号分隔，
 *   可含反引号。两份实现分别内嵌于各自工具（技能间无共享目录可 import），
 *   口径以本注释为准；若改动一处，另一处必须同步——这是已知的最小代价。
 *
 * 退出码：0 全部闭环（或探察模式无未覆盖概念）/ 1 有未覆盖键 / 2 参数或环境错误
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const EXIT = { OK: 0, UNCOVERED: 1, SETUP: 2 };

function die(msg) {
  console.error(`\n[impact-scope] 错误：${msg}`);
  process.exit(EXIT.SETUP);
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base') o.base = argv[++i];
    else if (a === '--head') o.head = argv[++i];
    else if (a === '--depth') o.depth = Number(argv[++i]);
    else if (a === '--record') o.record = argv[++i];
    else if (a === '--root') o.root = argv[++i];
    else if (a === '--json') o.json = true;
    else o._.push(a);
  }
  return o;
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { ok: r.status === 0, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** 范围键：路径前 N 段目录；根目录文件用文件名本身当键。 */
function scopeKey(relPath, depth) {
  const parts = relPath.split('/');
  const dirs = parts.slice(0, -1);
  if (!dirs.length) return relPath;            // 根目录文件：键 = 文件名
  return dirs.slice(0, Math.max(1, depth)).join('/');
}

/** 取某个二级标题下的内容（到下一个同级标题为止），与 verify-record 同口径。 */
function sectionOf(md, headingRe) {
  const lines = md.split('\n');
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headingRe.test(lines[i])) { start = i; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) { end = i; break; }
  }
  return lines.slice(start, end).join('\n');
}

/** 解析 §2.5 表格的「范围」列（第 4 列），返回 { scopes: string[], rows: n }。 */
function parseAssertionScopes(block25) {
  if (!block25) return { scopes: [], rows: 0 };
  const rows = block25.split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length < 3) return { scopes: [], rows: 0 };
  const scopes = [];
  let n = 0;
  for (const line of rows.slice(2)) {
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
    if (cells.every((x) => /^:?-{2,}:?$/.test(x))) continue;
    n++;
    const cell = cells[3] || '';
    for (const s of cell.replace(/`/g, '').split(/[\s,，]+/)) {
      const t = s.trim();
      if (t) scopes.push(t);
    }
  }
  return { scopes, rows: n };
}

/** 解析 §2.6 的理由行。 */
function parseReasonLines(block26) {
  if (!block26) return [];
  return block26.split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('###') && !/^[-|>]*\s*(-{2,}|={2,})/.test(l));
}

function coveredByScopes(key, scopes) {
  const hits = [];
  for (let i = 0; i < scopes.length; i++) {
    const s = scopes[i].replace(/\/+$/, '');
    if (s === key || key.startsWith(s + '/') || s.startsWith(key + '/')) {
      hits.push(scopes[i]);
    }
  }
  return hits;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = path.resolve(args.root || process.cwd());
  if (!args.base) die('缺少 --base。用法：node impact-scope.mjs --base <sha> [--record <md>]');
  const depth = Number.isFinite(args.depth) && args.depth >= 1 ? Math.floor(args.depth) : 2;
  const head = args.head || 'HEAD';

  if (!git(['rev-parse', '--is-inside-work-tree'], root).ok) die(`不是 git 仓库（或 git 不可用）：${root}`);
  for (const ref of [args.base, head]) {
    if (!git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], root).ok) {
      die(`引用不存在或不是提交：${ref}`);
    }
  }

  const diff = git(['diff', '--name-only', args.base, head], root);
  if (!diff.ok) die(`git diff 失败：${diff.out}`);
  const files = diff.out.split('\n').map((s) => s.trim()).filter(Boolean);

  if (!files.length) {
    console.log(`[impact-scope] ${args.base}..${head} 无改动，没有范围键需要闭环`);
    process.exit(EXIT.OK);
  }

  // 聚合：键 → 文件清单
  const keys = new Map();
  for (const f of files) {
    const k = scopeKey(f, depth);
    if (!keys.has(k)) keys.set(k, []);
    keys.get(k).push(f);
  }

  // 档案侧：§2.5 断言范围 + §2.6 理由
  let scopes = [];
  let reasonLines = [];
  let assertionRows = 0;
  let hasRecord = false;
  if (args.record) {
    const rp = path.resolve(root, args.record);
    if (!existsSync(rp)) die(`档案不存在：${rp}`);
    const md = readFileSync(rp, 'utf8');
    const sec2 = sectionOf(md, /^##\s*2[\.、\s].*影响链/m);
    if (sec2 == null) die(`档案里找不到「## 2 …影响链」段：${args.record}`);
    const i25 = sec2.search(/^###\s*2\.5/m);
    const i26 = sec2.search(/^###\s*2\.6/m);
    const block25 = i25 >= 0 ? sec2.slice(i25, i26 > i25 ? i26 : undefined) : '';
    const block26 = i26 >= 0 ? sec2.slice(i26) : '';
    const parsed = parseAssertionScopes(block25);
    scopes = parsed.scopes;
    assertionRows = parsed.rows;
    reasonLines = parseReasonLines(block26);
    hasRecord = true;
  }

  const results = [];
  for (const [key, kfiles] of keys) {
    const viaAssertions = coveredByScopes(key, scopes);
    const reasonLine = reasonLines.find((l) => l.includes(key))
      || [...reasonLines].find((l) => l.replace(/[`*]/g, '').includes(key));
    let covered = false;
    let why = '';
    if (viaAssertions.length) {
      covered = true;
      why = `断言范围：${[...new Set(viaAssertions)].join(', ')}`;
    } else if (reasonLine) {
      const reason = reasonLine.replace(/[`*]/g, '').split(key).join('').trim();
      if (reason.length >= 8) {
        covered = true;
        why = `§2.6 理由：${reason.slice(0, 40)}${reason.length > 40 ? '…' : ''}`;
      } else {
        why = `§2.6 提到了键但理由不足 8 字：「${reason}」`;
      }
    } else if (hasRecord) {
      why = assertionRows === 0
        ? '§2.5 没有任何断言行'
        : '未被任何断言范围覆盖，§2.6 也没有提到';
    } else {
      why = '探察模式（未提供 --record），只列键不判覆盖';
    }
    results.push({ key, files: kfiles.length, covered, why, sample: kfiles.slice(0, 3) });
  }

  if (args.json) {
    console.log(JSON.stringify({
      base: args.base, head, depth, record: args.record || null,
      fileCount: files.length, assertionRows,
      keys: results,
    }, null, 2));
    process.exit(results.some((r) => hasRecord && !r.covered) ? EXIT.UNCOVERED : EXIT.OK);
  }

  console.log(`[impact-scope] ${args.base}..${head}：${files.length} 个文件 → ${results.length} 个范围键（depth=${depth}）`);
  if (hasRecord) console.log(`[impact-scope] 档案 ${args.record}：§2.5 断言 ${assertionRows} 条，范围 ${scopes.length} 个`);
  const uncovered = [];
  for (const r of results) {
    const mark = !hasRecord ? '·' : (r.covered ? '✓' : '✗');
    console.log(`  ${mark} ${r.key}（${r.files} 个文件）— ${r.why}`);
    if (!r.covered) {
      uncovered.push(r.key);
      if (!hasRecord) { /* 探察模式不判红 */ }
    }
  }

  if (hasRecord && uncovered.length) {
    console.log(`\n[impact-scope] FAIL：${uncovered.length} 个范围键未闭环（既无断言覆盖，也无 ≥8 字的 §2.6 理由）`);
    console.log('  处置：为这些键补 §2.5 断言，或在 §2.6 写明不适用理由。不许用「都检查过了」结案。');
    process.exit(EXIT.UNCOVERED);
  }
  console.log(`\n[impact-scope] OK：${hasRecord ? '全部范围键已闭环' : `${results.length} 个键（探察模式）`}`);
  process.exit(EXIT.OK);
}

main();
