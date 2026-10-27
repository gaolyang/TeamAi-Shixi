// Redaction helpers: keep secrets out of evidence JSON and logs.

const SECRET_ENV_KEYS = [
  'TEST_TARGET_PASSWORD',
  'SSH_PASSWORD',
  'RTR_SSH_PASSWORD',
];

// Collect secret values that should be masked if they happen to appear in
// command output (e.g. a command echoing an env value).
export function collectSecrets() {
  const secrets = new Set();
  for (const key of SECRET_ENV_KEYS) {
    const v = process.env[key];
    if (v) secrets.add(v);
  }
  return [...secrets];
}

// Redact known secret values from arbitrary text.
export function redact(text, secrets = null) {
  if (typeof text !== 'string' || !text) return text;
  const list = secrets || collectSecrets();
  let out = text;
  for (const s of list) {
    if (s && s.length >= 2) {
      out = out.split(s).join('[REDACTED]');
    }
  }
  return out;
}
