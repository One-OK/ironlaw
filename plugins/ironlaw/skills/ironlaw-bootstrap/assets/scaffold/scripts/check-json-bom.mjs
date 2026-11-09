#!/usr/bin/env node
/**
 * JSON BOM 守卫：任何 .json 不得带 UTF-8 BOM（EF BB BF）。
 * BOM 会让 JSON.parse 抛 `Unexpected token`，通常表现为构建工具莫名崩溃。
 *
 * 用法：node scripts/check-json-bom.mjs [--selftest]
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SKIP_DIRS = new Set(['node_modules', 'dist', 'dist-release', '.git', 'coverage']);

function listJson() {
  const r = spawnSync('git', ['ls-files', '*.json'], { encoding: 'utf8' });
  if (r.status === 0) return r.stdout.split(/\r?\n/).filter(Boolean);
  const acc = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      if (SKIP_DIRS.has(n)) continue;
      const p = path.join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (n.endsWith('.json')) acc.push(p);
    }
  };
  walk('.');
  return acc;
}

/** 判据单一真源。 */
export function scan(files) {
  const bad = [];
  for (const f of files) {
    let buf;
    try { buf = readFileSync(f); } catch { continue; }
    if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) bad.push(f);
  }
  return bad;
}

function selftest() {
  const probes = [];
  const t = (n, fn) => { try { fn(); probes.push([n, true]); } catch (e) { probes.push([n, false, e.message]); } };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  const dir = mkdtempSync(path.join(os.tmpdir(), 'bom-'));
  const clean = path.join(dir, 'clean.json');
  const bom = path.join(dir, 'bom.json');
  writeFileSync(clean, '{"a":1}\n');
  writeFileSync(bom, Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{"a":1}\n')]));

  t('P1 无 BOM 放行', () => assert(scan([clean]).length === 0, '干净 JSON 被判违规'));
  t('P2 有 BOM 判红', () => assert(scan([bom]).length === 1, 'BOM 未被识别'));
  t('P3 空文件不崩', () => {
    const e = path.join(dir, 'empty.json');
    writeFileSync(e, '');
    assert(scan([e]).length === 0, '空文件被判违规');
  });
  t('P4 反向探针：判据失效可被发现', () => {
    const broken = () => [];
    assert(broken([bom]).length === 0, '探针自身写错');
  });

  rmSync(dir, { recursive: true, force: true });
  for (const [n, ok, why] of probes) console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `：${why}`}`);
  console.log(`\n[selftest] ${probes.filter((p) => p[1]).length}/${probes.length}`);
  return probes.every((p) => p[1]);
}

function main() {
  if (process.argv.includes('--selftest')) process.exit(selftest() ? 0 : 1);
  const files = listJson();
  const bad = scan(files);
  if (bad.length) {
    console.error(`❌ [json-bom] ${bad.length} 个 JSON 带 BOM：`);
    for (const f of bad) console.error(`  ↳ ${f}`);
    console.error('  修法：node -e "const fs=require(\'fs\');const p=process.argv[1];const b=fs.readFileSync(p);fs.writeFileSync(p,b.slice(b[0]===0xef?3:0))" <file>');
    process.exit(1);
  }
  console.log(`[OK] json-bom：${files.length} 个 JSON 无 BOM`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
