// Config loading: .env + optional config JSON + CLI-safe defaults.
// Passwords are only read from process.env at call time, never written to disk/JSON.

import fs from 'node:fs';
import path from 'node:path';

export function loadEnvFile(envPath) {
  const out = {};
  if (!envPath || !fs.existsSync(envPath)) return out;
  const text = fs.readFileSync(envPath, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash >= 0) value = value.slice(0, hash).trim();
    }
    out[key] = value;
  }
  return out;
}

// Boolean handling: accept true/false, 1/0, yes/no (case-insensitive).
export function toBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase().trim();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function parseAllowedHosts(value) {
  if (Array.isArray(value)) {
    return value.map((s) => s.trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

// Build the effective config for one run.
// `cli` = normalized CLI args (with raw password already extracted, not in here).
export function loadConfig({ envPath = null, configPath = null, cli = {} } = {}) {
  const env = { ...loadEnvFile(envPath) };

  // Optional config JSON may carry non-secret settings.
  let configJson = {};
  if (configPath && fs.existsSync(configPath)) {
    try {
      configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      throw new Error(`failed to parse config file ${configPath}: ${e.message}`);
    }
  }

  const pick = (cliKey, envKey, configKey, fallback) => {
    if (cli[cliKey] !== undefined && cli[cliKey] !== null && cli[cliKey] !== '') return cli[cliKey];
    if (env[envKey] !== undefined && env[envKey] !== '') return env[envKey];
    if (configJson[configKey] !== undefined && configJson[configKey] !== '') return configJson[configKey];
    return fallback;
  };

  const websshUrl = pick('websshUrl', 'WEBSSH2_URL', 'websshUrl', 'http://127.0.0.1:2222/ssh');
  const cfg = {
    websshUrl,
    websshHome: pick('websshHome', 'WEBSSH2_HOME', 'websshHome', null),
    websshAutoStart: toBool(pick('websshAutoStart', 'WEBSSH2_AUTO_START', 'websshAutoStart', false)),
    headless: toBool(pick('headless', 'PLAYWRIGHT_HEADLESS', 'headless', true)),
    browserWidth: Number(pick('browserWidth', 'BROWSER_WIDTH', 'browserWidth', 1440)),
    browserHeight: Number(pick('browserHeight', 'BROWSER_HEIGHT', 'browserHeight', 1000)),
    sshHost: pick('host', 'SSH_HOST', 'host', null),
    sshPort: Number(pick('port', 'SSH_PORT', 'port', 22)),
    sshUser: pick('username', 'SSH_USER', 'username', null),
    allowChange: toBool(pick('allowChange', 'ALLOW_CHANGE', 'allowChange', false)),
    privateKeyPath: pick('keyPath', 'SSH_PRIVATE_KEY_PATH', 'privateKeyPath', null),
    allowedHosts: parseAllowedHosts(pick('allowedHosts', 'ALLOWED_HOSTS', 'allowedHosts', '')),
    commandTimeoutMs: Number(pick('commandTimeoutMs', 'COMMAND_TIMEOUT_MS', 'commandTimeoutMs', 30000)),
    pageTimeoutMs: Number(pick('pageTimeoutMs', 'PAGE_TIMEOUT_MS', 'pageTimeoutMs', 20000)),
    evidenceDir: path.resolve(pick('evidenceDir', 'EVIDENCE_DIR', 'evidenceDir', 'evidence')),
    logLevel: pick('logLevel', 'LOG_LEVEL', 'logLevel', 'info'),
    homeDir: process.env[process.platform === 'win32' ? 'USERPROFILE' : 'HOME'] || '.',
    envPath,
    configPath,
  };

  // Secrets: never persisted. Resolve only from process.env at runtime.
  cfg.sshPassword = process.env.TEST_TARGET_PASSWORD
    || process.env.SSH_PASSWORD
    || null     ;
  return cfg;
}
