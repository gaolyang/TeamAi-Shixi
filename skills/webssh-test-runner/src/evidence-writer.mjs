// Evidence writer: emits structured evidence.json + metadata per test run.
// Never writes passwords, private keys, or shell history into evidence.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { redact } from './safe-text.mjs';

export function newRunId() {
  const ts = new Date().toISOString().slice(0, 19).replace(/[-T:]/g, '');
  return `${ts}-${randomBytes(3).toString('hex')}`;
}

function stampTime(d = new Date()) {
  return d.toISOString();
}

export class EvidenceWriter {
  constructor({ root, runId }) {
    this.root = root;      // e.g. <evidenceDir>/TC_SSH_001/<runId>
    this.runId = runId || newRunId();
  }

  // Create the per-run directory and return its path.
  async createDir({ testcaseId, stepId } = {}) {
    const base = this.root;
    fs.mkdirSync(base, { recursive: true });
    const placeholders = {
      testcase: testcaseId || 'UNKNOWN',
      step: stepId || '',
    };
    let pathStr = base;
    return { dir: base, pathStr };
  }

  // Write evidence.json for one executed step. `result` is redacted before
  // serialization so command output cannot accidentally leak secrets.
  async writeStep(step, target, execution, assertion, screenshots, errors, meta = {}) {
    const payload = {
      schema_version: '1.0',
      run_id: this.runId,
      testcase_id: step.testcaseId,
      step_id: step.stepId,
      target: {
        host: target.host,
        port: target.port,
        username: target.username,
        os: target.os || null,
      },
      execution: {
        backend: 'webssh2-playwright',
        command: redact(execution.command),
        start_time: execution.startTime || null,
        end_time: execution.endTime || null,
        duration_ms: execution.durationMs ?? null,
        exit_code: execution.exitCode ?? null,
        status: execution.status,
        output: redact(execution.output ?? ''),
      },
      assertion: {
        expected: assertion.expected ?? null,
        actual: assertion.actual ?? null,
        passed: assertion.passed ?? null,
        rule: assertion.rule ?? null,
      },
      screenshots: screenshots || [],
      errors: errors || [],
      meta: meta || {},
    };
    await this.ensureDir();
    const file = path.join(this.root, 'evidence.json');
    fs.writeFileSync(file, JSON.stringify(payload, null, 2), 'utf8');
    return file;
  }

  async ensureDir() {
    fs.mkdirSync(this.root, { recursive: true });
  }
}
