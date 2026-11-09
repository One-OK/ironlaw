#!/usr/bin/env node
/**
 * 全量门禁入口（项目无关模板）
 *
 * 三条设计约束：
 *   1. 步骤表是数据，加一步只改 STEPS。
 *   2. 每个失败都必须打出**原因行**（走共享的 failureLines），否则红了没人能定位。
 *   3. 日志末尾必须有一行独立的 `EXIT=<code>` —— 没有它说明进程中途被杀，结论作废。
 *
 * 用法：
 *   node scripts/check-all.mjs            # 跑全部
 *   node scripts/check-all.mjs 3          # 只跑第 3 步（调试用）
 *   node scripts/check-all.mjs --list     # 列出步骤
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { EXIT, failureLines, sentinelLine } from './lib/gate-runner.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const STEPS = [
  { name: '编码无乱码', cmd: 'node scripts/check-encoding.mjs', timeoutMs: 120_000 },
  { name: 'JSON 无 BOM', cmd: 'node scripts/check-json-bom.mjs', timeoutMs: 120_000 },
  { name: '静态护栏聚合（含注册守卫）', cmd: 'node scripts/check-guards.mjs', timeoutMs: 600_000 },
  // 按项目补充：类型检查 / 单测 / 构建 / 契约检查 ...
  // { name: '类型检查', cmd: 'npx tsc --noEmit', timeoutMs: 300_000 },
  // { name: '单元测试', cmd: 'npm test -- --runInBand', timeoutMs: 1_800_000 },
];

const args = process.argv.slice(2);
if (args.includes('--list')) {
  STEPS.forEach((s, i) => console.log(`  [${i + 1}] ${s.name} — ${s.cmd}`));
  process.exit(EXIT.PASS);
}

// 单步调试：只跑指定步号
let steps = STEPS.map((s, i) => ({ ...s, idx: i + 1 }));
const only = args.find((a) => /^\d+$/.test(a));
if (only) {
  const n = Number(only);
  steps = steps.filter((s) => s.idx === n);
  if (!steps.length) {
    console.error(`没有第 ${n} 步（共 ${STEPS.length} 步）——参数错误按设施错误处理，退出 2`);
    process.exit(EXIT.STOP);
  }
}

const lines = [];
const t0 = Date.now();
const failures = [];

lines.push(`# 门禁运行 ${new Date().toISOString()}`);
lines.push(`# 根目录 ${ROOT}`);
lines.push(`# 步骤数 ${steps.length}`);

for (const step of steps) {
  const started = Date.now();
  process.stdout.write(`[${step.idx}/${STEPS.length}] ${step.name} ... `);
  const r = spawnSync(step.cmd, {
    cwd: ROOT, shell: true, encoding: 'utf8',
    timeout: step.timeoutMs || 600_000, maxBuffer: 64 * 1024 * 1024,
  });
  const ms = Date.now() - started;
  const out = `${r.stdout || ''}${r.stderr || ''}`;

  if (r.status === null) {
    // 超时/被杀是设施错误，不是判据失败 —— 按自己的纪律退出 2，不与产品红混在一起
    console.log(`⏱ 超时/中断 (${(ms / 1000).toFixed(1)}s)`);
    lines.push(`\n[${step.idx}] ${step.name} — 超时/中断 (${ms}ms)`);
    lines.push('↳ 进程未正常退出（可能是超时被杀或资源不足），不等同于判据失败');
    failures.push({ step, reason: '超时/中断', kind: 'facility', lines: ['↳ 进程未正常退出'] });
    continue;
  }

  if (r.status === 0) {
    console.log(`✅ (${(ms / 1000).toFixed(1)}s)`);
    lines.push(`\n[${step.idx}] ${step.name} — PASS (${ms}ms)`);
  } else if (r.status === EXIT.STOP) {
    // 子步自报设施错误（exit 2）：向上传播，不伪装成产品红
    console.log(`⚙ 设施错误 (${(ms / 1000).toFixed(1)}s, exit=2)`);
    lines.push(`\n[${step.idx}] ${step.name} — 设施错误 (exit=2)`);
    lines.push('↳ 子步骤自报配置/设施错误（exit 2），先归因，别当产品缺陷修');
    failures.push({ step, reason: '设施错误(exit=2)', kind: 'facility', lines: ['↳ 子步骤自报设施错误'] });
  } else {
    console.log(`❌ 失败 (${(ms / 1000).toFixed(1)}s, exit=${r.status})`);
    const bad = failureLines(out).slice(0, 20);
    lines.push(`\n[${step.idx}] ${step.name} — FAIL (${ms}ms, exit=${r.status})`);
    for (const l of bad) lines.push(`  ↳ ${l}`);
    lines.push('  --- 输出尾部 40 行 ---');
    lines.push(...out.trim().split('\n').slice(-40).map((l) => `  | ${l}`));
    failures.push({ step, reason: `exit=${r.status}`, kind: 'product', lines: bad });
  }
}

const total = ((Date.now() - t0) / 1000).toFixed(1);
// 退出码语义：产品红优先 1；只有设施类失败时 2；全绿 0
const productFailures = failures.filter((f) => f.kind === 'product');
const facilityFailures = failures.filter((f) => f.kind === 'facility');
const code = productFailures.length ? EXIT.PRODUCT
  : (facilityFailures.length ? EXIT.STOP : EXIT.PASS);

lines.push('');
if (!failures.length) {
  console.log(`\n✅ 全部通过（${total}s）。${steps.length}/${steps.length}`);
  lines.push(`✅ 全部通过（${total}s）。${steps.length}/${steps.length}`);
} else {
  console.error(`\n❌ ${failures.length}/${steps.length} 步失败（${total}s；产品类 ${productFailures.length}，设施类 ${facilityFailures.length}）：`);
  for (const f of failures) {
    console.error(`  - [${f.step.idx}] ${f.step.name}：${f.reason}${f.kind === 'facility' ? '（设施类：先归因，别当产品缺陷修）' : ''}`);
    for (const l of f.lines.slice(0, 6)) console.error(`      ${l}`);
  }
  lines.push(`❌ ${failures.length}/${steps.length} 步失败（产品类 ${productFailures.length}，设施类 ${facilityFailures.length}）`);
}

// 哨兵：必须是独立一行
lines.push(sentinelLine(code));

mkdirSync(path.join(ROOT, '.workbuddy', 'artifacts'), { recursive: true });
writeFileSync(path.join(ROOT, '.workbuddy', 'artifacts', 'gate-run.log'), `${lines.join('\n')}\n`, 'utf8');
console.log(`\n日志：.workbuddy/artifacts/gate-run.log`);
console.log(sentinelLine(code));

process.exit(code);
