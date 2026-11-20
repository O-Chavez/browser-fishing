import { describe, expect, it } from 'vitest';
import { homeJoinDue, homeJoinHtml, homeTipDue, homeTipHtml, installReady, isIos, offersHomeScreen, promptInstall, runningInstalled, type JoinState, type ScreenEnv } from './homescreen';

const android: ScreenEnv = { touch: true, automated: false, installed: false, ios: false };
const iphone: ScreenEnv = { touch: true, automated: false, installed: false, ios: true };
const firstVisit: JoinState = { shown: true, joining: false, name: null, auto: null, freshSave: true, seen: false };

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

  it('waits after a join, online, once per browser, and not on a first join', () => {
    for (const e of [android, iphone]) {
      expect(homeTipDue(e, true, false, false)).toBe(true);
      expect(homeTipDue(e, true, false, true)).toBe(false);
      expect(homeTipDue(e, false, false, false)).toBe(false);
      expect(homeTipDue(e, true, true, false)).toBe(false);
      expect(homeTipDue({ ...e, installed: true }, true, false, false)).toBe(false);
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

describe('Home Screen step at the join', () => {
  it("shows on a phone's first visit, on the join card", () => {
    expect(homeJoinDue(android, firstVisit)).toBe(true);
    expect(homeJoinDue(iphone, firstVisit)).toBe(true);
  });

  it('never shows once this browser has tried to join, joined or played', () => {
    expect(homeJoinDue(iphone, { ...firstVisit, name: 'Oscar' })).toBe(false);
    expect(homeJoinDue(iphone, { ...firstVisit, auto: '1' })).toBe(false);
    // Played offline: progress in this browser's save.
    expect(homeJoinDue(iphone, { ...firstVisit, freshSave: false })).toBe(false);
  });

  it('shows once, only on the join card, never over an automatic join', () => {
    expect(homeJoinDue(iphone, { ...firstVisit, seen: true })).toBe(false);
    expect(homeJoinDue(iphone, { ...firstVisit, shown: false })).toBe(false);
    expect(homeJoinDue(iphone, { ...firstVisit, joining: true })).toBe(false);
  });

  it('never shows on a computer, an installed game or a test browser', () => {
    expect(homeJoinDue({ ...iphone, touch: false }, firstVisit)).toBe(false);
    expect(homeJoinDue({ ...iphone, installed: true }, firstVisit)).toBe(false);
    expect(homeJoinDue({ ...android, automated: true }, firstVisit)).toBe(false);
  });

  it("gives iPhones Safari's steps, with no password talk and a way on in the browser", () => {
    const html = homeJoinHtml({ ios: true, canPrompt: false, installed: false });
    expect(html).toContain('Get the whole screen');
    expect(html).toContain('Open this page in <b>Safari</b>');
    expect(html).toContain('Tap <b>Share</b>');
    expect(html).toContain('data-home="browser"');
    expect(html).toContain('again in ⚙️ Settings');
    expect(html).not.toContain('password');
    expect(html).not.toContain('data-home="install"');
  });

  it("offers the browser's install prompt, else its menu's steps", () => {
    const prompt = homeJoinHtml({ ios: false, canPrompt: true, installed: false });
    expect(prompt).toContain('data-home="install"');
    expect(prompt).toContain('below');
    expect(prompt).not.toContain('⋮');
    const menu = homeJoinHtml({ ios: false, canPrompt: false, installed: false });
    expect(menu).toContain('<b>Install app</b>');
    expect(menu).not.toContain('data-home="install"');
    for (const html of [prompt, menu]) {
      expect(html).toContain('data-home="browser"');
      expect(html).not.toContain('password');
    }
  });

  it('says where to open the game once installed, still with a way on in the browser', () => {
    const html = homeJoinHtml({ ios: false, canPrompt: true, installed: true });
    expect(html).toContain('Installed! Open Lakeside from your Home Screen.');
    expect(html).toContain('data-home="browser"');
    expect(html).not.toContain('data-home="install"');
    expect(html).not.toContain('Settings');
  });
});
