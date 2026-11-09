#!/usr/bin/env node
/**
 * 反向变异探针（通用，项目无关）
 *
 * 目的：证明一条守卫/判据真的会红。只有正向探针（喂正确数据→通过）分不清
 *       「实现了」和「没实现」；必须有一条「把保护去掉 → 必须转红」。
 *
 * 做法：快照原文件 → 精确变异 → 跑守卫命令 → **必须非 0 退出** → 逐字节复原 → md5 比对。
 *       任一案例变异后仍然绿 = 守护是假的，本工具返回 1。
 *
 * 用法 A（配置文件，推荐）：
 *   node reverse-probe.mjs --config probe.json
 *
 *   probe.json:
 *   {
 *     "file": "src/guard-target.ts",
 *     "cases": [
 *       { "label": "去掉空数据判红分支", "find": "if (!rows.length) return 1;", "replace": "if (!rows.length) return 0;" },
 *       { "label": "判据改成永远通过", "file": "scripts/check-x.mjs", "find": "ok = evaluate(rows);", "replace": "ok = true;" }
 *     ],
 *     "cmd": "node scripts/check-x.mjs",
 *     "expectHits": 1
 *   }
 *
 * 用法 B（命令行单案例）：
 *   node reverse-probe.mjs --file src/a.ts --find "OLD" --replace "NEW" \
 *        --cmd "node scripts/check-a.mjs" --label "某变异"
 *
 * 退出码：
 *   0 = 全部案例「变异后转红」且「复原后逐字节一致」
 *   1 = 有案例变异后仍然通过（假守护），或复原后 md5 不一致
 *   2 = 配置/环境错误（找不到文件、find 命中数不符、命令不存在）
 *
 * 铁律：不许用「反向字符串替换」复原。必须用快照 + md5 比对，否则你以为复原了，
 *       实际留下了空白/行尾/编码污染。
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const EXIT = { OK: 0, FAIL: 1, SETUP: 2 };

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[key] = true;
      else { out[key] = next; i++; }
    } else out._.push(a);
  }
  return out;
}

function die(msg) {
  console.error(`\n[reverse-probe] 配置/环境错误：${msg}`);
  process.exit(EXIT.SETUP);
}

/** 精确替换，命中数必须等于期望值（默认 1）——防止「改到了相似的另一处」。 */
function applyMutation(src, find, replace, expectHits, label) {
  if (!find) die(`案例「${label}」缺少 find 表达式`);
  let hits = 0;
  let idx = 0;
  while ((idx = src.indexOf(find, idx)) !== -1) { hits++; idx += find.length; }
  if (hits !== expectHits) {
    die(`案例「${label}」的 find 命中 ${hits} 处，期望 ${expectHits} 处。\n`
      + `  find: ${JSON.stringify(find.slice(0, 120))}\n`
      + '  命中数不符时变异可能改到了错误的位置，结论无效。请把 find 写得更长更具体。');
  }
  return src.split(find).join(replace);
}

