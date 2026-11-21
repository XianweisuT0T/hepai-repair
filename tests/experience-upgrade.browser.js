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
      await p.locator('[data-testid^="device-card-"]').first().waitFor();
      check(await p.locator('[data-testid^="device-card-"]').count() === 3, 'Expected three different devices');
      check(await p.locator('[data-work-id],canvas').count() === 0, 'List must not contain real works or WebGL scenes');
      check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Museum horizontal overflow');
      await p.screenshot({ path: `output/playwright/upgrade-shelf-${width}.png`, fullPage: true });
      await p.getByRole('button', { name: '点击开启声音', exact: true }).click();
      for (const id of ['moon-forest', 'star-letter', 'morning-prelude']) {
        const exhibit = p.getByTestId('device-card-musicbox');
        await exhibit.locator('img').evaluate(img => img.decode());
        check(await exhibit.locator('img').evaluate(img => img.naturalWidth > 0), 'Exhibit render missing');
        await p.getByTestId('curated-open-moon-forest').click();
        await p.getByTestId(`score-select-${id}`).click();
        await p.waitForFunction(() => document.querySelector('[data-testid="production-canvas"]')?.dataset.webgl === 'ready');
        check(await p.locator('canvas').count() === 1, 'Viewer must use only one renderer');
        const notePlates = await p.getByTestId('production-canvas').getAttribute('data-notes');
        for (const part of ['只听 A', '只听 B', '完整合奏']) {
          await p.getByRole('button', { name: part, exact: true }).click();
          check(await p.getByTestId('production-canvas').getAttribute('data-notes') === notePlates, 'Solo listening must preserve the original note plates');
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
            const canvas = await p.locator('canvas').elementHandle();
            const button = p.getByTestId('production-expand');
            await button.scrollIntoViewIfNeeded();
            const rect = await button.boundingBox(), touch = await context.newCDPSession(p);
            const point = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
            await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: point.x + 24, y: point.y }] });
            await touch.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
            check(await p.getByRole('dialog').count() === 0, 'Cancelled swipe must not expand the model');
            await button.tap();
            check(await p.getByRole('dialog').isVisible(), 'Expanded viewer missing');
            check(await p.locator('canvas').evaluate((node, original) => node === original, canvas), 'Expansion must preserve the renderer');
            await p.getByTestId('production-close-expanded').tap();
            check(await p.locator('canvas').evaluate((node, original) => node === original, canvas), 'Returning must preserve the renderer');
            await touch.detach();
          }
          await p.screenshot({ path: `output/playwright/upgrade-viewer-${width}.png`, fullPage: true });
        }
        await p.getByRole('button', { name: '返回示例展柜', exact: true }).click();
        check(await p.getByTestId('curated-open-moon-forest').evaluate(e => e === document.activeElement), 'Return focus not restored');
      }
      for (const device of ['star', 'prism']) {
        await p.getByTestId(`device-card-${device}`).locator('img').evaluate(img => img.decode());
        await p.getByTestId(`device-open-${device}`).click();
        await p.locator('[data-webgl="ready"]').waitFor();
        check(await p.locator('canvas').count() === 1, 'Only the open device should render');
        if (device === 'star') {
          await p.getByTestId('star-chart-1').click();
          check(await p.getByTestId('star-model-host').getAttribute('data-star-chart') === '1', 'Star chart switch failed');
          await p.getByTestId('star-orbit-range').fill('90');
          await p.waitForFunction(() => Math.abs(Number(document.querySelector('[data-testid="star-model-host"]').dataset.starOrbitAngle) - Math.PI/2) < .01);
        } else {
          await p.getByTestId('prism-color-1').click(); await p.getByTestId('prism-pattern-2').click();
          check(await p.getByTestId('prism-lantern-canvas').getAttribute('data-prism-color') === '1', 'Lantern color failed');
          check(await p.getByTestId('prism-lantern-canvas').getAttribute('data-prism-pattern') === '2', 'Lantern pattern failed');
        }
        check(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Device detail overflow');
        await p.getByTestId('device-back').click();
        check(await p.getByTestId(`device-open-${device}`).evaluate(e => e === document.activeElement), 'Device return focus missing');
        check(await p.locator('canvas').count() === 0, 'Device canvas must unmount on return');
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
        await p.getByTestId('production-toggle-lid').click();
        await p.waitForFunction(() => document.querySelector('.production-object')?.getAttribute('data-lid-moving') === 'false');
        await p.getByTestId('production-toggle-lid').click();
        await p.waitForFunction(() => document.querySelector('.production-object')?.getAttribute('data-lid-moving') === 'false');
        check(await p.getByTestId('operation-cue').isVisible(), 'Lid movement must preserve reopened guidance');
        await p.getByRole('button', { name: '小号 · 一道刻痕，小齿轮，1道刻痕', exact: true }).click();
        check((await p.getByTestId('operation-cue').innerText()).includes('这块吗'), 'Selected-part guidance missing');
        await p.locator('.ask-button').hover();
        const contrast = await p.locator('.ask-button').evaluate(e => {
          const luminance = color => { const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return values[0] * .2126 + values[1] * .7152 + values[2] * .0722; };
          const style = getComputedStyle(e), bg = luminance(style.backgroundColor);
          return [style.color, getComputedStyle(e.querySelector('strong')).color].map(color => { const fg = luminance(color); return (Math.max(fg, bg) + .05) / (Math.min(fg, bg) + .05); });
        });
        check(contrast.every(ratio => ratio >= 4.5), 'Selected ask button must retain legible contrast on hover');
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
