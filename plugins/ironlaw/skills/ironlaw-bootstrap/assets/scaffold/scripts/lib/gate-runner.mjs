/**
 * 门禁运行时共享件（项目无关模板）
 *
 * 单一真源（铁律三）：全量入口与本地调试副本都从这里 import，
 * 禁止各自再写一份失败行正则 —— 两份迟早错位，而错位方向通常是「互相掩护」。
 */

/** 退出码字典（四态）：0 通过 / 1 判据红（产品或规范）/ 2 设施或配置错误（需归因）/ 3 SUSPECT：全量红但单跑绿 */
export const EXIT = { PASS: 0, PRODUCT: 1, STOP: 2, SUSPECT: 3 };

/**
 * 失败行抽取：必须同时覆盖「红项」与「红项的原因行」。
 * 漏掉 `↳ 原因` / `! S15` / `⚠ 跳过` 的后果：知道红了，但不知道为什么。
 */
export function failureLines(out) {
  const RE = /(❌|✗|FAIL|失败|Error:|error TS|AssertionError|^\s*↳|!\s*S\d+\s|⚠.*跳过)/;
  return [...new Set(
    String(out || '').trim().split(/\r?\n/)
      .filter((l) => RE.test(l))
      .map((l) => l.trim()),
  )];
}

/** 步骤命令还原成可交给任意 shell 的字符串。 */
export function stepCommand(step) {
  if (Array.isArray(step.args) && step.args.length) {
    return [step.cmd, ...step.args]
      .map((s) => (/\s/.test(s) ? JSON.stringify(s) : s)).join(' ');
  }
  return String(step.cmd || '');
}

/** 平台 shell 矩阵：证明同一个门禁在不同 shell 下结论一致。 */
export function matrixShells() {
  if (process.platform !== 'win32') {
    return [{ name: 'sh', build: (c) => ({ cmd: 'sh', args: ['-c', c] }) }];
  }
  return [
    { name: 'PowerShell', build: (c) => ({ cmd: 'powershell.exe', args: ['-NoProfile', '-NonInteractive', '-Command', `$ErrorActionPreference='Continue'; ${c}`] }) },
    { name: 'Git Bash', build: (c) => ({ cmd: 'bash', args: ['-c', c] }) },
    { name: 'CMD', build: (c) => ({ cmd: 'cmd.exe', args: ['/d', '/c', c] }) },
  ];
}

/**
 * 长任务日志哨兵：没有独立一行的 EXIT= 就说明进程中途被杀，
 * 结论作废。所有长任务都应落这样一行。
 */
export function sentinelLine(code) {
  return `EXIT=${code}`;
}