function runCmd(cmd, cwd) {
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  return {
    status: r.status,
    error: r.error ? String(r.error.message) : '',
    out,
    // spawn 失败（命令不存在等）不等于「判据转红」，必须区分
    spawnFailed: !!r.error || r.status === null,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = path.resolve(args.cwd || process.cwd());

  let config;
  if (args.config) {
    const p = path.resolve(cwd, args.config);
    if (!existsSync(p)) die(`找不到配置文件 ${p}`);
    try {
      config = JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      die(`配置文件不是合法 JSON：${e.message}`);
    }
  } else {
    if (!args.file || !args.find || !args.cmd) {
      die('缺少参数。用 --config <json>，或 --file --find --replace --cmd');
    }
    config = {
      file: args.file,
      cmd: args.cmd,
      expectHits: 1,
      cases: [{ label: args.label || '单案例', find: args.find, replace: args.replace ?? '' }],
    };
  }

  const defaultCmd = config.cmd;
  const expectHits = Number.isFinite(Number(config.expectHits)) ? Number(config.expectHits) : 1;
  const cases = Array.isArray(config.cases) ? config.cases : [];
  if (!cases.length) die('cases 为空：没有任何变异案例可跑');

  // 先做一次「基线必须通过」，否则变异后的红没有意义
  const baselineCmd = config.baselineCmd || defaultCmd;
  if (!baselineCmd) die('缺少 cmd（守卫的运行命令）');

  console.log(`[reverse-probe] 根目录 ${cwd}`);
  console.log(`[reverse-probe] 基线命令：${baselineCmd}`);
  const baseline = runCmd(baselineCmd, cwd);
  if (baseline.spawnFailed) {
    die(`基线命令无法执行（不是判据失败）：${baseline.error || 'status=null'}\n${baseline.out.slice(-800)}`);
  }
  if (baseline.status !== 0) {
    console.error('\n[reverse-probe] 基线未通过 —— 先修守卫本身，再做反向探针。');
    console.error(baseline.out.slice(-1500));
    process.exit(EXIT.SETUP);
  }
  console.log('[reverse-probe] 基线通过 ✓\n');

  let failures = 0;
  const touched = new Map(); // absPath -> { original: Buffer, hash }

  // 任何路径异常都要复原，避免留下污染
  const restoreAll = () => {
    for (const [abs, rec] of touched) {
      writeFileSync(abs, rec.original);
      const now = md5(readFileSync(abs));
      if (now !== rec.hash) {
        console.error(`[reverse-probe] ⛔ 复原失败：${abs}\n  before=${rec.hash}\n  after =${now}`);
        failures++;
      }
    }
    touched.clear();
  };

  const onSignal = (sig) => {
    console.error(`\n[reverse-probe] 收到 ${sig}，正在复原...`);
    restoreAll();
    process.exit(EXIT.SETUP);
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  try {
    cases.forEach((c, i) => {
      const label = c.label || `案例 ${i + 1}`;
      const relFile = c.file || config.file;
      if (!relFile) die(`案例「${label}」未指定 file`);
      const abs = path.resolve(cwd, relFile);
      if (!existsSync(abs)) die(`案例「${label}」文件不存在：${abs}`);

      const original = readFileSync(abs);
      if (!touched.has(abs)) {
        touched.set(abs, { original, hash: md5(original) });
        // 额外落一份磁盘备份：进程被强杀时人工可救
        const bak = path.join(os.tmpdir(), `reverse-probe-${md5(Buffer.from(abs))}.bak`);
        copyFileSync(abs, bak);
        console.log(`[reverse-probe] 快照 ${relFile} md5=${md5(original)} → ${bak}`);
      }
      const rec = touched.get(abs);

      const text = original.toString('utf8');
      const mutated = applyMutation(text, c.find, c.replace ?? '', 
        Number.isFinite(Number(c.expectHits)) ? Number(c.expectHits) : expectHits, label);

      writeFileSync(abs, mutated, 'utf8');
      const cmd = c.cmd || defaultCmd;
      const r = runCmd(cmd, cwd);

      // 立刻复原这一份（不等循环结束）
      writeFileSync(abs, rec.original);
      const after = md5(readFileSync(abs));

      const restoredOk = after === rec.hash;
      const turnedRed = !r.spawnFailed && r.status !== 0;

      if (r.spawnFailed) {
        console.log(`  ✗ ${label}：命令无法执行（配置问题，不能算转红）`);
        console.log(`     ${r.error || 'status=null'}`);
        failures++;
      } else if (!turnedRed) {
        console.log(`  ✗ ${label}：变异后守卫**仍然通过** —— 这是假守护`);
        console.log('     变异后必须非 0 退出；现在退出码 0。');
        failures++;
      } else if (!restoredOk) {
        console.log(`  ✗ ${label}：转红 ✓ 但复原不一致`);
        console.log(`     before=${rec.hash} after=${after}`);
        failures++;
      } else {
        const firstRed = String(r.out).split('\n').find((l) => /❌|✗|FAIL|失败|Error|错误/.test(l));
        console.log(`  ✓ ${label}：转红（exit=${r.status}）且复原一致`);
        if (firstRed) console.log(`     首个红行：${firstRed.trim().slice(0, 160)}`);
      }
    });
  } finally {
    restoreAll();
  }

  if (failures) {
    console.log(`\n[reverse-probe] FAIL：${failures} 个案例不合格`);
    process.exit(EXIT.FAIL);
  }
  console.log(`\n[reverse-probe] OK：${cases.length} 个案例全部「变异转红 + 逐字节复原」`);
  process.exit(EXIT.OK);
}

main();
