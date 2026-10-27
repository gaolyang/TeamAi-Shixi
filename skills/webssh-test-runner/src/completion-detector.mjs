// Completion detector: builds a unique-marker wrapper around a raw command
// and detects the unique end marker carrying the real exit code.
// Commands are carried base64-encoded so arbitrary quotes/pipes/newlines never
// break the wrapper. Rejects interactive commands rather than hanging forever.

import { randomBytes } from 'node:crypto';

let counter = 0;

export function newToken() {
  counter += 1;
  return `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}-${counter}`;
}

// Commands that request interactive input are not auto-supported; refuse loudly.
const INTERACTIVE_PATTERNS = [
  /\bsudo\s+(-S\b)?/i,
  /\bpasswd\b/,
  /\bsu\s+/,
  /\bssh\s+/,
  /\bscp\s+/,
  /\bexpect\s+/,
  /\bread\s+-/,
];

export function isInteractive(command) {
  return INTERACTIVE_PATTERNS.some((re) => re.test(command));
}

// Build a wrapper script (POSIX sh compatible) that:
//   1. prints a unique BEGIN marker
//   2. runs the command, capturing combined stdout/stderr
//   3. prints the real exit code in a unique END marker
// The whole command is base64-encoded and piped to `sh`, so quoting is never an issue.
export function buildWrapper(command, token) {
  if (!command || typeof command !== 'string' || !command.trim()) {
    const err = new Error('empty command');
    err.code = 'EMPTY_COMMAND';
    throw err;
  }
  if (isInteractive(command)) {
    const err = new Error(
      `command appears to require interactive input and is not auto-supported: "${command}"`
    );
    err.code = 'INTERACTIVE_COMMAND';
    throw err;
  }

  const begin = `__WST_RUN_${token}__`;
  const end = `__WST_END_${token}__`;
  const b64 = Buffer.from(command, 'utf8').toString('base64');

  // Run `sh -c` explicitly so exit code is that of the command itself.
  const script = `printf '\\n${begin}\\n'; printf '%s' '${b64}' | base64 -d | sh; __wst_rc=$?; printf '\\n${end}:%s\\n' "$__wst_rc"`;
  return { text: script, begin, end, token };
}

export function buildEndRegex(end) {
  return new RegExp(`(?:\\r?\\n|^)${escapeRegExp(end)}:(-?\\d+)(?:\\r?\\n|$)`, 'm');
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Given accumulated terminal text, return completed result or null if not done.
export function extractCompletion(accumulated, begin, endRegex) {
  const beginIdx = accumulated.indexOf(begin);
  if (beginIdx < 0) return null;
  const afterBegin = accumulated.slice(beginIdx + begin.length);
  const m = endRegex.exec(afterBegin);
  if (!m) return null;
  return {
    exitCode: Number(m[1]),
    output: afterBegin.slice(0, m.index),
  };
}
