// Target-host validation: shape + whitelist, BEFORE any connection is attempted.

import net from 'node:net';

export function normalizeAllowed(entries) {
  return (entries || [])
    .map((s) => String(s).trim())
    .filter(Boolean);
}

export function validateHost(host, allowedEntries) {
  const allowed = normalizeAllowed(allowedEntries);
  if (!host || typeof host !== 'string' || !host.trim()) {
    return { ok: false, reason: 'host is required' };
  }
  const h = host.trim();
  if (h.length > 253) return { ok: false, reason: `host too long: ${h.length}` };

  const isIp = net.isIP(h);
  const isHostname = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/.test(h);
  if (isIp === 0 && !isHostname) {
    return { ok: false, reason: `host is neither a valid IP nor hostname: "${h}"` };
  }

  if (allowed.length > 0) {
    const match = allowed.some((a) => {
      const a2 = a.trim();
      if (a2 === h) return true;
      if (a2.endsWith('.*') && h.startsWith(a2.slice(0, -1))) return true;
      if (a2.endsWith('*') && h.startsWith(a2.slice(0, -1))) return true;
      return false;
    });
    if (!match) {
      return { ok: false, reason: `host "${h}" is not in the allowed hosts list` };
    }
  }

  return { ok: true, reason: `host "${h}" allowed` };
}

export function validatePort(port) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) {
    return { ok: false, reason: `invalid port: ${port}` };
  }
  return { ok: true, reason: `port ${p}` };
}

export function validateTarget(target) {
  if (!target) return { ok: false, reason: 'no target provided' };
  const hostV = validateHost(target.host, target.allowedHosts || []);
  if (!hostV.ok) return hostV;
  const portV = validatePort(target.port ?? 22);
  if (!portV.ok) return portV;
  if (!target.username) return { ok: false, reason: 'username is required' };
  return { ok: true, reason: 'target valid' };
}
