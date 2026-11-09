#!/usr/bin/env node
/**
 * 变更档案校验器（通用，项目无关）
 *
 * 它做三件事，任一件不过就退出 1：
 *   1. 七段齐全（缺段 fail-closed，不许"以后再补"）
 *   2. §2.5 影响链断言表存在且非空
 *   3. **逐条执行 §2.5 的机器断言**：正则 × 范围 → 按行计数 → 与期望比对
 *
 * 为什么"执行"比"存在"重要：
 *   只检查"有没有写 §2.5"的门禁，会被一行 `| 1 | 待补 | | | |` 骗过去。
 *   真正拦得住的是：把表格当代码跑一遍，计数对不上就红。
 *
 * 用法：
 *   node verify-record.mjs <record.md>
 *   node verify-record.mjs --latest docs/change-records
 *   node verify-record.mjs <record.md> --json
 *
 * 退出码：0 通过 / 1 档案不合格 / 2 参数或文件错误
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const EXIT = { OK: 0, FAIL: 1, SETUP: 2 };

/** 七段：标题关键词足够定位，不强求编号完全一致。 */
const REQUIRED_SECTIONS = [
  { key: '根因', re: /^##\s*1[\.、\s].*根因/m },
  { key: '影响链', re: /^##\s*2[\.、\s].*影响链/m },
  { key: '未修点', re: /^##\s*3[\.、\s].*(未修|不做|范围外|Out)/m },
  { key: '用户可见影响', re: /^##\s*4[\.、\s].*(用户|影响|恢复)/m },
  { key: '回滚方案', re: /^##\s*5[\.、\s].*(回滚|Rollback)/im },
  { key: '验证证据', re: /^##\s*6[\.、\s].*(验证|证据)/m },
  { key: '完成判据', re: /^##\s*7[\.、\s].*(判据|检查|完成)/m },
];

function die(msg) {
  console.error(`\n[verify-record] 错误：${msg}`);
  process.exit(EXIT.SETUP);
}

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--latest') { o.latest = argv[++i]; }
    else if (a === '--json') o.json = true;
    else o._.push(a);
  }
  return o;
}

/** 取目录里最新的 .md（按文件名倒序，约定前缀是日期）。 */
function findLatest(dir) {
  if (!existsSync(dir)) die(`目录不存在：${dir}`);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !/^README/i.test(f))
    .map((f) => path.join(dir, f))
    .filter((p) => statSync(p).isFile());
  if (!files.length) die(`${dir} 下没有 .md 档案`);
  files.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  return files[0];
}

/** 抽取某个二级标题下的内容（到下一个同级标题为止）。 */
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

/** 把 markdown 表格解析成对象数组；第一行表头决定键名。 */
function parseTable(block) {
  const rows = block.split('\n').filter((l) => l.trim().startsWith('|'));
  if (rows.length < 3) return [];
  const cells = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((s) => s.trim());
  const header = cells(rows[0]);
  const out = [];
  for (const line of rows.slice(2)) {           // 跳过分隔行 |---|---|
    const c = cells(line);
    if (c.every((x) => /^:?-{2,}:?$/.test(x))) continue;
    const obj = {};
    header.forEach((h, i) => { obj[h] = c[i] ?? ''; });
    out.push(obj);
  }
  return out;
}

/** 从表格单元里取反引号内的正则；没有反引号就整段当正则。 */
function extractPattern(cell) {
  const m = String(cell).match(/`([^`]+)`/);
  return (m ? m[1] : String(cell)).trim();
}

/** 解析期望：>=N / =N / <=N（只有这三种）。 */
function parseExpect(cell) {
  const s = String(cell).replace(/[`\s]/g, '');
  let m = s.match(/^>=(\d+)$/); if (m) return { op: '>=', n: Number(m[1]) };
  m = s.match(/^<=(\d+)$/); if (m) return { op: '<=', n: Number(m[1]) };
  m = s.match(/^=(\d+)$/); if (m) return { op: '=', n: Number(m[1]) };
  const bare = s.match(/^(\d+)$/); if (bare) return { op: '=', n: Number(bare[1]) };
  return null;
}

/** 范围列：空格或逗号分隔的多个目录/文件。 */
function parseScopes(cell) {
  return String(cell).replace(/[`]/g, '').split(/[\s,，]+/).map((s) => s.trim()).filter(Boolean);
}

function walkFiles(root, rel, acc = []) {
  const abs = path.resolve(root, rel);
  if (!existsSync(abs)) return acc;
  const st = statSync(abs);
  if (st.isFile()) { acc.push(abs); return acc; }
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === 'dist-release') continue;
    walkFiles(root, path.join(rel, name), acc);
  }
  return acc;
}

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|css|scss|md|json|yml|yaml|sh|sql|prisma|html)$/i;

/** 统计目标行数：按行计数（不是按匹配次数），与档案里"实际 N 行"口径一致。 */
function countLines(files, regex) {
  let hits = 0;
  const where = [];
  for (const f of files) {
    if (!TEXT_EXT.test(f)) continue;
    const lines = readFileSync(f, 'utf8').split(/\r?\n/);
    lines.forEach((line, i) => {
      const re = new RegExp(regex.source, regex.flags.includes('g') ? regex.flags : `${regex.flags}g`);
      if (re.test(line)) {
        hits++;
        if (where.length < 5) where.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      }
    });
  }
  return { hits, where };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let file = args._[0];
  if (!file && args.latest) file = findLatest(path.resolve(args.latest));
  if (!file) die('缺少档案路径。用法：node verify-record.mjs <record.md> 或 --latest <dir>');
  const abs = path.resolve(file);
  if (!existsSync(abs)) die(`档案不存在：${abs}`);

  const md = readFileSync(abs, 'utf8');
  const root = process.cwd();
  const problems = [];
  const notes = [];

  // ① 七段齐全
  for (const s of REQUIRED_SECTIONS) {
    if (!s.re.test(md)) problems.push(`缺段「${s.key}」—— 七段是必填，缺一段即不合格`);
  }

  // ② §2.5 断言表
  const sec2 = sectionOf(md, REQUIRED_SECTIONS[1].re) || '';
  const i25 = sec2.search(/^###\s*2\.5/m);
  const i26 = sec2.search(/^###\s*2\.6/m);
  let block25 = '';
  if (i25 >= 0) block25 = sec2.slice(i25, i26 > i25 ? i26 : undefined);
  if (!block25) {
    problems.push('缺 §2.5 影响链断言表 —— 没有机器可跑的断言，影响链等于没写');
  }

  const rows = block25 ? parseTable(block25) : [];
  if (block25 && rows.length === 0) {
    problems.push('§2.5 存在但没有断言行 —— 空表按"没写"处理');
  }

  // ③ 逐条执行断言
  const results = [];
  rows.forEach((row, idx) => {
    const cellsArr = Object.values(row);
    const label = cellsArr[1] || `第 ${idx + 1} 行`;
    const patternCell = cellsArr[2] || '';
    const scopeCell = cellsArr[3] || '';
    const expectCell = cellsArr[4] || '';

    const patSrc = extractPattern(patternCell);
    const expect = parseExpect(expectCell);
    const scopes = parseScopes(scopeCell);

    if (!patSrc) { problems.push(`断言 #${idx + 1}（${label}）缺检索式`); return; }
    if (!expect) { problems.push(`断言 #${idx + 1}（${label}）期望值不合规（只允许 >=N / =N / <=N）`); return; }
    if (!scopes.length) { problems.push(`断言 #${idx + 1}（${label}）缺范围`); return; }

    let regex;
    try { regex = new RegExp(patSrc, 'g'); }
    catch (e) { problems.push(`断言 #${idx + 1}（${label}）正则非法：${e.message}`); return; }

    const files = scopes.flatMap((s) => walkFiles(root, s));
    if (!files.length) {
      problems.push(`断言 #${idx + 1}（${label}）范围全部不存在：${scopes.join(', ')} —— 缺范围不得判通过`);
      return;
    }

    const { hits, where } = countLines(files, regex);
    let ok = false;
    if (expect.op === '>=') ok = hits >= expect.n;
    else if (expect.op === '<=') ok = hits <= expect.n;
    else ok = hits === expect.n;

    results.push({ n: idx + 1, label, pattern: patSrc, expect: `${expect.op}${expect.n}`, hits, ok, where });
    if (!ok) {
      problems.push(`断言 #${idx + 1}（${label}）不成立：期望 ${expect.op}${expect.n}，实际 ${hits} 行`);
    }
  });

  // ④ §7 完成判据必须有负控制列
  const sec7 = sectionOf(md, REQUIRED_SECTIONS[6].re) || '';
  if (!/负控制/.test(sec7)) {
    problems.push('§7 缺「负控制」列 —— 完成判据必须写"改坏什么→哪条转红"');
  }

  if (args.json) {
    console.log(JSON.stringify({ file: abs, ok: problems.length === 0, problems, results, notes }, null, 2));
    process.exit(problems.length ? EXIT.FAIL : EXIT.OK);
  }

  console.log(`[verify-record] ${path.relative(root, abs)}`);
  if (results.length) {
    for (const r of results) {
      console.log(`  ${r.ok ? '✓' : '✗'} #${r.n} ${r.label}：${r.hits} 行（期望 ${r.expect}）`);
      if (!r.ok && r.where.length) console.log(`      命中示例：${r.where.join(' , ')}`);
    }
  }
  for (const n of notes) console.log(`  · ${n}`);

  if (problems.length) {
    console.log(`\n[verify-record] FAIL：${problems.length} 项不合格`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(EXIT.FAIL);
  }
  console.log(`\n[verify-record] OK：七段齐全，${results.length} 条断言全部成立`);
  process.exit(EXIT.OK);
}

main();
