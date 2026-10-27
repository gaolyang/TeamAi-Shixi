// Command executor: drives the real WebSSH2 xterm session.
// It reads genuine terminal output by intercepting the Socket.IO data frames on
// the page's websocket (same technique proven in the Python runner), types the
// wrapped command into the xterm helper textarea, and waits for the unique end
// marker carrying the true exit code.

import { buildWrapper, newToken, buildEndRegex, extractCompletion, isInteractive } from './completion-detector.mjs';

// Decode a Socket.IO v4 "data" frame payload into plain terminal text.
// Mirrors the Python decode_socket_frame: handles both string and binary frames.
export function decodeFrame(payload) {
  let value = null;

  if (typeof payload === 'string') {
    const idx = payload.indexOf('[');
    if (idx < 0) return '';
    try {
      const packet = JSON.parse(payload.slice(idx));
      if (!Array.isArray(packet) || packet.length < 2 || packet[0] !== 'data') return '';
      value = packet[1];
    } catch {
      return '';
    }
  } else if (Buffer.isBuffer(payload)) {
    let buf = payload;
    if (buf.length && [0x34, 0x62, 0x04].includes(buf[0])) buf = buf.subarray(1);
    // If binary, webssh2 sends the data as-is (terminal bytes).
    return buf.toString('utf8');
  } else if (payload && typeof payload === 'object') {
    return '';
  }

  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (value.every((x) => typeof x === 'number')) return Buffer.from(value).toString('utf8');
    return '';
  }
  if (value && typeof value === 'object' && Array.isArray(value.data)) {
    return Buffer.from(value.data).toString('utf8');
  }
  return '';
}

export class CommandExecutor {
  constructor(page, { timeoutMs = 30000, log = () => {} } = {}) {
    this.page = page;
    this.timeoutMs = timeoutMs;
    this.log = log;
    this._chunks = [];
    this._connectionErrors = [];
    this._listeners = [];
    this._attachSocket();
  }

  _attachSocket() {
    const onWs = (ws) => {
      const onFrame = ({ payload }) => {
        const text = decodeFrame(payload);
        if (text) this._chunks.push(text);
        const err = this._parseEvent(payload);
        if (err) this._connectionErrors.push(err);
      };
      ws.on('framereceived', onFrame);
      this._listeners.push(() => ws.off('framereceived', onFrame));
    };
    this.page.on('websocket', onWs);
    this._listeners.push(() => this.page.off('websocket', onWs));
  }

  // Detect Socket.IO "connection-error" events carrying auth/connect failures.
  _parseEvent(payload) {
    if (typeof payload !== 'string') return null;
    const idx = payload.indexOf('[');
    if (idx < 0) return null;
    let arr;
    try { arr = JSON.parse(payload.slice(idx)); } catch { return null; }
    if (!Array.isArray(arr) || typeof arr[0] !== 'string') return null;
    const [name, data] = arr;
    if (name === 'connection-error' && data && typeof data === 'object') {
      return { errorType: data.errorType, message: data.message, host: data.host, port: data.port };
    }
    return null;
  }

  get connectionErrors() {
    return this._connectionErrors;
  }

  async dispose() {
    for (const off of this._listeners) { try { off(); } catch {} }
    this._listeners = [];
  }

  get buffer() {
    return this._chunks.join('');
  }

  // Verify the SSH session is genuinely interactive by running a fast probe.
  // Returns true only if the unique end marker actually came back — i.e. the
  // terminal is a live shell, not merely a mounted-but-unconnected xterm.
  async probeConnected({ timeoutMs = 8000 } = {}) {
    const probe = 'true';
    const tmo = timeoutMs || this.timeoutMs;
    const token = newToken();
    const wrapper = buildWrapper(probe, token);
    const endRegex = buildEndRegex(wrapper.end);
    const startIndex = this._chunks.length;
    await this.type(wrapper.text).catch(() => {});
    const deadline = Date.now() + tmo;
    let last = this.buffer.length;
    while (Date.now() < deadline) {
      const combined = this._chunks.slice(startIndex).join('');
      if (extractCompletion(combined, wrapper.begin, endRegex)) return true;
      if (this._connectionErrors.length) return false;
      if (this.buffer.length === last) await sleep(100);
      last = this.buffer.length;
    }
    return false;
  }

  // Type text into the xterm terminal.
  async type(text) {
    const helper = this.page.locator('.xterm-helper-textarea');
    await helper.waitFor({ state: 'attached', timeout: this.timeoutMs });
    await helper.focus();
    await this.page.keyboard.insertText(text);
    await this.page.keyboard.press('Enter');
  }

  // Execute a command against the live session, returning {exitCode, output, status, timedOut}.
  async execute(command, { timeoutMs } = {}) {
    const tmo = timeoutMs || this.timeoutMs;
    const start = Date.now();

    if (isInteractive(command)) {
      return {
        exitCode: null,
        output: '',
        status: 'BLOCKED',
        timedOut: false,
        error: `INTERACTIVE_COMMAND: command requires interactive input and is not auto-supported`,
      };
    }

    const token = newToken();
    const wrapper = buildWrapper(command, token);
    const endRegex = buildEndRegex(wrapper.end);
    const startIndex = this._chunks.length;

    await this.type(wrapper.text);
    this.log(`command injected: ${command}`);

    const deadline = start + tmo;
    let last = this.buffer.length;
    while (Date.now() < deadline) {
      const combined = this._chunks.slice(startIndex).join('');
      const done = extractCompletion(combined, wrapper.begin, endRegex);
      if (done) {
        const output = cleanOutput(done.output).trim();
        return {
          exitCode: done.exitCode,
          output,
          status: done.exitCode === 0 ? 'COMPLETED' : 'COMPLETED',
          timedOut: false,
          durationMs: Date.now() - start,
        };
      }
      if (this.buffer.length === last) {
        await sleep(150);
      }
      last = this.buffer.length;
    }

    // Timed out with no end marker: interrupt and report TIMEOUT.
    await cancelCommandInTerminal(this.page, this.timeoutMs).catch(() => {});
    const partial = cleanOutput(this._chunks.slice(startIndex).join(''));
    return {
      exitCode: null,
      output: partial.trim(),
      status: 'TIMEOUT',
      timedOut: true,
      durationMs: Date.now() - start,
    };
  }
}

function cleanOutput(s) {
  // Strip common ANSI/control escape sequences so output is legible in evidence.
  return s
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')   // CSI
    .replace(/\x1b\][^\x07]*(\x07|\x1b\\)/g, '') // OSC
    .replace(/\r\n/g, '\n')
    .replace(/\x00/g, '');
}

async function cancelCommandInTerminal(page, tmo) {
  const helper = page.locator('.xterm-helper-textarea');
  await helper.focus().catch(() => {});
  await page.keyboard.press('Control+C').catch(() => {});
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
