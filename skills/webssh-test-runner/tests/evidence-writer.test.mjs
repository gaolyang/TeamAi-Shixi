import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { EvidenceWriter, newRunId } from '../src/evidence-writer.mjs';
import { redact, collectSecrets } from '../src/safe-text.mjs';
import { evaluateAssertion } from '../src/result-parser.mjs';

test('evidence step writes structured JSON with no secrets', async () => {
  process.env.TEST_TARGET_PASSWORD = 'super-secret-pw';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wst-ev-'));
  const w = new EvidenceWriter({ root: dir, runId: newRunId() });
  const file = await w.writeStep(
    { testcaseId: 'TC_X', stepId: 'STEP_1' },
    { host: '10.0.0.1', port: 22, username: 'root', os: 'Linux' },
    { command: 'echo hi', startTime: 't0', endTime: 't1', durationMs: 5, exitCode: 0, status: 'COMPLETED', output: 'super-secret-pw leaked' },
    { expected: 'x', actual: 'y', passed: true, rule: 'contains' },
    ['01.png'],
    []
  );
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(data.testcase_id, 'TC_X');
  assert.ok(!data.execution.output.includes('super-secret-pw'));
  assert.ok(data.execution.output.includes('[REDACTED]'));
  assert.equal(data.execution.exit_code, 0);
  delete process.env.TEST_TARGET_PASSWORD;
});

test('redact masks secrets', () => {
  const secrets = ['abc123'];
  assert.equal(redact('token abc123 here', secrets), 'token [REDACTED] here');
});

test('assertion requires output match, not just exit 0', () => {
  const a = evaluateAssertion({ contains: 'permitrootlogin no' }, { output: 'permitrootlogin yes', exitCode: 0 });
  assert.equal(a.passed, false);
});

test('no assertion -> status only, passes (no fabricated conclusion)', () => {
  const a = evaluateAssertion(null, { output: 'x', exitCode: 0 });
  assert.equal(a.passed, true);
});
