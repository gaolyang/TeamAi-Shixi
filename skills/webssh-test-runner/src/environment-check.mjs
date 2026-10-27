// Environment check: a hard gate run before any real test execution.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { STATUS, makeReport } from './status.mjs';

const require = createRequire(import.meta.url);

function which(cmd) {
  const paths = (process.env.PATH || '').split(path.delimiter);
  const exts = process.platform === 'win32'
    ? ['.exe', '.cmd', '.bat', '']
    : [''];
  for (const dir of paths) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, cmd + ext);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

function runVersion(cmd, args) {
  try {
    const opts = {
      encoding: 'utf8',
      timeout: 15000,
      windowsHide: true,
      shell: process.platform === 'win32',
    };
    return execFileSync(cmd, args, opts).trim();
  } catch {
    return null;
  }
}

function check(checks, label, ok, detail) {
  checks.push({ label, ok, detail: detail ?? (ok ? 'ok' : 'missing') });
  return ok;
}

export async function checkEnvironment(cfg, { host = null, username = null } = {}) {
  const checks = [];
  const notes = [];

  // --- Node.js ---------------------------------------------------------
  let nodeOk = true;
  let nodeDetail = 'unknown';
  try {
    const v = process.versions.node;
    nodeDetail = `node ${v}`;
    const [major] = v.split('.').map(Number);
    nodeOk = major >= 20;
    if (!nodeOk) notes.push(`Node >=20 required, found ${v}`);
  } catch {
    nodeOk = false;
  }
  check(checks, 'Node.js', nodeOk, nodeDetail)

  // --- npm -------------------------------------------------------------
  const npmBin = which('npm');
  const npmVer = npmBin ? runVersion(npmBin, ['--version']) : null;
  check(checks, 'npm', Boolean(npmVer), npmVer ? `npm ${npmVer} (${npmBin})` : 'not found');

  // --- Playwright (module) --------------------------------------------
  let pwDetail = 'not installed';
  let playwrightAvailable = false;
  try {
    const pw = require('playwright');
    playwrightAvailable = Boolean(pw?.chromium);
    pwDetail = 'playwright module importable';
  } catch {
    pwDetail = 'playwright not installed in this project';
  }
  const pwOk = check(checks, 'Playwright', playwrightAvailable, pwDetail)

  // --- Chromium browser ----------------------------------------------
  let chromiumOk = false;
  if (playwrightAvailable) {
    try {
      const pw = require('playwright');
      const exe = pw.chromium.executablePath();
      chromiumOk = Boolean(exe) && fs.existsSync(exe);
      check(checks, 'Chromium', chromiumOk, chromiumOk ? `browser at ${exe}` : `executable missing at ${exe}`);
      if (!chromiumOk && process.platform === 'win32' && which('msedge')) {
        notes.push('Chromium executable missing; Microsoft Edge (msedge) is available as fallback channel');
      }
    } catch (e) {
      check(checks, 'Chromium', false, e.message);
    }
  } else {
    check(checks, 'Chromium', false, 'skipped (playwright unavailable)');
  }

  // --- WebSSH2 home detection -----------------------------------------
  const candidates = [
    cfg.websshHome,
    'C:\\webssh\\webssh2',
    'D:\\DSH对话\\webssh2',
  ].filter(Boolean);
  let websshHome = null;
  for (const c of candidates) {
    try {
      if (fs.existsSync(path.join(c, 'package.json'))) { websshHome = c; break; }
    } catch { /* ignore */ }
  }
  check(checks, 'WebSSH2 install', Boolean(websshHome),
    websshHome ? `found at ${websshHome}` : 'not found at candidate paths');

  // --- WebSSH2 HTTP service ------------------------------------------
  let websshOk = false;
  let websshDetail = 'not reachable';
  if (cfg.websshUrl) {
    try {
      const base = new URL(cfg.websshUrl).origin;
      const res = await fetch(`${base}/ssh`, {
        headers: { Accept: 'text/html' },
        signal: AbortSignal.timeout(5000),
      });
      websshOk = res.ok;
      websshDetail = `HTTP ${res.status}`;
    } catch (e) {
      websshDetail = `unreachable: ${e?.message || e}`;
    }
  }
  check(checks, 'WebSSH2 service', websshOk, websshDetail)

  // --- SSH target whitelist + shape -----------------------------------
  let targetOk = true;
  if (host) {
    try {
      const { validateHost } = await import('./host-validator.mjs');
      const v = validateHost(host, cfg.allowedHosts);
      targetOk = v.ok;
      check(checks, 'SSH target', v.ok, v.reason);
    } catch (e) {
      targetOk = false;
      check(checks, 'SSH target', false, e.message);
    }
    if (username) check(checks, 'SSH username', Boolean(username), username);
  }

  // --- Overall status --------------------------------------------------
  const fail = checks.filter((c) => c.ok === false).map((c) => c.label);
  let status = STATUS.ENVIRONMENT_OK;
  let finalNotes = notes;

  if (!nodeOk || !npmVer || !playwrightAvailable) {
    status = STATUS.ENVIRONMENT_MISSING;
    finalNotes = [...finalNotes, `missing: ${fail.join(', ')}`];
  } else if (!websshOk) {
    status = STATUS.WEBSSH2_UNAVAILABLE;
  } else if (!chromiumOk) {
    status = STATUS.CHROMIUM_UNAVAILABLE;
    finalNotes = [...finalNotes, 'Chromium browser executable not found'];
  }
  if (host && !targetOk) status = STATUS.SSH_TARGET_INVALID;

  return makeReport(checks, status, finalNotes);
}
