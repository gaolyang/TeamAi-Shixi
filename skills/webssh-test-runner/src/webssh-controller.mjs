// WebSSH2 service controller: detect/start/stop a long-running WebSSH2 service.
// Lifecycle is separated from the per-run Playwright lifecycle:
//   - if the service is already up, reuse it (default, never kill it)
//   - only start it when WEBSSH2_AUTO_START is true AND it is not running
// Process tracking only ever stops processes that WE started.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

let ownedPids = new Set();

export function markOwnedPid(pid) {
  if (Number.isInteger(pid) && pid > 0) ownedPids.add(pid);
  return pid;
}

export function ownedPidsList() {
  return [...ownedPids];
}

// Determine the listening port from a URL like http://127.0.0.1:2222/ssh
export function portFromUrl(url) {
  try {
    const u = new URL(url);
    return Number(u.port) || (u.protocol === 'https:' ? 443 : 80);
  } catch {
    return 2222;
  }
}

async function portOpen(port, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host: '127.0.0.1' });
    const done = (ok) => { try { sock.destroy(); } catch {} resolve(ok); };
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => done(true));
    sock.once('timeout', () => done(false));
    sock.once('error', () => done(false));
  });
}

// Human readable whether a WebSSH2 instance is reachable.
export async function detectWebSSH2(url) {
  const base = new URL(url).origin;
  let httpOk = false;
  let status = 'unknown';
  try {
    const res = await fetch(`${base}/ssh`, {
      headers: { Accept: 'text/html' },
      signal: AbortSignal.timeout(4000),
    });
    httpOk = res.ok;
    status = `HTTP ${res.status}`;
  } catch (e) {
    status = `unreachable (${e?.message || e})`;
  }
  return {
    url: normalizeUrl(url),
    portOpen: await portOpen(portFromUrl(url)),
    httpOk,
    status,
    up: httpOk,
  };
}

function normalizeUrl(url) {
  const u = new URL(url);
  if (!u.port) u.port = '2222';
  return u.href;
}

export async function websshStatus(url) {
  return detectWebSSH2(url);
}

// Start WebSSH2 from home dir using its npm start, into the background.
// Returns { pid, logPath } or throws with an actionable message.
export async function startWebSSH2({ home, url }) {
  if (!home || !fs.existsSync(path.join(home, 'package.json'))) {
    throw new Error(
      `WebSSH2 home not found at "${home}". Set WEBSSH2_HOME to the real install dir (e.g. D:\\DSH对话\\webssh2).`
    );
  }
  const port = portFromUrl(url);
  if (await portOpen(port)) {
    return { alreadyRunning: true, port, pid: null };
  }

  const isWin = process.platform === 'win32';
  const npmCmd = isWin ? 'npm.cmd' : 'npm';
  const logPath = path.join(process.cwd(), 'evidence', 'webssh2-start.log');
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, 'a');

  const child = spawn(npmCmd, ['start'], {
    cwd: home,
    detached: isWin,
    windowsHide: true,
    stdio: ['ignore', log, log],
    env: { ...process.env, WEBSSH2_LISTEN_PORT: String(port) },
  });

  child.unref();
  markOwnedPid(child.pid);

  // Wait for the port to come up.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await portOpen(port, 800)) return { alreadyRunning: false, port, pid: child.pid, logPath };
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`WebSSH2 did not become reachable on port ${port} within 20s. Log: ${logPath}`);
}

// Stop only processes recorded as started by this Skill.
export async function stopWebSSH2({ pid, logPath } = {}) {
  if (!pid || !ownedPids.has(pid)) {
    return { stopped: false, reason: 'pid not owned by this Skill; left running' };
  }
  try {
    process.kill(pid);
  } catch {
    /* already gone */
  }
  ownedPids.delete(pid);
  return { stopped: true, pid };
}
