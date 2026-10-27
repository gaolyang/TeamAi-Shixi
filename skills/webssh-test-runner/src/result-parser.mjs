// Result parser: turn raw command execution into a PASS/FAIL assertion using
// the testcase's expected rules. Exit code 0 alone is never treated as a pass;
// the assertion must match the genuine output (or an expected exit code).

// Rule evaluation. Supported keys:
//   contains, not_contains, regex, equals, exit_code, not_exit_code, any, all
export function evaluateAssertion(expected, { output, exitCode }) {
  if (!expected || typeof expected !== 'object') {
    return { passed: true, actual: 'no assertion provided; recorded command status only' };
  }

  const out = output ?? '';
  const results = [];
  const checks = [];

  const push = (name, ok, actual) => { checks.push(name); results.push(ok); return ok; };

  if ('contains' in expected) {
    const v = expected.contains;
    push('contains', out.includes(v), out.includes(v) ? `output contains "${v}"` : `output lacks "${v}"`);
  }
  if ('not_contains' in expected) {
    const v = expected.not_contains;
    push('not_contains', !out.includes(v), out.includes(v) ? `output contains forbidden "${v}"` : `output lacks "${v}"`);
  }
  if ('regex' in expected) {
    try {
      const re = expected.regex instanceof RegExp ? expected.regex : new RegExp(expected.regex);
      push('regex', re.test(out), re.test(out) ? 'regex matched' : 'regex did not match');
    } catch (e) {
      results.push(false); checks.push('regex');
    }
  }
  if ('equals' in expected) {
    push('equals', out.trim() === String(expected.equals), out.trim() === String(expected.equals) ? 'output equals expected' : 'output != expected');
  }
  if ('exit_code' in expected) {
    push('exit_code', Number(exitCode) === Number(expected.exit_code), `exit_code=${exitCode} expected=${expected.exit_code}`);
  }
  if ('not_exit_code' in expected) {
    push('not_exit_code', Number(exitCode) !== Number(expected.not_exit_code), `exit_code=${exitCode} should not be ${expected.not_exit_code}`);
  }

  let passed;
  if ('any' in expected && Array.isArray(expected.any)) {
    const anyOk = expected.any.map((r) => evaluateAssertion(r, { output, exitCode }).passed);
    passed = anyOk.some(Boolean);
  } else if ('all' in expected && Array.isArray(expected.all)) {
    const allOk = expected.all.map((r) => evaluateAssertion(r, { output, exitCode }).passed);
    passed = allOk.every(Boolean);
  } else if (results.length === 0) {
    passed = true;
    return { passed, actual: 'no comparable assertion; command status recorded only' };
  } else {
    passed = results.every(Boolean);
  }

  return { passed, actual: `rules[${checks.join(',')}] -> ${passed ? 'PASS' : 'FAIL'}` };
}

// Map execution outcome + assertion to a canonical result status.
export function finalStatus(execution, assertion) {
  if (execution.status === 'TIMEOUT') return 'TIMEOUT';
  if (execution.status === 'BLOCKED') return 'BLOCKED';
  if (execution.status === 'ERROR') return 'ERROR';
  if (execution.status === 'CONNECTION_LOST') return 'ERROR';
  if (assertion.passed) return 'PASS';
  return 'FAIL';
}
