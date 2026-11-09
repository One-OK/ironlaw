#!/usr/bin/env node
/**
 * IronLaw 发行包冒烟测试（零依赖，端到端）
 *
 * 让 CHANGELOG「已验证」一节的声明在**任何机器上可复现**——声明若无机器可查，
 * 按 IronLaw 自己的标准就等于没声明。
 *
 * 验证七组声明：
 *   A. 脚手架：空仓库 → 安装 → scaffold 内每个文件都落位 → selftest 全过
 *      → check-all EXIT=0 → 不合格提交信息被 pre-push 拦（exit 1）→ 合格信息放行（exit 0）
 *   B. verify-record（脚手架内副本）：空模板判红 / 合成合格档案通过 /
 *      「范围不存在」的 =0 断言判红（最隐蔽的假绿被抓住）
 *   C. reverse-probe：转红路径 exit 0 / 假守护路径 exit 1 / 文件逐字节复原
 *   D. ship-truth：配置了但磁盘缺失的版本文件 → UNKNOWN（exit 2），不冒充通过
 *   E. impact-scope：diff → 范围键；未覆盖键点名判红；补上断言后转绿
 *   F. bump-version：多包同 bump；文件缺 "version" 键 → fail-closed（exit 2）
 *   G. safe-push：--dry-run 不写远端；真推 → 三判据一致；远端分叉 → 拒绝（exit 2）
 *
 * 用法：
 *   node scripts/smoke.mjs           # 全部通过退出 0，任一失败退出 1
 *   node scripts/smoke.mjs --keep    # 保留临时目录便于排查（结尾打印路径）
 *
 * 依赖：node ≥ 18、git、bash（Windows 下为 Git Bash，钩子用 bash 跑）。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(REPO, 'plugins', 'ironlaw', 'skills');
const SCAFFOLD = path.join(SKILLS, 'ironlaw-bootstrap', 'assets', 'scaffold');
const EXIT = { OK: 0, FAIL: 1 };

const results = [];
let failed = 0;

function step(name, fn) {
  try {
    const detail = fn();
    results.push({ name, ok: true, detail: detail || '' });
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  } catch (e) {
    failed++;
    results.push({ name, ok: false, detail: e.message });
    console.log(`  ✗ ${name}\n      ${String(e.message).split('\n').join('\n      ')}`);
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: 'utf8',
    cwd: opts.cwd || REPO,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: opts.timeoutMs || 180_000,
    maxBuffer: 64 * 1024 * 1024,
    shell: !!opts.shell,
  });
  return {
    status: r.status,
    out: `${r.stdout || ''}${r.stderr || ''}`,
    error: r.error ? String(r.error.message) : '',
  };
}

function git(args, cwd) {
  const r = run('git', args, { cwd });
  assert(r.status === 0, `git ${args.join(' ')} 失败：${r.out.slice(-300)}`);
  return r.out.trim();
}

/** scaffold 内全部文件（相对路径），用于「装完必须一个不少」的点名校验。 */
function walkScaffold(dir, base = dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walkScaffold(p, base, acc);
    else acc.push(path.relative(base, p).replace(/\\/g, '/'));
  }
  return acc.sort();
}

const GOOD_MSG = [
  'fix(smoke): 冒烟测试合格提交样本',
  '',
  '根因: 冒烟测试需要一个三段齐全的提交信息作为合格对照样本。',
  '',
  '影响链: ① 仅本提交本身；② 无产品代码变更；③ 不需要回滚方案。',
  '',
  '验证: scripts/smoke.mjs A 组钩子验收；check-all 全量门禁 EXIT=0。',
].join('\n');

