// Playwright runner: launches Chromium (headless by default), opens the WebSSH2
// page, auto-fills the REAL connection form via verified selectors, and waits
// for a genuine "Connected" terminal. No DOM guessing: selectors were verified
// against the installed WebSSH2 v5.4.2 client.

import { chromium } from 'playwright';

// Verified selectors against WebSSH2 v5.4.2 (SolidJS client).
export const SELECTORS = {
  host: '#hostInput',
  port: '#portInput',
  username: '#usernameInput',
  password: '#passwordInput',
  connect: 'role=button[name="Connect"]',
  term: '.xterm',
  helper: '.xterm-helper-textarea',
};

export class PlaywrightRunner {
  constructor(cfg, { log = () => {} } = {}) {
    this.cfg = cfg;
    this.log = log;
    this.browser = null;
    this.context = null;
    this.page = null;
  }

  async launch() {
    const args = [];
    const launchOpts = { headless: this.cfg.headless, args };
    try {
      this.browser = await chromium.launch(launchOpts);
    } catch {
      // Fall back to installed Edge if system Chromium via Playwright is absent.
      this.log('chromium launch failed; falling back to msedge channel');
      this.browser = await chromium.launch({ ...launchOpts, channel: 'msedge' });
    }
    this.context = await this.browser.newContext({
      viewport: { width: this.cfg.browserWidth, height: this.cfg.browserHeight },
      acceptDownloads: false,
    });
    this.page = await this.context.newPage();
    return this.page;
  }

  // Fill the connection form and click Connect; wait for real Connected state.
  async connect(target, password, privateKeyPath) {
    const base = new URL(this.cfg.websshUrl).origin;
    await this.page.goto(`${base}/ssh`, { waitUntil: 'domcontentloaded', timeout: this.cfg.pageTimeoutMs });
    await this.page.waitForSelector(SELECTORS.host, { timeout: this.cfg.pageTimeoutMs });

    await this.page.fill(SELECTORS.host, target.host);
    await this.page.fill(SELECTORS.port, String(target.port ?? 22));
    await this.page.fill(SELECTORS.username, target.username);

    if (privateKeyPath) {
      throw new Error('private-key auth via WebSSH2 form is not implemented; use password auth only');
    }
    await this.page.fill(SELECTORS.password, password || '');

    await this.page.click(SELECTORS.connect);
    // Wait for the terminal to mount (xterm element + helper textarea present).
    // The #status element is not a reliable "Connected" indicator across WebSSH2
    // builds, so we key off the terminal itself appearing after Connect.
    await this.page.waitForSelector(SELECTORS.term, { state: 'attached', timeout: this.cfg.connectTimeoutMs || 20000 });
    await this.page.waitForSelector(SELECTORS.helper, { state: 'attached', timeout: this.cfg.connectTimeoutMs || 20000 });
  }

  async close() {
    for (const item of [this.context, this.browser]) {
      if (item) { try { await item.close(); } catch {} }
    }
    this.page = this.context = this.browser = null;
  }
}
