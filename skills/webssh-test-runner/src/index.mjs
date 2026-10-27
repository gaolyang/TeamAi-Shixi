// webssh-test-runner — CLI entry point. A single, stable entry for the agent
// to invoke. Runs env gate → host validation → WebSSH2 connect → execute steps
// → screenshots → evidence.json, then prints a stable JSON summary.

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config-loader.mjs';
import { checkEnvironment } from './environment-check.mjs';
import { validateTarget } from './host-validator.mjs';
import { websshStatus } from './webssh-controller.mjs';
import { PlaywrightRunner } from './playwright-runner.mjs';
import { CommandExecutor } from './command-executor.mjs';
import { ScreenshotManager } from './screenshot-manager.mjs';
import { EvidenceWriter, newRunId } from './evidence-writer.mjs';
import { evaluateAssertion } from './result-parser.mjs';
import { makeErrorOutcome } from './error-handler.mjs';
import { redact } from './safe-text.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function argsError(msg) {
  console.log(JSON.stringify({ ok: false, outcome: 'ERROR', error: msg }, null, 2));
  process.exit(2);
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[i + 1];
    const set = (k) => { opts[k] = next(); i += 1; };

    switch (a) {
      case '--testcase': set('testcase'); break;
      case '--id': set('id'); break;
      case '--command': set('command'); break;      // single-command mode
      case '--host': set('host'); break;
      case '--port': set('port'); break;
      case '--username': set('username'); break;
      case '--password': set('password'); break;     // discouraged; prefer env
      case '--key': set('keyPath'); break;
      case '--webssh-url': set('websshUrl'); break;
      case '--allow-change': opts.allowChange = true; break;
      case '--headful': opts.headless = false; break;
      case '--headless': opts.headless = true; break;
      case '--timeout': set('commandTimeoutMs'); break;
      case '--output': set('evidenceDir'); break;
      case '--allowed-hosts': set('allowedHosts'); break;
      case '--check-env': opts.checkEnv = true; break;
      case '--debug': opts.debug = true; break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (a.startsWith('-')) {
          // unknown flag: ignore (keeps agent calls lenient)
        }
    }
  }
  return opts;
}

