#!/usr/bin/env node
/**
 * IronLaw 安装器（零依赖）
 *
 *   node scripts/install.mjs                    # 安装到 ~/.workbuddy/skills
 *   node scripts/install.mjs --dry-run          # 只看会做什么
 *   node scripts/install.mjs --prune-legacy     # 同时把旧版同名技能归档
 *   node scripts/install.mjs --target <dir>     # 装到别处（如项目级 .workbuddy/skills）
 *   node scripts/install.mjs --list             # 列出包内容
 *
 * 退出码：0 成功 / 1 失败 / 2 参数或环境错误
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// 不用 import.meta.dirname（Node < 20.11 没有）：低版本会直接 TypeError 崩溃，报错无法理解
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG_SKILLS = path.join(ROOT, 'plugins', 'ironlaw', 'skills');

// IronLaw 之前的散装技能名，安装时可归档
const LEGACY_NAMES = ['change-discipline', 'gate-engineering', 'change-record', 'ship-closure', 'project-bootstrap'];

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : undefined;
};

const DRY = has('--dry-run');
const PRUNE = has('--prune-legacy');
const LIST = has('--list');
const TARGET = valOf('--target') || path.join(os.homedir(), '.workbuddy', 'skills');

function die(msg, code = 2) {
  console.error(`[ironlaw] ${msg}`);
  process.exit(code);
}

if (!existsSync(PKG_SKILLS)) die(`包内 skills 目录不存在：${PKG_SKILLS}`);

const skills = readdirSync(PKG_SKILLS).filter((d) => statSync(path.join(PKG_SKILLS, d)).isDirectory());

// —— 包完整性自检：每个技能必须有 SKILL.md，且 name 与目录名一致 ——
const problems = [];
for (const s of skills) {
  const f = path.join(PKG_SKILLS, s, 'SKILL.md');
  if (!existsSync(f)) {
    problems.push(`${s}: 缺 SKILL.md`);
    continue;
  }
  const src = readFileSync(f, 'utf8');
  const m = src.match(/^name:\s*(.+)$/m);
  if (!m) problems.push(`${s}: SKILL.md 缺 name 字段`);
  else if (m[1].trim() !== s) problems.push(`${s}: name 字段为「${m[1].trim()}」，与目录名不一致`);
  if (!/^description:\s*\S/m.test(src)) problems.push(`${s}: 缺 description（否则无法被自动触发）`);
}
if (problems.length) {
  console.error('[ironlaw] 包自检失败：');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}

if (LIST) {
  console.log(`[ironlaw] 版本 ${readFileSync(path.join(ROOT, 'VERSION'), 'utf8').trim()}`);
  console.log(`[ironlaw] 技能 ${skills.length} 个：`);
  for (const s of skills) {
    const src = readFileSync(path.join(PKG_SKILLS, s, 'SKILL.md'), 'utf8');
    const zh = (src.match(/^display_name_zh:\s*(.+)$/m) || [, ''])[1].trim();
    console.log(`  ${s.padEnd(20)} ${zh}`);
  }
  const cmds = path.join(ROOT, 'plugins', 'ironlaw', 'commands');
  if (existsSync(cmds)) {
    console.log(`[ironlaw] 斜杠命令 ${readdirSync(cmds).length} 个：`);
    for (const c of readdirSync(cmds)) console.log('  /' + c.replace(/\.md$/, ''));
  }
  process.exit(0);
}

console.log(`[ironlaw] 包自检 OK（${skills.length} 个技能）`);
console.log(`[ironlaw] 目标目录：${TARGET}${DRY ? '  (dry-run)' : ''}`);

if (DRY) {
  for (const s of skills) console.log(`  will install: ${s}`);
  if (PRUNE) {
    const present = LEGACY_NAMES.filter((n) => existsSync(path.join(TARGET, n)));
    for (const n of present) console.log(`  will archive: ${n} -> .legacy-<timestamp>/${n}`);
  }
  console.log('[ironlaw] dry-run 结束，未改动任何文件');
  process.exit(0);
}

if (!existsSync(TARGET)) mkdirSync(TARGET, { recursive: true });

// —— 归档旧版散装技能 ——
if (PRUNE) {
  const present = LEGACY_NAMES.filter((n) => existsSync(path.join(TARGET, n)));
  if (present.length) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const trunk = path.join(TARGET, `.legacy-${stamp}`);
    mkdirSync(trunk, { recursive: true });
    for (const n of present) {
      renameSync(path.join(TARGET, n), path.join(trunk, n));
      console.log(`[ironlaw] 已归档旧技能：${n}`);
    }
    console.log(`[ironlaw] 归档位置：${trunk}（确认无误后可自行删除）`);
  }
}

// —— 安装（幂等覆盖）——
let installed = 0;
for (const s of skills) {
  const from = path.join(PKG_SKILLS, s);
  const to = path.join(TARGET, s);
  if (existsSync(to)) rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  installed++;
}

// —— 装后复验：真的可读、真的在 ——
const bad = [];
for (const s of skills) {
  const f = path.join(TARGET, s, 'SKILL.md');
  if (!existsSync(f)) bad.push(`${s}: 安装后找不到 SKILL.md`);
}
if (bad.length) {
  console.error('[ironlaw] 安装后复验失败：');
  for (const b of bad) console.error('  - ' + b);
  process.exit(1);
}

console.log(`[ironlaw] 已安装 ${installed} 个技能到 ${TARGET}`);
console.log('[ironlaw] 重启 WorkBuddy 会话后生效。可用：');
console.log('  /ironlaw            总入口（一句话路由）');
console.log('  /ironlaw-change     改动纪律');
console.log('  /ironlaw-gate       门禁工程');
console.log('  /ironlaw-record     变更档案');
console.log('  /ironlaw-ship       上线闭环');
console.log('  /ironlaw-bootstrap  项目脚手架');
process.exit(0);
