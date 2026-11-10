#!/usr/bin/env node
/**
 * package.mjs — 把仓库打成可分发的 zip，零第三方依赖。
 *
 * 设计取舍：
 *   1. **只打 git 跟踪的文件**。node_modules / dist / 临时件天然排除，不靠手写黑名单。
 *   2. **固定时间戳与固定排序**。同样的树打出同样的字节，md5 可复现——
 *      发版时「附件 md5 与本地一致」才有意义；带时间戳的 zip 每次都不一样。
 *   3. **自己写 ZIP 容器**。环境里不一定有 zip 命令，而为了打包引入一个
 *      第三方依赖，和这个项目「零依赖」的主张自相矛盾。
 *
 * 用法：
 *   node scripts/package.mjs            # 打包到 dist/ironlaw-<VERSION>.zip
 *   node scripts/package.mjs --check    # 只校验：现有 zip 的条目是否与当前树一致
 *   node scripts/package.mjs --out a.zip
 *
 * 退出码：0 成功 / 1 打包或校验失败 / 2 参数或环境错误
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const EXIT = { OK: 0, FAIL: 1, ARG: 2 };

/** 打进包里的必须存在的文件，缺一个就判红——空包也是「成功」，那没有意义。 */
const REQUIRED = [
  'README.md',
  'README.en.md',
  'LICENSE',
  'VERSION',
  'CHANGELOG.md',
  'scripts/install.mjs',
  '.codebuddy-plugin/marketplace.json',
  '.claude-plugin/marketplace.json',
  'plugins/ironlaw/.workbuddy-plugin/plugin.json',
  'plugins/ironlaw/.claude-plugin/plugin.json',
  'docs/index.html',
  'docs/en.html',
  'docs/why.html',
  'docs/walkthrough.md',
];

/** 六个技能目录，一个都不能少。 */
const SKILLS = ['ironlaw', 'ironlaw-change', 'ironlaw-gate', 'ironlaw-record', 'ironlaw-ship', 'ironlaw-bootstrap'];

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------- 固定时间戳（可复现构建的关键） ----------
// DOS 时间格式：日期 1980 起算。固定为 2026-01-01 00:00:00。
const DOS_TIME = 0; // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 年 月 日

function utf8(s) {
  return Buffer.from(s, 'utf8');
}

/**
 * 写一个 zip。entries: [{ name, data }]，顺序即写入顺序。
 * 不用 store-only：文本压缩率很高，包体积能小一半以上。
 */
function makeZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = utf8(e.name);
    const raw = e.data;
    const crc = crc32(raw);
    const comp = deflateRawSync(raw, { level: 9 });
    // 压缩后反而更大就存原文（ZIP 允许逐条选方法）
    const useDeflate = comp.length < raw.length;
    const body = useDeflate ? comp : raw;
    const method = useDeflate ? 8 : 0;

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4); // version needed
    lh.writeUInt16LE(0x0800, 6); // UTF-8 名
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(DOS_TIME, 10);
    lh.writeUInt16LE(DOS_DATE, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);

    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4); // version made by
    ch.writeUInt16LE(20, 6); // version needed
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(DOS_TIME, 12);
    ch.writeUInt16LE(DOS_DATE, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30); // extra
    ch.writeUInt16LE(0, 32); // comment
    ch.writeUInt16LE(0, 34); // disk
    ch.writeUInt16LE(0, 36); // internal attr
    ch.writeUInt32LE(0o644 << 16, 38); // external attr
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);

    offset += lh.length + nameBuf.length + body.length;
  }

  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cd, eocd]);
}

function readVersion() {
  const p = join(ROOT, 'VERSION');
  if (!existsSync(p)) die('VERSION 文件不存在');
  const v = readFileSync(p, 'utf8').trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) die(`VERSION 内容不合规：${JSON.stringify(v)}`);
  return v;
}

function die(msg, code = EXIT.FAIL) {
  console.error(`[package] ${msg}`);
  process.exit(code);
}

function md5(buf) {
  return createHash('md5').update(buf).digest('hex');
}

/** 收集要打包的文件：以 git 跟踪清单为准。 */
function collect() {
  let out;
  try {
    out = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer', maxBuffer: 64 << 20 });
  } catch (e) {
    die(`git ls-files 失败（这里不是 git 仓库？）：${e.message}`, EXIT.ARG);
  }
  const files = out
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .sort(); // 固定顺序 → 可复现

  if (files.length === 0) die('git 里没有任何跟踪文件，打出空包没有意义');

  // 未跟踪的新文件不会被打进去，这是最容易「以为打了其实没打」的地方
  let dirty = '';
  try {
    dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    /* status 失败不致命 */
  }
  const untracked = dirty
    .split('\n')
    .filter((l) => l.startsWith('??'))
    .map((l) => l.slice(3).trim());
  if (untracked.length) {
    console.warn(`[package] ⚠ 有 ${untracked.length} 个未跟踪文件不会进包：`);
    untracked.slice(0, 8).forEach((f) => console.warn(`           ${f}`));
    if (untracked.length > 8) console.warn('           …');
  }

  return files;
}

function main() {
  const args = process.argv.slice(2);
  const version = readVersion();
  const prefix = `IronLaw-${version}`;
  const files = collect();

  const outIdx = args.indexOf('--out');
  const outPath = outIdx >= 0 ? resolve(args[outIdx + 1] || '') : join(ROOT, 'dist', `ironlaw-${version}.zip`);

  const entries = files.map((f) => {
    const abs = join(ROOT, f);
    if (!existsSync(abs)) die(`清单里有跟踪文件但磁盘上不存在：${f}`);
    return { name: `${prefix}/${f}`, data: readFileSync(abs) };
  });

  // ---- fail-closed：必需文件与技能目录逐个点名 ----
  const names = new Set(entries.map((e) => e.name.slice(prefix.length + 1)));
  const missing = REQUIRED.filter((f) => !names.has(f));
  if (missing.length) die(`缺必需文件：${missing.join('、')}`);
  const missSkill = SKILLS.filter((s) => !names.has(`plugins/ironlaw/skills/${s}/SKILL.md`));
  if (missSkill.length) die(`缺技能：${missSkill.join('、')}（每个技能目录必须有 SKILL.md）`);

  const zip = makeZip(entries);

  if (args.includes('--check')) {
    if (!existsSync(outPath)) die(`校验失败：${relative(ROOT, outPath)} 不存在`);
    const cur = readFileSync(outPath);
    const same = md5(cur) === md5(zip);
    console.log(`[package] 现有包 ${relative(ROOT, outPath)}`);
    console.log(`           ${cur.length} 字节 md5=${md5(cur)}`);
    console.log(`[package] 当前树重新打包 md5=${md5(zip)}（${zip.length} 字节）`);
    if (!same) die('校验失败：现有包与当前树不一致，需要重新打包');
    console.log('[package] OK：现有包与当前树逐字节一致');
    process.exit(EXIT.OK);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, zip);

  console.log(`[package] 版本 ${version} → ${relative(ROOT, outPath)}`);
  console.log(`           ${entries.length} 个条目，${zip.length} 字节（${(zip.length / 1024).toFixed(1)} KB）`);
  console.log(`           md5=${md5(zip)}`);
  console.log('[package] OK：已生成');
  process.exit(EXIT.OK);
}

main();