function printHelp() {
  console.log(`webssh-test-runner v1.0.0

Usage:
  node src/index.mjs --check-env
  node src/index.mjs --testcase <path.json>
  node src/index.mjs --id TC_OS_001 --command "uname -a" --host H --username U

Options:
  --testcase <file>     JSON testcase (id, target, steps)
  --id, --command       single-command mode
  --host, --port, --username
  --allow-change        permit change/risk steps
  --headful             show the browser (debug)
  --timeout <ms>        per-command timeout
  --output <dir>        evidence root
  --allowed-hosts <csv> override allowed hosts
  --check-env           run environment gate and exit

Password: set TEST_TARGET_PASSWORD (or SSH_PASSWORD) env; never in args/JSON.
`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.help) { printHelp(); return; }

  // Resolve env file from project root if present.
  const rootEnv = path.join(ROOT, '.env');
  const cfg = loadConfig({
    envPath: fs.existsSync(rootEnv) ? rootEnv : null,
    cli: opts,
  });
  const log = (m) => { if (cfg.logLevel !== 'silent') console.log(`[webssh-test-runner] ${m}`); };

  // Passwords: from explicit args (deprecated) OR env. Never written to evidence.
  const password = opts.password || cfg.sshPassword;

  // ---- Mode: environment check only ------------------------------------
  if (opts.checkEnv) {
    const report = await checkEnvironment(cfg, {
      host: (opts.host || cfg.sshHost) || undefined,
      username: (opts.username || cfg.sshUser) || undefined,
    });
    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  }

  // ---- Resolve the test task -------------------------------------------
  let task = null;
  if (opts.testcase) {
    const p = path.resolve(opts.testcase);
    if (!fs.existsSync(p)) argsError(`testcase file not found: ${p}`);
    try {
      task = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) { argsError(`failed to parse testcase ${p}: ${e.message}`); }
  } else if (opts.command && (opts.host || cfg.sshHost)) {
    // Single-command mode: synthesize a one-step task.
    task = {
      testcase_id: opts.id || 'TC_SINGLE',
      title: 'single command',
      target: {
        host: opts.host || cfg.sshHost,
        port: Number(opts.port ?? cfg.sshPort),
        username: opts.username || cfg.sshUser,
      },
      steps: [{ step_id: 'STEP_001', action: 'execute_command', command: opts.command, timeout_ms: Number(opts.commandTimeoutMs || cfg.commandTimeoutMs), screenshot: true }],
    };
  }

  if (!task) argsError('no task: provide --testcase FILE or --id/--command/--host');

  const target = {
    host: task.target?.host || cfg.sshHost,
    port: Number(task.target?.port ?? cfg.sshPort),
    username: task.target?.username || cfg.sshUser,
    os: task.target?.os || null,
  };
  const allowed = cfg.allowedHosts;

  // ---- Hard environment gate -------------------------------------------
  const envReport = await checkEnvironment(cfg, { host: target.host, username: target.username });
  if (!envReport.ok) {
    console.log(JSON.stringify({ ok: false, outcome: 'BLOCKED', reason: 'environment gate failed', environment: envReport }, null, 2));
    process.exit(1);
  }

  // ---- Host whitelist gate (before connection) -------------------------
  const targetCheck = validateTarget({ ...target, allowedHosts: allowed });
  if (!targetCheck.ok) {
    console.log(JSON.stringify({ ok: false, outcome: 'BLOCKED', code: 'SSH_TARGET_INVALID', reason: targetCheck.reason, allowedHosts: allowed }, null, 2));
    process.exit(1);
  }

  // ---- WebSSH2 status (reuse, don't kill) ------------------------------
  const wss = await websshStatus(cfg.websshUrl);
  log(`WebSSH2: ${wss.status}`);
  if (!wss.up) {
    console.log(JSON.stringify({ ok: false, outcome: 'BLOCKED', reason: 'WebSSH2 service unavailable', webssh: wss }, null, 2));
    process.exit(1);
  }

  // ---- Execute ---------------------------------------------------------
  const runId = newRunId();
  const evidenceRoot = path.join(path.resolve(cfg.evidenceDir), task.testcase_id || 'UNKNOWN', runId);
  const shots = new ScreenshotManager({ dir: evidenceRoot });
  const writer = new EvidenceWriter({ root: evidenceRoot, runId });
  const runner = new PlaywrightRunner(cfg, { log });
  const summary = { testcase_id: task.testcase_id, run_id: runId, steps: [], errors: [] };
  let executor = null;

  try {
    try {
      await runner.launch();
      await runner.connect(target, password, opts.keyPath || cfg.privateKeyPath);
      log(`terminal mounted for ${target.username}@${target.host}:${target.port}; verifying live shell...`);
      executor = new CommandExecutor(runner.page, { timeoutMs: cfg.commandTimeoutMs, log });
      const live = await executor.probeConnected({ timeoutMs: 10000 });
      if (!live) {
        const detail = executor.connectionErrors[0]?.message || 'SSH session did not become interactive';
        const e = new Error(`SSH not connected: ${detail}`);
        e.code = 'SSH_AUTH_FAILED';
        throw e;
      }
      log(`live shell confirmed on ${target.username}@${target.host}:${target.port}`);
      const connectedShot = await shots.capturePage(runner.page, '01_connected.png');
    } catch (e) {
      // Connection failure: capture a diagnostic error screenshot + evidence
      // rather than exiting silently. Never fabricate a PASS.
      const outcome = makeErrorOutcome(e);
      const errShot = await shots.captureSafe(runner.page, 'error.png').catch(() => ({ ok: false }));
      const screens = errShot.ok ? ['error.png'] : [];
      const t0 = new Date();
      await writer.writeStep(
        { testcaseId: task.testcase_id, stepId: 'CONNECT' }, target,
        { command: null, startTime: t0.toISOString(), endTime: new Date().toISOString(), durationMs: 0, exitCode: null, status: outcome.outcome, output: '' },
        { expected: null, actual: null, passed: null, rule: null },
        screens,
        [{ code: e.code || outcome.outcome, message: e.message }],
        { phase: 'connect' }
      );
      console.log(JSON.stringify({ ok: false, outcome: outcome.outcome, phase: 'connect', error: e.message, evidence: path.join(evidenceRoot, 'evidence.json'), screenshots: screens }, null, 2));
      process.exit(outcome.outcome === 'BLOCKED' ? 1 : 1);
    }

    const executor2 = executor;
    let i = 0;
    for (const step of (task.steps || [])) {
      i += 1;
      const stepId = step.step_id || `STEP_${String(i).padStart(3, '0')}`;
      const startTime = new Date();
      const timeoutMs = Number(step.timeout_ms || cfg.commandTimeoutMs);
      const stepResult = { step_id: stepId, command: step.command, status: null, exit_code: null, screenshots: [], errors: [], assertion: null };

      try {
        const exec = await executor2.execute(step.command, { timeoutMs });
        const endTime = new Date();
        const assertion = evaluateAssertion(step.expected, { output: exec.output, exitCode: exec.exitCode });

        const shotName = `02_result.png`;
        const shot = await shots.captureSafe(runner.page, shotName);

        stepResult.exit_code = exec.exitCode;
        stepResult.output = exec.output;
        stepResult.duration_ms = exec.durationMs;
        stepResult.status = exec.status;
        stepResult.assertion = {
          passed: assertion.passed,
          expected: step.expected ?? null,
          actual: assertion.actual,
        };

        const fstatus = exec.status === 'TIMEOUT' ? 'TIMEOUT' : (assertion.passed ? 'PASS' : 'FAIL');
        stepResult.status = fstatus;
        if (shot.ok) stepResult.screenshots.push(shotName);

        await writer.writeStep(
          { testcaseId: task.testcase_id, stepId },
          target,
          {
            command: step.command, startTime: startTime.toISOString(), endTime: endTime.toISOString(),
            durationMs: exec.durationMs, exitCode: exec.exitCode, status: fstatus, output: exec.output,
          },
          { expected: step.expected ?? null, actual: assertion.actual, passed: assertion.passed, rule: 'contains' },
          stepResult.screenshots,
          stepResult.errors,
          { title: step.title || stepId, backend: 'webssh2-playwright' }
        );

        const shown = redact(`${exec.output || ''}`).slice(0, 2000);
        console.log(JSON.stringify({
          step_id: stepId, command: step.command, status: fstatus, exit_code: exec.exitCode,
          duration_ms: exec.durationMs, output_preview: shown, screenshots: stepResult.screenshots,
        }));
        stepResult._outcome = fstatus;
      } catch (e) {
        const outcome = makeErrorOutcome(e);
        const endTime = new Date();
        stepResult.status = outcome.outcome;
        stepResult.errors.push({ code: e.code || outcome.outcome, message: e.message });
        const errShot = await shots.captureSafe(runner.page, 'error.png');
        if (errShot.ok) stepResult.screenshots.push('error.png');
        await writer.writeStep(
          { testcaseId: task.testcase_id, stepId }, target,
          { command: step.command, startTime: startTime.toISOString(), endTime: endTime.toISOString(), durationMs: Date.now() - startTime.getTime(), exitCode: null, status: outcome.outcome, output: '' },
          { expected: step.expected ?? null, actual: null, passed: null, rule: null },
          stepResult.screenshots, stepResult.errors, {}
        );
        console.log(JSON.stringify({ step_id: stepId, command: step.command, status: outcome.outcome, error: e.message }));
        stepResult._outcome = outcome.outcome;
      }
      summary.steps.push(stepResult);
    }

    summary.evidence_dir = evidenceRoot;
    summary.evidence_file = path.join(evidenceRoot, 'evidence.json');
    summary.ok = summary.steps.every((s) => (s.status === 'PASS'));
    summary.outcome = summary.ok ? 'PASS' : summary.steps.some((s) => s.status === 'FAIL' || s.status === 'TIMEOUT' || s.status === 'ERROR') ? 'FAIL' : 'INCONCLUSIVE';

    console.log('\n===== SUMMARY =====');
    console.log(JSON.stringify({
      ok: summary.ok, outcome: summary.outcome, testcase_id: summary.testcase_id, run_id: summary.run_id,
      steps: summary.steps.map((s) => ({ step_id: s.step_id, status: s.status, exit_code: s.exit_code })),
      evidence: summary.evidence_file,
    }, null, 2));
  } finally {
    await runner.close().catch(() => {});
  }

  process.exit(0);
}

main().catch((e) => {
  console.log(JSON.stringify({ ok: false, outcome: 'ERROR', error: String(e?.message || e) }, null, 2));
  process.exit(1);
});
