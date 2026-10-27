import { test } from 'node:test';
import assert from 'node:assert';

import { validateHost, validatePort, validateTarget } from '../src/host-validator.mjs';

test('allowed host matches exactly', () => {
  const r = validateHost('192.168.1.5', ['192.168.1.5', '10.0.0.1']);
  assert.equal(r.ok, true);
});

test('wildcard allowed host matches', () => {
  const r = validateHost('10.0.0.99', ['10.0.0.*']);
  assert.equal(r.ok, true);
});

test('host not in whitelist is rejected', () => {
  const r = validateHost('8.8.8.8', ['10.0.0.1']);
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in the allowed hosts/);
});

test('invalid host shape rejected', () => {
  assert.equal(validateHost('not a host!!', []).ok, false);
  assert.equal(validateHost('', []).ok, false);
});

test('empty whitelist only checks shape (allows valid IP)', () => {
  assert.equal(validateHost('10.1.2.3', []).ok, true);
});

test('port validation', () => {
  assert.equal(validatePort(22).ok, true);
  assert.equal(validatePort(0).ok, false);
  assert.equal(validatePort(70000).ok, false);
});

test('validateTarget requires username', () => {
  const r = validateTarget({ host: '10.0.0.1', port: 22, username: '' });
  assert.equal(r.ok, false);
});
