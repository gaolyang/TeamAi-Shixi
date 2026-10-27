import { test } from 'node:test';
import assert from 'node:assert';

import { buildWrapper, buildEndRegex, extractCompletion, newToken, isInteractive } from '../src/completion-detector.mjs';
import { decodeFrame } from '../src/command-executor.mjs';

test('wrapper includes unique begin/end markers', () => {
  const token = newToken();
  const w = buildWrapper('uname -a', token);
  assert.ok(w.begin.includes(token));
  assert.ok(w.end.includes(token));
  assert.ok(w.text.includes('base64 -d'));
  // the command is carried base64-encoded
  assert.ok(w.text.includes(Buffer.from('uname -a').toString('base64')));
});

test('wrapper survives quotes and pipes', () => {
  const w = buildWrapper("sshd -T | grep 'permitrootlogin'", newToken());
  assert.ok(w.text.includes('base64'));
});

test('extractCompletion parses exit code from accumulated text', () => {
  const token = 'abc';
  const w = buildWrapper('true', token);
  const re = buildEndRegex(w.end);
  const acc = `X\n${w.begin}\noutput-line\n${w.end}:0\n`;
  const r = extractCompletion(acc, w.begin, re);
  assert.ok(r);
  assert.equal(r.exitCode, 0);
  assert.match(r.output, /output-line/);
});

test('extractCompletion returns null before marker appears', () => {
  const token = 'abc';
  const w = buildWrapper('true', token);
  const re = buildEndRegex(w.end);
  assert.equal(extractCompletion(`\n${w.begin}\nstill-running\n`, w.begin, re), null);
});

test('interactive commands are flagged', () => {
  assert.equal(isInteractive('su - root'), true);
  assert.equal(isInteractive('systemctl status sshd'), false);
});

test('decodeFrame extracts string socket data', () => {
  const frame = `4["data","hello world"]`;
  assert.ok(decodeFrame(frame).includes('hello world'));
});

test('decodeFrame handles real Socket.IO v4 message prefix 42["data",...]', () => {
  // This is the exact frame shape observed live on WebSSH2 v5.4.2.
  const frame = `42["data","echo HELLO_AUTOTEST"]`;
  assert.ok(decodeFrame(frame).includes('echo HELLO_AUTOTEST'));
  // Multi-line terminal output also arrives in these string frames.
  const frame2 = `42["data","\\r\\nroot@kali:~# "]`;
  assert.ok(decodeFrame(frame2).includes('root@kali'));
});

test('decodeFrame detects connection-error events via parseEvent', async () => {
  const f = '42["connection-error",{"errorType":"auth","message":"Authentication Failed","host":"192.168.63.132","port":22}]';
  const { decodeFrame } = await import('../src/command-executor.mjs');
  // decodeFrame returns '' for non-data events (no terminal text)
  assert.equal(decodeFrame(f), '');
});

test('decodeFrame extracts binary buffer data', () => {
  const buf = Buffer.concat([Buffer.from([0x04]), Buffer.from('uname output')]);
  assert.equal(decodeFrame(buf), 'uname output');
});
