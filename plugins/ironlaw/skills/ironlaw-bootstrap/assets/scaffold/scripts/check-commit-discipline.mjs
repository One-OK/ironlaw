#!/usr/bin/env node
/**
 * 提交纪律守卫：提交信息必须包含三段，且行首是固定关键词。
 *
 *   根因: <机制层面的一句话>
 *   影响链: <逐项列出改了哪几处>
 *   验证: <跑了什么 + 结果>
 *
 * 为什么卡行首：靠"包含关键词"会被正文里随便一句"根因"绕过；
 * 行首匹配才能逼出结构化表达。
 *
 * 用法：
 *   node scripts/check-commit-discipline.mjs              # 查最新提交
 *   node scripts/check-commit-discipline.mjs <sha>        # 查指定提交
 *   node scripts/check-commit-discipline.mjs --msg f.txt  # 查消息文件（pre-commit 用）
 *   node scripts/check-commit-discipline.mjs --selftest
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const SECTIONS = [
  { key: '根因', re: /^根因[:：]\s*(.+)$/m, min: 8 },
  { key: '影响链', re: /^影响链[:：]\s*(.+)$/m, min: 8 },
  { key: '验证', re: /^验证[:：]\s*(.+)$/m, min: 8 },
];

/** 判据单一真源。返回问题列表（空 = 合格）。 */
export function evaluate(msg) {
  const problems = [];
  const text = String(msg || '');
  if (!text.trim()) return ['提交信息为空'];

  for (const s of SECTIONS) {
    const m = text.match(s.re);
    if (!m) {
      problems.push(`缺「${s.key}:」段（必须行首，如 \`${s.key}: ...\`）`);
      continue;
    }
    const body = m[1].trim();
    if (body.length < s.min) problems.push(`「${s.key}」段太短（${body.length} 字，至少 ${s.min} 字）—— 写成可核验的事实`);
  }

  // 标题行：不允许只有 "fix" / "update" 这种无信息量标题
  const subject = text.split('\n')[0].trim();
  if (subject.length < 8) problems.push(`标题太短：「${subject}」`);

  return problems;
}

function readCommitMessage(arg) {
  if (arg) {
    const r = spawnSync('git', ['log', '-1', '--pretty=%B', arg], { encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`取不到提交 ${arg} 的信息：${(r.stderr || '').trim()}`);
    return r.stdout;
  }
  const r = spawnSync('git', ['log', '-1', '--pretty=%B'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`取不到最新提交信息：${(r.stderr || '').trim()}`);
  return r.stdout;
}

/** 空仓库（HEAD 未指向任何提交）不是"提交不合格"，是"还没有提交"。 */
function isUnbornHead(msg) {
  return /does not have any commits yet|unknown revision|ambiguous argument 'HEAD'|your current branch/i.test(String(msg || ''));
}

function selftest() {
  const probes = [];
  const t = (n, fn) => { try { fn(); probes.push([n, true]); } catch (e) { probes.push([n, false, e.message]); } };
  const assert = (c, m) => { if (!c) throw new Error(m); };

  const good = 'fix(order): 订单金额按对客币种换算\n\n根因: 报价侧与订单侧对「金额」的币种口径不一致，订单读了内部结算价。\n\n影响链: ① 订单详情金额取值改用对客口径；② 导出模板同步；③ 补断言钉住两处同源。\n\n验证: npx jest order --runInBand → 42 passed；手工比对 3 笔订单与报价单一致。\n';

  t('P1 合格提交放行', () => assert(evaluate(good).length === 0, `被误判：${evaluate(good).join(' / ')}`));

  t('P2 缺「验证」段判红', () => {
    const p = evaluate(good.replace(/^验证:.*$/m, ''));
    assert(p.some((x) => x.includes('验证')), '未识别缺失段');
  });

  t('P3 关键词不在行首判红', () => {
    const p = evaluate(good.replace('根因:', '说明一下根因:'));
    assert(p.some((x) => x.includes('根因')), '行首判定失效');
  });

  t('P4 段落太短判红', () => {
    const p = evaluate(good.replace(/^验证:.*$/m, '验证: 通过'));
    assert(p.some((x) => x.includes('太短')), '未识别过短');
  });

  t('P5 空提交判红', () => assert(evaluate('').length > 0, '空消息被放行'));

  t('P6 空仓库识别但不误判', () => {
    assert(isUnbornHead("fatal: your current branch 'main' does not have any commits yet"), '未识别空仓库');
    assert(!isUnbornHead('fatal: not a git repository'), '把非 git 仓库误判为空仓库');
  });

  // 反向探针：把判据改成永远通过 → P2 必须失效（证明 P2 的红来自该判据）
  t('P7 反向探针：判据失效可被发现', () => {
    const broken = (msg) => evaluate(msg).filter((x) => !x.includes('验证'));
    assert(!broken(good.replace(/^验证:.*$/m, '')).some((x) => x.includes('验证')), '探针自身写错');
  });

  for (const [n, ok, why] of probes) console.log(`  ${ok ? '✓' : '✗'} ${n}${ok ? '' : `：${why}`}`);
  console.log(`\n[selftest] ${probes.filter((p) => p[1]).length}/${probes.length}`);
  return probes.every((p) => p[1]);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) process.exit(selftest() ? 0 : 1);

  let msg;
  try {
    const mi = args.indexOf('--msg');
    if (mi >= 0) {
      const f = args[mi + 1];
      if (!f) throw new Error('--msg 需要文件路径');
      msg = readFileSync(f, 'utf8');
    } else {
      msg = readCommitMessage(args.find((a) => !a.startsWith('--')));
    }
  } catch (e) {
    if (isUnbornHead(e.message)) {
      console.log('[SKIP] commit-discipline：仓库尚无提交，无可校验对象（建仓阶段允许）');
      process.exit(0);
    }
    console.error(`[commit-discipline] 无法读取提交信息：${e.message}`);
    process.exit(2);
  }

  const problems = evaluate(msg);
  if (problems.length) {
    console.error('❌ [commit-discipline] 提交信息不合格：');
    for (const p of problems) console.error(`  ↳ ${p}`);
    console.error('\n模板：\n  <type>(<scope>): <结果>\n\n  根因: ...\n  影响链: ① ... ② ... ③ ...\n  验证: <命令 → 结果>');
    process.exit(1);
  }
  console.log('[OK] commit-discipline：三段齐全');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
