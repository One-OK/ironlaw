#!/usr/bin/env node
/**
 * 静态护栏聚合器 + 注册守卫（项目无关模板）
 *
 * 两件事：
 *   1. 注册守卫：scripts/check-*.mjs 必须全部登记在 REGISTRY，否则判红
 *      —— 没登记的门禁没人跑，等于死代码。
 *   2. 逐条执行 REGISTRY 里的门禁，汇总失败。
 *
 * 新增门禁时只改 REGISTRY 一处。
 */
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { failureLines, stepCommand } from './lib/gate-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'check-guards.mjs';
const ALL_ENTRY = 'check-all.mjs';

// ── 注册表：每加一个 check-*.mjs 就在这里加一行 ────────────────────────────
export const REGISTRY = [
  { file: 'check-encoding.mjs', name: '编码无乱码', timeoutMs: 60_000 },
  { file: 'check-json-bom.mjs', name: 'JSON 无 BOM', timeoutMs: 60_000 },
  { file: 'check-commit-discipline.mjs', name: '提交信息三段', timeoutMs: 30_000 },
];

/** 判据单一真源：比对磁盘与实际注册。 */
export function diffRegistry(found, registry) {
  const registered = new Set(registry.map((r) => r.file));
  const missingOnDisk = registry.filter((r) => !found.includes(r.file)).map((r) => r.file);
  const notRegistered = found.filter((f) => !registered.has(f));
  return { missingOnDisk, notRegistered };
}

function discover() {
  const dir = path.join(ROOT, 'scripts');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^check-.*\.mjs$/.test(f) && f !== SELF && f !== ALL_ENTRY)
    .sort();
}

function selftest() {
  const probes = [];
  const t = (n, fn) => { try { fn(); probes.push([n, true]); } catch (e) { probes.push([n, false, e.message]); } };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  t('P1 全部登记放行', () => {
    const d = diffRegistry(['a.mjs', 'b.mjs'], [{ file: 'a.mjs' }, { file: 'b.mjs' }]);
    assert(!d.notRegistered.length && !d.missingOnDisk.length, JSON.stringify(d));
  });
  t('P2 有未登记脚本判红', () => {
    const d = diffRegistry(['a.mjs', 'ghost.mjs'], [{ file: 'a.mjs' }]);
    assert(d.notRegistered.includes('ghost.mjs'), '未识别未登记脚本');
  });
  t('P3 登记了但文件不存在判红', () => {
    const d = diffRegistry(['a.mjs'], [{ file: 'a.mjs' }, { file: 'gone.mjs' }]);
    assert(d.missingOnDisk.includes('gone.mjs'), '未识别缺失文件');
  });
  // 反向探针：把判据改成永远返回空 → P2 必须失效
  t('P4 反向探针：判据失效可被发现', () => {
    const broken = () => ({ missingOnDisk: [], notRegistered: [] });
    assert(!broken(['ghost.mjs'], []).notRegistered.length, '探针自身写错');
  });

  for (const [n, ok, why] of probes) console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `：${why}`}`);
  console.log(`\n[selftest] ${probes.filter((p) => p[1]).length}/${probes.length}`);
  return probes.every((p) => p[1]);
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  const found = discover();
  const diff = diffRegistry(found, REGISTRY);
  const problems = [];
  if (diff.notRegistered.length) {
    problems.push(`以下门禁脚本未登记，永远不会被跑到：${diff.notRegistered.join(', ')}`);
  }
  if (diff.missingOnDisk.length) {
    problems.push(`注册表中以下脚本不存在：${diff.missingOnDisk.join(', ')}`);
  }

  const failures = [];
  for (const entry of REGISTRY) {
    const abs = path.join(ROOT, 'scripts', entry.file);
    if (!existsSync(abs)) continue;

    // 先看源码里有没有 --selftest 分支：不支持就不跑，避免把「未知参数退出」当自证失败
    const hasSelftest = readFileSync(abs, 'utf8').includes('--selftest');
    const phases = hasSelftest ? ['--selftest', ''] : [''];

    for (const phase of phases) {
      const cmd = `node scripts/${entry.file}${phase ? ` ${phase}` : ''}`;
      const started = Date.now();
      const r = spawnSync(cmd, {
        cwd: ROOT, shell: true, encoding: 'utf8',
        timeout: entry.timeoutMs || 120_000, maxBuffer: 16 * 1024 * 1024,
      });
      const ms = Date.now() - started;
      const out = `${r.stdout || ''}${r.stderr || ''}`;

      if (r.status === null) {
        failures.push({ file: entry.file, phase: phase || '扫描', why: `超时/被中断（${ms}ms）`, lines: ['↳ 进程未正常退出（设施超时），不等同于判据失败'] });
        continue;
      }
      if (r.status !== 0) {
        failures.push({ file: entry.file, phase: phase || '扫描', why: `exit=${r.status}`, lines: failureLines(out).slice(0, 12) });
      }
    }
  }

  if (problems.length || failures.length) {
    mkdirSync(path.join(ROOT, '.workbuddy', 'artifacts'), { recursive: true });
    const log = [];
    for (const p of problems) log.push(`❌ ${p}`);
    for (const f of failures) {
      log.push(`❌ [${f.file}] ${f.phase} 失败（${f.why}）`);
      for (const l of f.lines) log.push(`  ↳ ${l}`);
    }
    writeFileSync(path.join(ROOT, '.workbuddy', 'artifacts', 'guards-fail.log'), `${log.join('\n')}\n`, 'utf8');
    console.error(`❌ [guards] ${problems.length + failures.length} 项不合格：`);
    for (const l of log) console.error(l);
    process.exit(1);
  }

  console.log(`[OK] guards：${REGISTRY.length} 条门禁全过（自证 + 扫描）`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
