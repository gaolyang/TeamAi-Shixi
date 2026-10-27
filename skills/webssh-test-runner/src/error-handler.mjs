// Error handler: classify errors into stable outcome codes for the agent to
// act on. Never fabricates a PASS/FAIL; unknown/unverifiable results are
// surfaced as OUTPUT_UNVERIFIED or ERROR.

export const OUTCOME = {
  OK: 'OK',
  BLOCKED: 'BLOCKED',                 // refused by policy / whitelist
  TIMEOUT: 'TIMEOUT',                 // no end marker within timeout
  CONNECTION_LOST: 'CONNECTION_LOST', // SSH/socket dropped
  OUTPUT_UNVERIFIED: 'OUTPUT_UNVERIFIED', // could not reliably read output
  ERROR: 'ERROR',
};

export function classifyError(error, ctx = {}) {
  const code = error?.code || error?.cause?.code || '';
  const msg = String(error?.message || error || '');

  if (code === 'SSH_TARGET_INVALID') return OUTCOME.BLOCKED;
  if (code === 'COMMAND_REJECTED' || code === 'INTERACTIVE_COMMAND') return OUTCOME.BLOCKED;
  if (code === 'OUTPUT_UNVERIFIED') return OUTCOME.OUTPUT_UNVERIFIED;
  if (/timeout|Timeout/i.test(msg)) return OUTCOME.TIMEOUT;
  if (/websocket|socket|connection.*lost|ECONNRESET|closed/i.test(msg)) return OUTCOME.CONNECTION_LOST;
  return OUTCOME.ERROR;
}

export function makeErrorOutcome(error, ctx = {}) {
  const outcome = classifyError(error, ctx);
  return {
    outcome,
    ok: outcome === OUTCOME.OK,
    error: String(error?.message || error || 'unknown error'),
    code: error?.code || null,
    ctx,
  };
}
