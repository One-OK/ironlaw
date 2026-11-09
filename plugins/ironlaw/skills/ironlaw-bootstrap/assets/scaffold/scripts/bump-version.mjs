#!/usr/bin/env node
/**
 * 多包版本 bump（项目无关模板，随 ironlaw-bootstrap 脚手架铺设）
 *
 * 为什么必须存在：ironlaw-ship 规定「只用脚本 bump，禁止手改」——手改是
 * 「三处不一致 + BOM + merge 冲突标记」的共同根源。规矩要有落点，
 * 脚手架就必须自带这个脚本。
 *
 * 用法：
 *   node scripts/bump-version.mjs                      # patch：0.2.3 → 0.2.4
 *   node scripts/bump-version.mjs minor | major | patch
 *   node scripts/bump-version.mjs --set 1.2.3          # 显式指定版本
 *   node scripts/bump-version.mjs --files package.json,apps/web/package.json
 *
 * 默认文件清单与 pre-push / ship-truth 同源：
 *   package.json + apps/web/package.json + apps/api/package.json（存在才处理）
 *
 * 行为：
 *   · 以清单中第一个文件的版本为基线，计算新版本
 *   · 逐文件做**文本替换**（只替换第一处 "version" 键的值），
 *     保持原有缩进 / 键序 / 行尾，不重排 JSON
 *   · 任一存在的文件找不到 "version": "x.y.z" → 退出 2（不许只 bump 一半）
 *   · 写回后复读全部文件，版本必须一致，否则退出 1
 *   · 文件带 BOM → 退出 2（BOM 由 check-json-bom 守卫，不许在这里静默剥掉）
 *
 * 退出码：0 成功 / 1 写后不一致 / 2 参数或环境错误
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_FILES = ['package.json', 'apps/web/package.json', 'apps/api/package.json'];
const VERSION_KEY = /"version"\s*:\s*"(\d+\.\d+\.\d+)"/;

function die(msg, code = 2) {
  console.error(`[bump-version] ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let setV = null;
let filesArg = null;
const pos = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--set') setV = argv[++i];
  else if (argv[i] === '--files') filesArg = argv[++i];
  else pos.push(argv[i]);
}
const kind = pos[0] || 'patch';
if (!setV && !['major', 'minor', 'patch'].includes(kind)) {
  die(`未知 bump 类型：${kind}（允许 major/minor/patch，或用 --set x.y.z）`);
}
if (setV && !/^\d+\.\d+\.\d+$/.test(setV)) {
  die(`--set 版本不合规：${setV}（要求 x.y.z 三段数字）`);
}

const files = (filesArg ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_FILES)
  .filter((f) => existsSync(path.resolve(f)));
if (!files.length) die('清单里没有任何存在的版本文件（--files 可指定）');

// 先全部读完再写：任何一份不合规都在写盘前失败（fail-closed）
const contents = new Map();
for (const f of files) {
  const raw = readFileSync(f, 'utf8');
  if (raw.charCodeAt(0) === 0xfeff) die(`${f} 带 BOM。先用 check-json-bom 报告的命令去 BOM，再 bump（禁止静默带病写入）`);
  if (!VERSION_KEY.test(raw)) die(`${f} 里找不到 "version": "x.y.z" —— 拒绝只 bump 一半`);
  contents.set(f, raw);
}

const oldV = contents.get(files[0]).match(VERSION_KEY)[1];
let next = setV;
if (!next) {
  const [maj, min, pat] = oldV.split('.').map(Number);
  next = kind === 'major' ? `${maj + 1}.0.0`
    : kind === 'minor' ? `${maj}.${min + 1}.0`
      : `${maj}.${min}.${pat + 1}`;
}

for (const [f, raw] of contents) {
  const updated = raw.replace(VERSION_KEY, (whole, v) => whole.replace(v, next));
  writeFileSync(f, updated, 'utf8');
}

// 写后复读：全部必须同号（否则下次部署前置闸会拦）
const after = [];
for (const f of files) {
  const m = readFileSync(f, 'utf8').match(VERSION_KEY);
  after.push({ f, v: m ? m[1] : null });
}
const bad = after.filter((x) => x.v !== next);
for (const x of after) console.log(`  ${x.f}: ${contents.get(x.f).match(VERSION_KEY)[1]} → ${x.v}`);
if (bad.length) {
  console.error(`[bump-version] FAIL：${bad.length} 个文件写后版本不是 ${next}`);
  process.exit(1);
}
console.log(`[bump-version] OK：${oldV} → ${next}（${files.length} 个文件）`);
