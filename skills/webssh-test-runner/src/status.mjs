export const STATUS = {
  ENVIRONMENT_OK: 'ENVIRONMENT_OK',
  ENVIRONMENT_MISSING: 'ENVIRONMENT_MISSING',
  WEBSSH2_UNAVAILABLE: 'WEBSSH2_UNAVAILABLE',
  PLAYWRIGHT_UNAVAILABLE: 'PLAYWRIGHT_UNAVAILABLE',
  CHROMIUM_UNAVAILABLE: 'CHROMIUM_UNAVAILABLE',
  SSH_TARGET_INVALID: 'SSH_TARGET_INVALID',
};

export function makeReport(checks, status, notes = []) {
  const failed = checks
    .filter((c) => c.ok === false)
    .map((c) => c.label);
  return {
    status,
    ok: status === STATUS.ENVIRONMENT_OK,
    checks,
    failed,
    notes,
    timestamp: new Date().toISOString(),
  };
}
