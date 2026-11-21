import { describe, expect, it } from 'vitest';
import { homeTipDue, homeTipHtml, installReady, isIos, offersHomeScreen, promptInstall, runningInstalled, type ScreenEnv } from './homescreen';

const android: ScreenEnv = { touch: true, automated: false, installed: false, ios: false };
const iphone: ScreenEnv = { touch: true, automated: false, installed: false, ios: true };

describe('Home Screen card', () => {
  it('knows a game opened from the Home Screen or as an installed app', () => {
    const browser = { standalone: false, fullscreen: false, inFullscreen: false, iosStandalone: false };
    expect(runningInstalled(browser)).toBe(false);
    expect(runningInstalled({ ...browser, standalone: true })).toBe(true);
    expect(runningInstalled({ ...browser, iosStandalone: true })).toBe(true);
    // Installed before the manifest said standalone.
    expect(runningInstalled({ ...browser, fullscreen: true })).toBe(true);
    // display-mode: fullscreen also matches while a browser tab is full screen.
    expect(runningInstalled({ ...browser, fullscreen: true, inFullscreen: true })).toBe(false);
  });

  it('tells iPhones and iPads from other phones', () => {
    expect(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X)', 'iPhone', 5)).toBe(true);
    // iPadOS asks for the desktop site and says it's a Mac.
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(true);
    expect(isIos('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(false);
    expect(isIos('Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5)).toBe(false);
  });

  it('is offered on any phone or tablet in a browser tab', () => {
    expect(offersHomeScreen(android)).toBe(true);
    expect(offersHomeScreen(iphone)).toBe(true);
  });

  it('is never offered on a computer, an installed game or a test browser', () => {
    for (const e of [android, iphone]) {
      expect(offersHomeScreen({ ...e, touch: false })).toBe(false);
      expect(offersHomeScreen({ ...e, installed: true })).toBe(false);
      expect(offersHomeScreen({ ...e, automated: true })).toBe(false);
    }
  });

  it('opens after a join, online, once per browser', () => {
    for (const e of [android, iphone]) {
      expect(homeTipDue(e, true, false)).toBe(true);
      expect(homeTipDue(e, true, true)).toBe(false);
      expect(homeTipDue(e, false, false)).toBe(false);
      expect(homeTipDue({ ...e, installed: true }, true, false)).toBe(false);
    }
  });

  it("gives iPhones Safari's steps and sends a player without a password to set one", () => {
    const html = homeTipHtml({ ios: true, hasPass: false, canPrompt: false });
    expect(html).toContain('Tap <b>Share</b>');
    expect(html).toContain('set one first');
    expect(html).toContain('data-acct="pass"');
    expect(html).toContain('data-act="close"');
    expect(html).not.toContain('data-act="install"');
  });

  it('tells an iPhone player with a password to log in with it', () => {
    const html = homeTipHtml({ ios: true, hasPass: true, canPrompt: false });
    expect(html).toContain('Log in there with your name and password.');
    expect(html).not.toContain('data-acct');
    expect(html).toContain('Got it');
  });

  it("offers the browser's install prompt as a button, with no password talk, when it has one", () => {
    const html = homeTipHtml({ ios: false, hasPass: false, canPrompt: true });
    expect(html).toContain('data-act="install"');
    expect(html).toContain('data-act="close"');
    expect(html).not.toContain('data-acct');
    expect(html).not.toContain('password');
  });

  it("points to the browser's menu when there is no prompt", () => {
    const html = homeTipHtml({ ios: false, hasPass: false, canPrompt: false });
    expect(html).toContain('<b>Add to Home screen</b> or <b>Install app</b>');
    expect(html).toContain('⋮</b>');
    expect(html).not.toContain('data-act="install"');
    expect(html).not.toContain('data-acct');
    expect(html).toContain('Got it');
  });

  it('has nothing to prompt until the browser offers it', async () => {
    expect(installReady()).toBe(false);
    expect(await promptInstall()).toBe(false);
  });
});
