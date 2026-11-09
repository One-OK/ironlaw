#!/usr/bin/env node
/**
 * 新项目纪律脚手架安装器（幂等）
 *
 * 把 assets/scaffold/ 下的纪律设施铺到目标仓库：钩子、门禁、共享件、文档模板。
 *
 *   已存在的文件默认**跳过不覆盖**（避免把用户已写的 AGENTS.md 冲掉）。
 *   --force  覆盖已存在文件（会先打印被覆盖清单，建议先 git commit）
 *   --dry-run 只打印计划，不写盘
 *
 * 用法：
 *   node init-project.mjs                      # 装到当前目录
 *   node init-project.mjs ../new-project
 *   node init-project.mjs --dry-run
 */
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCAFFOLD = path.resolve(HERE, '..', 'assets', 'scaffold');

function parseArgs(argv) {
  const o = { _: [], force: false, dry: false };
  for (const a of argv) {
    if (a === '--force') o.force = true;
    else if (a === '--dry-run') o.dry = true;
    else o._.push(a);
  }
  return o;
}

function walk(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, base, acc);
    else acc.push(path.relative(base, p));
  }
  return acc;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = path.resolve(args._[0] || process.cwd());

  if (!existsSync(SCAFFOLD)) {
    console.error(`[init-project] 找不到脚手架目录：${SCAFFOLD}`);
    process.exit(2);
  }
  if (!existsSync(target) || !statSync(target).isDirectory()) {
    console.error(`[init-project] 目标目录不存在：${target}`);
    process.exit(2);
  }

  const files = walk(SCAFFOLD).sort();
  const created = [];
  const skipped = [];
  const overwritten = [];

  for (const rel of files) {
    const src = path.join(SCAFFOLD, rel);
    const dst = path.join(target, rel);
    const existed = existsSync(dst);

    if (existed && !args.force) { skipped.push(rel); continue; }

    if (args.dry) {
      (existed ? overwritten : created).push(rel);
      continue;
    }

    mkdirSync(path.dirname(dst), { recursive: true });
    copyFileSync(src, dst);

    // 钩子与脚本需要可执行位
    if (rel.startsWith('.githooks/') || rel.endsWith('.mjs') || rel.endsWith('.sh')) {
      try { chmodSync(dst, 0o755); } catch { /* Windows 上无实际意义，忽略 */ }
    }

    (existed ? overwritten : created).push(rel);
  }

  // 若目标是 git 仓库，把钩子目录指过去
  let hookMsg = '';
  if (!args.dry) {
    const isGit = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: target, encoding: 'utf8' }).status === 0;
    if (isGit) {
      const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: target, encoding: 'utf8' });
      hookMsg = r.status === 0 ? '已把 core.hooksPath 指向 .githooks' : `设置 hooksPath 失败：${r.stderr}`;
    } else {
      hookMsg = '目标不是 git 仓库，跳过 hooksPath 设置（git init 后重跑本脚本即可）';
    }
  }

  console.log(`[init-project] 目标：${target}`);
  if (args.dry) console.log('[init-project] DRY-RUN，未写盘\n');
  if (created.length) console.log(`  新建 ${created.length} 个：\n${created.map((f) => `    + ${f}`).join('\n')}`);
  if (overwritten.length) console.log(`  覆盖 ${overwritten.length} 个：\n${overwritten.map((f) => `    ~ ${f}`).join('\n')}`);
  if (skipped.length) console.log(`  跳过 ${skipped.length} 个已存在（用 --force 覆盖）：\n${skipped.map((f) => `    = ${f}`).join('\n')}`);
  if (hookMsg) console.log(`  ${hookMsg}`);

  console.log('\n下一步：');
  console.log('  1) 编辑 AGENTS.md 的「项目事实」与「验收门」，填成真实命令');
  console.log('  2) node scripts/check-guards.mjs --selftest    # 骨架自证');
  console.log('  3) node scripts/check-all.mjs                  # 全量门禁，末尾应有 EXIT=0');
  console.log('  4) cp ship.json.example ship.json 并改成真实地址（上线核验用）');
  console.log('  5) 提交一次，确认 pre-commit / pre-push 真的拦得住（故意写一条不合格的提交信息试试）');
}

main();