function main() {
  const keep = process.argv.includes('--keep');
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'ironlaw-smoke-'));
  console.log(`[smoke] 临时仓库：${tmp}${keep ? '（--keep，结束后保留）' : ''}\n`);

  try {
    // ── 准备：空 git 仓库 ──
    git(['init', '-q'], tmp);
    git(['config', 'user.email', 'smoke@ironlaw.local'], tmp);
    git(['config', 'user.name', 'ironlaw-smoke'], tmp);

    // ── A. 脚手架 ──
    console.log('[A] 脚手架安装与钩子验收');
    step('A1 安装器零退出', () => {
      const r = run('node', [path.join(SKILLS, 'ironlaw-bootstrap', 'scripts', 'init-project.mjs'), tmp]);
      assert(r.status === 0, `init-project 退出 ${r.status}：${r.out.slice(-400)}`);
      return r.out.includes('core.hooksPath') ? 'hooksPath 已指向 .githooks' : '';
    });
    step('A2 scaffold 文件逐个落位（一个不少）', () => {
      const expected = walkScaffold(SCAFFOLD);
      const missing = expected.filter((rel) => !existsSync(path.join(tmp, rel)));
      assert(!missing.length, `缺少 ${missing.length} 个：${missing.join(', ')}`);
      return `${expected.length} 个文件全部落位`;
    });
    step('A3 check-guards --selftest 全过', () => {
      const r = run('node', ['scripts/check-guards.mjs', '--selftest'], { cwd: tmp });
      assert(r.status === 0, `退出 ${r.status}：${r.out.slice(-400)}`);
      const m = r.out.match(/\[selftest\] (\d+)\/(\d+)/);
      return m ? `${m[1]}/${m[2]}` : '';
    });
    step('A4 check-all 全绿且末尾哨兵 EXIT=0', () => {
      const r = run('node', ['scripts/check-all.mjs'], { cwd: tmp });
      assert(r.status === 0, `退出 ${r.status}：${r.out.slice(-500)}`);
      const log = readFileSync(path.join(tmp, '.workbuddy', 'artifacts', 'gate-run.log'), 'utf8');
      const last = log.trim().split('\n').pop();
      assert(last === 'EXIT=0', `日志末行是「${last}」，不是独立哨兵`);
      return '哨兵独立成行';
    });
    step('A5 不合格提交信息被 pre-push 拦（exit 1）', () => {
      git(['commit', '--allow-empty', '-q', '-m', 'update stuff'], tmp);
      const r = run('bash', ['.githooks/pre-push'], { cwd: tmp });
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}：${r.out.slice(-300)}`);
      assert(r.out.includes('根因'), '拦截输出应说明缺哪段（可归因）');
    });
    step('A6 合格提交信息放行（exit 0）', () => {
      const msgFile = path.join(tmp, '.smoke-msg.txt');
      writeFileSync(msgFile, GOOD_MSG, 'utf8');
      git(['add', '-A'], tmp);
      git(['commit', '-q', '-F', msgFile], tmp);
      const r = run('bash', ['.githooks/pre-push'], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-400)}`);
    });

    // ── B. verify-record（脚手架内副本） ──
    console.log('\n[B] verify-record fail-closed 与断言执行');
    const RECORD_OK = [
      '# 变更档案 · smoke · 冒烟样本',
      '',
      '- tip: 0000000000000000000000000000000000000000',
      '- 范围: HEAD',
      '- 作者: smoke@ironlaw.local',
      '- 生成时间: 2026-01-01T00:00:00Z',
      '',
      '## 0 改动范围（机器生成）',
      '',
      '- scripts/lib/gate-runner.mjs',
      '',
      '## 1 根因',
      '',
      '根因是冒烟测试需要一个合格档案样本，不是演示文档。',
      '',
      '## 2 影响链（六类）',
      '',
      '### 2.5 影响链断言（机器可执行）',
      '',
      '| # | 断言 | 检索式（JS 正则） | 范围 | 期望 |',
      '|---|------|------------------|------|------|',
      '| 1 | 失败行抽取单一真源存在 | `export function failureLines` | scripts | >=1 |',
      '| 2 | 冒烟专用词零残留 | `SMOKE_NEVER_MATCHES_ZZZ` | scripts | =0 |',
      '{{EXTRA_ROW}}',
      '### 2.6 未被断言覆盖的范围键与理由',
      '',
      '无，全部范围键已由 §2.5 覆盖。',
      '',
      '## 3 未修点与理由',
      '',
      '| 未修点 | 为什么不修 | 何时处理 |',
      '|---|---|---|',
      '| 无 | 样本档案无未修项 | 不适用 |',
      '',
      '## 4 用户可见影响与恢复路径',
      '',
      '- 无用户可见变化，这是冒烟测试的合成档案。',
      '',
      '## 5 回滚方案',
      '',
      '```bash',
      'git revert HEAD',
      '```',
      '',
      '## 6 验证证据',
      '',
      '| 项 | 命令 | 结果 |',
      '|---|---|---|',
      '| 门禁 | node scripts/check-all.mjs | EXIT=0 |',
      '',
      '## 7 完成判据',
      '',
      '| # | 修复项 | 全不全判据 | 验证证据 | 负控制（改坏什么→哪条红） |',
      '|---|---|---|---|---|',
      '| 1 | 冒烟样本 | 两条断言成立 | verify-record | 删除 failureLines 导出 → 断言 1 转红 |',
    ].join('\n');
    const recordsDir = path.join(tmp, 'docs', 'change-records');
    step('B1 空模板判红（fail-closed）', () => {
      mkdirSync(recordsDir, { recursive: true });
      const tpl = readFileSync(path.join(SKILLS, 'ironlaw-record', 'assets', 'change-record-template.md'), 'utf8');
      writeFileSync(path.join(recordsDir, '0000-template.md'), tpl, 'utf8');
      const r = run('node', ['scripts/verify-record.mjs', 'docs/change-records/0000-template.md'], { cwd: tmp });
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}`);
      return '占位表格骗不过校验器';
    });
    step('B2 合成合格档案通过（exit 0）', () => {
      writeFileSync(path.join(recordsDir, '2026-01-01-ok.md'), RECORD_OK.replace('{{EXTRA_ROW}}\n', ''), 'utf8');
      const r = run('node', ['scripts/verify-record.mjs', 'docs/change-records/2026-01-01-ok.md'], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-500)}`);
      const m = r.out.match(/(\d+) 条断言全部成立/);
      return m ? `${m[1]} 条断言执行通过` : '';
    });
    step('B3 「范围不存在」的 =0 断言判红（最隐蔽假绿被抓住）', () => {
      const bad = RECORD_OK.replace('{{EXTRA_ROW}}\n', '')
        .replace('### 2.6', '| 3 | 范围写错的断言不得永真 | `whatever` | docs/no-such-dir | =0 |\n\n### 2.6');
      writeFileSync(path.join(recordsDir, '2026-01-02-bad-scope.md'), bad, 'utf8');
      const r = run('node', ['scripts/verify-record.mjs', 'docs/change-records/2026-01-02-bad-scope.md'], { cwd: tmp });
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('范围全部不存在'), '应点名「范围全部不存在」');
      return '写错路径的 =0 断言没有变成永真式';
    });
    step('B4 --latest 取最新档案（跳过模板）', () => {
      const r = run('node', ['scripts/verify-record.mjs', '--latest', 'docs/change-records'], { cwd: tmp });
      // 最新一份是 2026-01-02-bad-scope（范围错误）→ 应 exit 1 且点的是那份
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}`);
      assert(r.out.includes('bad-scope'), `应选中 2026-01-02-bad-scope，实际：${r.out.slice(0, 200)}`);
      return '按文件名取到最新一份';
    });
    step('B5 清理 B 组夹具档案（后续组只留合格档案）', () => {
      for (const f of ['0000-template.md', '2026-01-02-bad-scope.md']) {
        rmSync(path.join(recordsDir, f), { force: true });
      }
      assert(existsSync(path.join(recordsDir, '2026-01-01-ok.md')), '合格档案应保留');
      return 'G 组的档案闸只会看到合格档案';
    });

    // ── C. reverse-probe ──
    console.log('\n[C] reverse-probe 转红与假守护识别');
    const guardPath = path.join(tmp, 'scripts', 'check-smoke-demo.mjs');
    const targetPath = path.join(tmp, 'target.txt');
    writeFileSync(targetPath, 'hello world\n', 'utf8');
    writeFileSync(guardPath, [
      "import { readFileSync } from 'node:fs';",
      "const text = readFileSync('target.txt', 'utf8');",
      "const has = text.includes('BAD_PATTERN');",
      "console.log(has ? '❌ smoke guard: BAD_PATTERN found' : '[OK] smoke guard clean');",
      'process.exit(has ? 1 : 0);',
    ].join('\n'), 'utf8');
    const probeBase = {
      file: 'target.txt',
      cmd: 'node scripts/check-smoke-demo.mjs',
    };
    step('C1 转红路径（exit 0）', () => {
      const cfg = path.join(tmp, 'probe-good.json');
      writeFileSync(cfg, JSON.stringify({
        ...probeBase,
        cases: [{ label: '目标文件注入违规', find: 'hello', replace: 'hello BAD_PATTERN' }],
      }), 'utf8');
      const r = run('node', [path.join(SKILLS, 'ironlaw-gate', 'scripts', 'reverse-probe.mjs'), '--config', cfg], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('逐字节复原'), '输出应确认逐字节复原');
    });
    step('C2 假守护被识破（exit 1）', () => {
      const cfg = path.join(tmp, 'probe-fake.json');
      writeFileSync(cfg, JSON.stringify({
        ...probeBase,
        cases: [
          { label: '目标文件注入违规', find: 'hello', replace: 'hello BAD_PATTERN' },
          { label: '守卫判据被改成永远通过', file: 'scripts/check-smoke-demo.mjs', find: 'process.exit(has ? 1 : 0)', replace: 'process.exit(0)' },
        ],
      }), 'utf8');
      const r = run('node', [path.join(SKILLS, 'ironlaw-gate', 'scripts', 'reverse-probe.mjs'), '--config', cfg], { cwd: tmp });
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('假守护'), '应点名「假守护」');
    });
    step('C3 变异目标逐字节复原', () => {
      assert(readFileSync(targetPath, 'utf8') === 'hello world\n', 'target.txt 被污染');
      assert(readFileSync(guardPath, 'utf8').includes('process.exit(has ? 1 : 0)'), '守卫源码被污染');
    });

    // ── D. ship-truth ──
    console.log('\n[D] ship-truth fail-closed 与退出码语义');
    step('D1 配置了但缺失的版本文件 → UNKNOWN（exit 2），不冒充通过', () => {
      writeFileSync(path.join(tmp, 'package.json'), '{\n  "version": "0.0.1"\n}\n', 'utf8');
      const cfg = path.join(tmp, 'ship-smoke.json');
      writeFileSync(cfg, JSON.stringify({
        versionFiles: ['package.json', 'apps/web/package.json'],
        branch: 'main',
        requireClean: false,
      }), 'utf8');
      const r = run('node', [path.join(SKILLS, 'ironlaw-ship', 'scripts', 'ship-truth.mjs'), '--config', cfg], { cwd: tmp });
      assert(r.status === 2, `期望 exit 2（UNKNOWN），实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('配置了但磁盘上不存在'), '应点名缺失的配置文件，而不是静默丢弃');
      assert(r.out.includes('1 处'), '版本一致性仍按存在的 1 处报告');
    });

    // ── E. impact-scope ──
    console.log('\n[E] impact-scope 范围键与覆盖闭环');
    step('E1 未覆盖键点名判红（exit 1）', () => {
      // 追加 docs 改动 + 新 scripts 文件，形成两个范围键。
      // 只 add 这两个路径：测试夹具（probe/target/package.json 等）不许混进提交，
      // 否则它们会成为额外的根级范围键，覆盖矩阵就不再反映被测场景。
      writeFileSync(path.join(tmp, 'scripts', 'zz-smoke-marker.mjs'), '// smoke marker\n', 'utf8');
      const disc = path.join(tmp, 'docs', 'CHANGE-DISCIPLINE.md');
      writeFileSync(disc, `${readFileSync(disc, 'utf8')}\nsmoke: 第二次提交追加行\n`, 'utf8');
      git(['add', 'scripts/zz-smoke-marker.mjs', 'docs/CHANGE-DISCIPLINE.md'], tmp);
      git(['commit', '-q', '-m', 'chore(smoke): 影响链冒烟的第二个提交', '-m', '根因: E 组需要一个基线之后的真实 diff 区间来产生多个范围键。', '-m', '影响链: ① scripts/zz-smoke-marker.mjs 新增；② docs/CHANGE-DISCIPLINE.md 追加一行；③ 其余夹具文件不进提交。', '-m', '验证: impact-scope --base HEAD~1 应输出 docs 与 scripts 两个范围键。'], tmp);
      const cfg = path.join(tmp, 'record-scope-ok.md');
      writeFileSync(cfg, RECORD_OK.replace('{{EXTRA_ROW}}\n', ''), 'utf8');
      const r = run('node', [path.join(SKILLS, 'ironlaw-record', 'scripts', 'impact-scope.mjs'), '--base', 'HEAD~1', '--record', cfg], { cwd: tmp });
      assert(r.status === 1, `期望 exit 1，实际 ${r.status}：${r.out.slice(-500)}`);
      assert(r.out.includes('docs'), '应点名未覆盖键 docs');
    });
    step('E2 补上覆盖后转绿（exit 0）', () => {
      const cfg = path.join(tmp, 'record-scope-full.md');
      writeFileSync(cfg, RECORD_OK.replace('{{EXTRA_ROW}}', '| 3 | 文档同步追加 | `smoke: 第二次提交` | docs | >=1 |'), 'utf8');
      const r = run('node', [path.join(SKILLS, 'ironlaw-record', 'scripts', 'impact-scope.mjs'), '--base', 'HEAD~1', '--record', cfg], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-500)}`);
      return '逐键闭环达成';
    });

    // ── F. bump-version ──
    console.log('\n[F] bump-version 多包同步与 fail-closed');
    step('F1 三包同 bump（patch）', () => {
      mkdirSync(path.join(tmp, 'apps', 'web'), { recursive: true });
      mkdirSync(path.join(tmp, 'apps', 'api'), { recursive: true });
      writeFileSync(path.join(tmp, 'apps', 'web', 'package.json'), '{\n  "name": "web",\n  "version": "0.0.1"\n}\n', 'utf8');
      writeFileSync(path.join(tmp, 'apps', 'api', 'package.json'), '{\n  "name": "api",\n  "version": "0.0.1"\n}\n', 'utf8');
      const r = run('node', ['scripts/bump-version.mjs', 'minor'], { cwd: tmp });
      assert(r.status === 0, `退出 ${r.status}：${r.out.slice(-400)}`);
      for (const f of ['package.json', 'apps/web/package.json', 'apps/api/package.json']) {
        const v = JSON.parse(readFileSync(path.join(tmp, f), 'utf8')).version;
        assert(v === '0.1.0', `${f} 版本是 ${v}，期望 0.1.0`);
      }
      return '0.0.1 → 0.1.0，三处一致';
    });
    step('F2 文件缺 version 键 → fail-closed（exit 2），测后恢复现场', () => {
      writeFileSync(path.join(tmp, 'apps', 'api', 'package.json'), '{\n  "name": "api"\n}\n', 'utf8');
      const r = run('node', ['scripts/bump-version.mjs', 'patch'], { cwd: tmp });
      assert(r.status === 2, `期望 exit 2，实际 ${r.status}：${r.out.slice(-300)}`);
      assert(r.out.includes('拒绝只 bump 一半'), '应明确拒绝只 bump 一半');
      // 夹具污染会连坐后面的组（G2 的版本一致性检查），测完恢复
      writeFileSync(path.join(tmp, 'apps', 'api', 'package.json'), '{\n  "name": "api",\n  "version": "0.1.0"\n}\n', 'utf8');
      return '恢复后三包回到 0.1.0';
    });

    // ── G. safe-push ──
    console.log('\n[G] safe-push 三判据与分叉拒绝');
    step('G1 --dry-run 打印计划且不写远端', () => {
      const r = run('bash', ['scripts/safe-push.sh', '--dry-run', '--branch', 'master'], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('DRY'), '应打印 DRY 计划');
      assert(!r.out.includes('PUSH_RC'), 'dry-run 不得真的推送');
      return '未写远端';
    });
    step('G2 真推送三判据一致（exit 0）', () => {
      // 本地 bare 远端 + 首次推送（远端还没有分支 → safe-push 应允许并成功）
      const remotePath = path.join(tmp, 'smoke-remote.git');
      run('git', ['init', '-q', '--bare', remotePath], { cwd: tmp });
      git(['remote', 'add', 'origin', remotePath], tmp);
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], tmp);
      const r = run('bash', ['scripts/safe-push.sh', '--branch', branch], { cwd: tmp });
      assert(r.status === 0, `期望 exit 0，实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('PUSH_RC=0'), '应单独捕获推送退出码');
      assert(r.out.includes('三判据一致'), '应确认三判据一致');
      const remoteTip = run('git', ['ls-remote', remotePath, `refs/heads/${branch}`], { cwd: tmp }).out.split(/\s+/)[0];
      assert(remoteTip === git(['rev-parse', 'HEAD'], tmp), '远端指针应等于本地 HEAD');
      return `首推成功，远端 tip=${remoteTip.slice(0, 9)}`;
    });
    step('G3 远端分叉拒绝合并（exit 2）', () => {
      // 另一条线在远端前进 → 本地再提交 → safe-push 必须拒绝（不能快进）
      const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], tmp);
      const remotePath = git(['remote', 'get-url', 'origin'], tmp);
      const other = path.join(tmp, 'other-line');
      run('git', ['clone', '-q', remotePath, other], { cwd: tmp });
      run('git', ['config', 'user.email', 'other@line'], { cwd: other });
      run('git', ['config', 'user.name', 'other'], { cwd: other });
      writeFileSync(path.join(other, 'other-line.txt'), 'from the other line\n', 'utf8');
      git(['add', '-A'], other);
      git(['commit', '-q', '-m', 'feat(other): 并行线的提交'], other);
      git(['push', '-q', 'origin', `HEAD:${branch}`], other);
      // 本地也前进
      writeFileSync(path.join(tmp, 'local-line.txt'), 'from local line\n', 'utf8');
      git(['add', '-A'], tmp);
      git(['commit', '-q', '-m', 'feat(local): 本线的提交'], tmp);
      const r = run('bash', ['scripts/safe-push.sh', '--branch', branch], { cwd: tmp });
      assert(r.status === 2, `期望 exit 2（不可快进），实际 ${r.status}：${r.out.slice(-400)}`);
      assert(r.out.includes('不能快进'), '应说明不能快进并指向 multi-writer 协议');
      return '分叉被拒，没有覆盖对方';
    });

    // ── 汇总 ──
    const total = results.length;
    const bad = results.filter((r) => !r.ok);
    console.log(`\n[smoke] ${total - bad.length}/${total} 通过${bad.length ? `，${bad.length} 项失败` : ''}`);
    if (bad.length) {
      console.log('[smoke] 失败项：');
      for (const b of bad) console.log(`  - ${b.name}：${b.detail}`);
    }
    return { tmp, failed };
  } finally {
    if (!keep) rmSync(tmp, { recursive: true, force: true });
    else console.log(`[smoke] 已保留临时目录：${tmp}`);
  }
}

const exit = main();
process.exit(exit.failed ? EXIT.FAIL : EXIT.OK);
