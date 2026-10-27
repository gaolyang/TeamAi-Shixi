// Screenshot manager: captures real page/terminal screenshots via Playwright.
// Screenshots are taken from the actual WebSSH2 page, never synthesized.

import fs from 'node:fs';
import path from 'node:path';

export class ScreenshotManager {
  constructor({ dir }) {
    this.dir = dir;
  }

  async ensureDir() {
    fs.mkdirSync(this.dir, { recursive: true });
  }

  // Capture the whole page (good for showing login form / connection state).
  async capturePage(page, name) {
    await this.ensureDir();
    const target = path.join(this.dir, name);
    await page.screenshot({ path: target, fullPage: false });
    return target;
  }

  // Capture just the terminal element (`.xterm`) for command-evidence screenshots.
  async captureTerminal(page, name) {
    await this.ensureDir();
    const xterm = page.locator('.xterm');
    const count = await page.locator('.xterm').count();
    const target = path.join(this.dir, name);
    if (count > 0) {
      await xterm.first().screenshot({ path: target });
    } else {
      await page.screenshot({ path: target, fullPage: false });
    }
    return target;
  }

  // Capture a screenshot and swallow errors (a failed screenshot is recorded,
  // but must not by itself flip the command result to a false PASS/FAIL).
  async captureSafe(page, name) {
    try {
      return { ok: true, path: await this.captureTerminal(page, name) };
    } catch (e) {
      return { ok: false, error: e.message, path: null };
    }
  }
}
