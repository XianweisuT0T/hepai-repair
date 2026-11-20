// Playwright CLI: open the Pages preview, then run-code --filename this file.
// Isolated browser contexts; no user works, API exhibits, or research are created.
async page => {
  const base = new URL(page.url()); base.search = ''; base.hash = '';
  const results = [];
  const check = (condition, message) => { if (!condition) throw new Error(message); };
  for (const width of [1440, 390, 360]) {
    const context = await page.context().browser().newContext({ viewport: { width, height: width > 600 ? 1000 : 844 }, reducedMotion: 'reduce', ...(width < 600 ? { isMobile: true, hasTouch: true } : {}) });
    try {
      await context.addInitScript(() => {
        window.__tones = [];
        const original = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function() {
          const oscillator = original.call(this), start = oscillator.start.bind(oscillator);
          oscillator.start = (...args) => { window.__tones.push(oscillator.frequency.value); return start(...args); };
          return oscillator;
        };
      });
      const p = await context.newPage();
      await p.goto(`${base}?museum=1`);
      await p.locator('[data-testid^="curated-card-"]').first().waitFor();
      check(await p.locator('[data-testid^="curated-card-"]').count() === 3, 'Expected three authored examples');
      check(await p.locator('[data-work-id],canvas').count() === 0, 'List must not contain real works or WebGL scenes');
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Museum horizontal overflow');
      await p.screenshot({ path: `output/playwright/upgrade-shelf-${width}.png`, fullPage: true });
      await p.getByRole('button', { name: '点击开启声音', exact: true }).click();
      for (const id of ['moon-forest', 'star-letter', 'morning-prelude']) {
        await p.getByTestId(`curated-open-${id}`).click();
        await p.waitForFunction(() => document.querySelector('[data-testid="production-canvas"]')?.dataset.webgl === 'ready');
        check(await p.locator('canvas').count() === 1, 'Viewer must use only one renderer');
        for (const part of ['只听 A', '只听 B', '完整合奏']) {
          await p.getByRole('button', { name: part, exact: true }).click();
          await p.evaluate(() => { window.__tones = []; });
          await p.getByTestId('curated-play').click();
          await p.waitForFunction(() => window.__tones.length > 0);
          await p.waitForFunction(() => JSON.parse(document.querySelector('[data-testid="production-canvas"]')?.dataset.scoreWorld || '{}').playing === true);
          const world = JSON.parse(await p.getByTestId('production-canvas').getAttribute('data-score-world'));
          check(world.playing, 'Audio must drive stage playback');
          if (part === '只听 A') check(world.lampOn.every(value => !value), 'Muted B must not light lamps');
          if (part === '只听 B') check(world.starBaseHeights.every(value => value === .3), 'Muted A must not raise stars');
          await p.getByRole('button', { name: '停止试听', exact: true }).click();
        }
        check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Viewer horizontal overflow');
        if (id === 'moon-forest') {
          if (width < 600) {
            await p.getByTestId('production-expand').click();
            check(await p.getByRole('dialog').isVisible(), 'Expanded viewer missing');
            await p.getByTestId('production-close-expanded').click();
          }
          await p.screenshot({ path: `output/playwright/upgrade-viewer-${width}.png`, fullPage: true });
        }
        await p.getByRole('button', { name: '返回示例展柜', exact: true }).click();
        check(await p.getByTestId(`curated-open-${id}`).evaluate(e => e === document.activeElement), 'Return focus not restored');
      }
      results.push({ width, examples: 3, audioAndStage: true, overflow: false });
      if (width === 390) {
        await p.getByTestId('museum-back').click();
        await p.getByText('先一个人试试', { exact: false }).click();
        await p.getByTestId('ready').click(); await p.getByTestId('ready-switch').click(); await p.getByTestId('ready').click();
        await p.waitForFunction(() => document.querySelector('[data-testid="production-canvas"]')?.dataset.cameraMoving === 'false');
        await p.getByTestId('guide-skip').click(); await p.reload();
        await p.waitForFunction(() => document.querySelector('[data-testid="production-canvas"]')?.dataset.cameraMoving === 'false');
        await p.getByTestId('guide-reopen').click();
        await p.getByRole('button', { name: '小号 · 一道刻痕，小齿轮，1道刻痕', exact: true }).click();
        check((await p.getByTestId('operation-cue').innerText()).includes('这块吗'), 'Selected-part guidance missing');
        await p.screenshot({ path: 'output/playwright/upgrade-guide-390.png', fullPage: true });
        await p.getByTestId('slot-slot-1').click(); await p.getByTestId('guide-reopen').waitFor();
        check(await p.evaluate(() => localStorage.getItem('hepai-guide-v1:gears:maker')) === 'seen', 'Completion memory missing');
        await p.getByTestId('demo-switch').click(); await p.getByTestId('guide-skip').waitFor();
        check((await p.getByTestId('operation-cue').innerText()).includes('图纸'), 'A and B guidance must be independent');
        results.push({ skipRefreshReopen: true, directFit: true, separateRoles: true });
      }
    } finally { await context.close(); }
  }
  return results;
}
