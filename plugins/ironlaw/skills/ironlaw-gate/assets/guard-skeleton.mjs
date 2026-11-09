#!/usr/bin/env node
/**
 * 守卫骨架（复制到项目的 scripts/check-<topic>.mjs 后改 RULES 与 evaluate 即可）
 *
 * 内置的结构性保障（不要删）：
 *   1. `evaluate(files)` 是**唯一判据真源** —— 正式扫描与自证共用它，
 *      避免「自证绿的逻辑」和「生产判红的逻辑」是两份代码。
 *   2. 缺文件 fail-closed —— 目标目录不存在直接判红，不是静默跳过。
 *   3. 自证含**反向探针** —— 正例必中、反例必放行、去掉判据必红。
 *   4. 退出码 0/1 只表达「通过/不通过」；设施错误用 2，与判据失败区分。
 *
 * 用法：
 *   node scripts/check-<topic>.mjs            # 正式扫描
 *   node scripts/check-<topic>.mjs --selftest # 自证（必须全通过）
 *   node scripts/check-<topic>.mjs --json     # 机器可读
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();

// ── 1. 规则表：唯一可改的地方 ───────────────────────────────────────────────
// scope: 相对仓库根的目录（必须存在，否则 fail-closed）
// pattern: JS 正则
// expect: 'absent' 零命中才算过 | 'present' 至少 min 命中才算过
const RULES = [
  {
    id: 'no-placeholder-copy',
    desc: '用户可见文案不得残留占位描述',
    scope: 'src',
    ext: ['.ts', '.tsx', '.vue', '.js'],
    pattern: /TODO_COPY|占位文案|Lorem ipsum/g,
    expect: 'absent',
  },
  {
    id: 'has-version-source',
    desc: '版本号必须从单一真源读取',
    scope: 'src',
    ext: ['.ts', '.tsx'],
    pattern: /from\s+['"].*\/version['"]/g,
    expect: 'present',
    min: 1,
  },
];

// ── 2. 判据实现（单一真源）─────────────────────────────────────────────────
/** 收集范围内文件；目录缺失直接抛错（fail-closed）。 */
export function collectFiles(root, rule) {
  const dir = path.join(root, rule.scope);
  if (!existsSync(dir)) {
    throw new Error(`范围目录不存在：${rule.scope}（缺目录不得静默跳过）`);
  }
  const out = [];
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      if (name === 'node_modules' || name.startsWith('.')) continue;
      const p = path.join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p);
      else if (!rule.ext || rule.ext.some((e) => p.endsWith(e))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** 命中计数：pattern 必须是带 g 的正则，否则 lastIndex 会漏。 */
export function countHits(text, pattern) {
  const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
  re.lastIndex = 0;
  let n = 0;
  while (re.exec(text) !== null) n++;
  return n;
}

/**
 * 唯一判据真源。
 * @param {{rel:string, text:string}[]} files 已加载的文件
 * @param {object[]} rules 规则表
 * @returns {{ok:boolean, violations:object[], counts:Record<string,number>}}
 */
export function evaluate(files, rules = RULES) {
  const violations = [];
  const counts = {};
  for (const rule of rules) {
    let total = 0;
    for (const f of files) {
      const n = countHits(f.text, rule.pattern);
      if (n > 0 && rule.expect === 'absent') {
        violations.push({ rule: rule.id, file: f.rel, hits: n, desc: rule.desc });
      }
      total += n;
    }
    counts[rule.id] = total;
    if (rule.expect === 'present' && total < (rule.min ?? 1)) {
      violations.push({
        rule: rule.id,
        file: '(全范围)',
        hits: total,
        desc: `${rule.desc}：期望至少 ${rule.min ?? 1} 处，实际 ${total} 处`,
      });
    }
  }
  return { ok: violations.length === 0, violations, counts };
}

function loadReal(root) {
  const files = [];
  for (const rule of RULES) {
    for (const abs of collectFiles(root, rule)) {
      const rel = path.relative(root, abs).replace(/\\/g, '/');
      if (files.some((f) => f.rel === rel)) continue;
      files.push({ rel, text: readFileSync(abs, 'utf8') });
    }
  }
  return files;
}

// ── 3. 自证：正例 / 反例 / 反向探针 ────────────────────────────────────────
function selftest() {
  const probes = [];
  const t = (name, fn) => {
    try { fn(); probes.push({ name, ok: true }); }
    catch (e) { probes.push({ name, ok: false, why: e.message }); }
  };
  const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

  // 正例：干净样本必须放行
  t('P1 干净样本放行', () => {
    const r = evaluate([
      { rel: 'a.ts', text: 'import { v } from "./version";\nconst x = 1;\n' },
    ]);
    assert(r.ok, `期望放行，实际违规 ${JSON.stringify(r.violations)}`);
  });

  // 反例：含占位文案必须判红
  t('P2 占位文案判红', () => {
    const r = evaluate([{ rel: 'a.ts', text: 'const x = "占位文案";\n' }]);
    assert(!r.ok && r.violations.some((v) => v.rule === 'no-placeholder-copy'), '期望命中占位规则');
  });

  // 反例：缺必需模式必须判红
  t('P3 缺必需模式判红', () => {
    const r = evaluate([{ rel: 'a.ts', text: 'const x = 1;\n' }]);
    assert(!r.ok && r.violations.some((v) => v.rule === 'has-version-source'), '期望命中缺失规则');
  });

  // 反向探针：把 absent 判据改成永远通过 → 必须能被识破
  t('P4 反向探针：判据失效必被发现', () => {
    const brokenRules = RULES.map((r) => (r.id === 'no-placeholder-copy' ? { ...r, pattern: /__NEVER_MATCH__/g } : r));
    const r = evaluate([{ rel: 'a.ts', text: 'const x = "占位文案";\nimport { v } from "./version";\n' }], brokenRules);
    // 判据被改坏后这一条不再报红 —— 说明 P2 的转红确实来自该判据，而不是别的东西
    assert(!r.violations.some((v) => v.rule === 'no-placeholder-copy'),
      '判据被改坏后仍然报红，说明 P2 的红不来自该判据，探针无效');
  });

  // 空数据：空文件集不得崩，也不得假绿掉 present 规则
  t('P5 空数据 fail-closed', () => {
    const r = evaluate([]);
    assert(!r.ok, '空文件集必须因 present 规则不满足而判红（不得假绿）');
  });

  const bad = probes.filter((p) => !p.ok);
  for (const p of probes) console.log(`  ${p.ok ? '✓' : '✗'} ${p.name}${p.ok ? '' : `：${p.why}`}`);
  console.log(`\n[selftest] ${probes.length - bad.length}/${probes.length}`);
  return bad.length === 0;
}

// ── 4. 入口 ────────────────────────────────────────────────────────────────
function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    const ok = selftest();
    process.exit(ok ? 0 : 1);
  }

  let files;
  try {
    files = loadReal(ROOT);
  } catch (e) {
    console.error(`❌ [guard] 无法加载：${e.message}`);
    process.exit(1); // 缺目录 = 判红，不是跳过
  }
  const result = evaluate(files);

  if (args.includes('--json')) {
    console.log(JSON.stringify({ ok: result.ok, counts: result.counts, violations: result.violations }, null, 2));
    process.exit(result.ok ? 0 : 1);
  }

  if (!result.ok) {
    console.error(`❌ [guard] ${result.violations.length} 处违规：`);
    for (const v of result.violations) {
      console.error(`  - [${v.rule}] ${v.desc}`);
      console.error(`    ↳ 位置: ${v.file} (${v.hits} 处)`);
    }
    process.exit(1);
  }
  console.log(`[OK] ${files.length} 个文件，${RULES.length} 条判据全过`);
}

// 允许被 import（供别的脚本复用 evaluate）；直接执行时才跑 main。
const isMain = !!process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();

export { RULES, selftest };
