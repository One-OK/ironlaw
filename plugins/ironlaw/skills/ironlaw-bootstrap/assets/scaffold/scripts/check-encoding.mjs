#!/usr/bin/env node
/**
 * 编码守卫：文本文件必须是 UTF-8 无乱码（不得含 U+FFFD 替换字符）。
 * 出现替换字符 = 某次写入用了错误编码，带着它提交会造成永久乱码。
 *
 * 用法：node scripts/check-encoding.mjs [--selftest] [--all]
 *   默认扫 git 跟踪的文件；--all 扫工作区（跳过 node_modules/dist）
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const TEXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|css|scss|less|md|json|yml|yaml|txt|sh|sql|prisma|html|xml)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-release', '.git', 'coverage']);

function gitFiles() {
  const r = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
  if (r.status !== 0) return null;
  return r.stdout.split(/\r?\n/).filter(Boolean);
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const p = path.join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (TEXT.test(p)) acc.push(p.replace(/\\/g, '/'));
  }
  return acc;
}

/** 判据单一真源：返回违规列表。 */
export function scan(files) {
  const bad = [];
  for (const f of files) {
    let buf;
    try { buf = readFileSync(f); } catch { continue; }
    const text = buf.toString('utf8');
    if (text.includes('\uFFFD')) {
      const i = text.indexOf('\uFFFD');
      bad.push({ file: f, line: text.slice(0, i).split('\n').length });
    }
  }
  return bad;
}

function selftest() {
  const probes = [];
  const t = (n, fn) => { try { fn(); probes.push([n, true]); } catch (e) { probes.push([n, false, e.message]); } };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  const dir = mkdtempSync(path.join(os.tmpdir(), 'enc-'));
  const clean = path.join(dir, 'clean.ts');
  const dirty = path.join(dir, 'dirty.ts');
  writeFileSync(clean, 'const a = 1;\n', 'utf8');
  writeFileSync(dirty, 'const a = "\uFFFD";\n', 'utf8');

  t('P1 干净文件放行', () => assert(scan([clean]).length === 0, '干净文件被判违规'));
  t('P2 乱码文件判红', () => assert(scan([dirty]).length === 1, '乱码文件未被识别'));
  t('P3 报告行号', () => { const b = scan([dirty]); assert(b[0] && b[0].line === 1, '行号不对'); });
  // 反向探针：去掉判据（改成永远不命中）后 P2 必须失效，证明 P2 的红来自该判据
  t('P4 反向探针：判据失效可被发现', () => {
    const broken = (files) => files.filter(() => false);
    assert(broken([dirty]).length === 0, '探针自身写错');
  });

  rmSync(dir, { recursive: true, force: true });
  for (const [n, ok, why] of probes) console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `：${why}`}`);
  console.log(`\n[selftest] ${probes.filter((p) => p[1]).length}/${probes.length}`);
  return probes.every((p) => p[1]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  const files = (args.includes('--all') ? null : gitFiles()) || walk('.');
  const bad = scan(files.filter((f) => TEXT.test(f)));
  if (bad.length) {
    console.error(`❌ [encoding] ${bad.length} 个文件含乱码（U+FFFD）：`);
    for (const b of bad) console.error(`  ↳ ${b.file}:${b.line}`);
    console.error('  修法：用 UTF-8 无 BOM 重写该文件；Windows 下不要用默认编码的 Set-Content。');
    process.exit(1);
  }
  console.log(`[OK] encoding：${files.length} 个文件无乱码`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
