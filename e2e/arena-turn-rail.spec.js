import { expect, test } from '@playwright/test';
import { applyCommand, createMatch } from '../src/game/index.js';

const names = ['Aria Northwind', 'Aria Nightfall', 'Ari', 'Ari', 'Contender 1', 'Contender 2', 'Lark', 'Linden'];
const players = names.map((name, index) => ({ id: 'p' + index, name, classId: 'guardian', bot: false }));

async function restore(page, state) {
  await page.evaluate(data => sessionStorage.setItem('rift-solo', JSON.stringify(data)), { state, viewerId: state.activeId });
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Turn order' }).getByRole('button')).toHaveCount(players.length);
}

test('identical class portraits retain distinct and readable player labels as order changes', async ({ page }, info) => {
  const initial = createMatch({ seed: 'rail-names', players });
  const afterDraft = applyCommand(initial, initial.activeId, { type: 'pick', rewardId: initial.offers[0] });
  const next = applyCommand(afterDraft, initial.activeId, { type: 'act', actionId: 'defend' });
  await page.goto('/');
  for (const width of [320, 390, 1366]) {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 768 });
    await restore(page, initial);
    const rail = page.getByRole('navigation', { name: 'Turn order' });
    const readLabels = () => rail.getByRole('button').evaluateAll(buttons => Object.fromEntries(buttons.map(button => {
      const label = [...button.querySelectorAll('span')].find(span => span.getBoundingClientRect().width > 0);
      return [button.dataset.inspect, label.textContent];
    })));
    const labels = await readLabels();
    expect(new Set(Object.values(labels)).size).toBe(8);
    expect(labels.p0).toBe(width < 700 ? 'ANO' : 'Northwi');
    expect(labels.p1).toBe(width < 700 ? 'ANI' : 'Nightfa');
    expect(labels.p2).toBe('#3');
    expect(labels.p3).toBe('#4');
    expect(labels.p6).toBe(width < 700 ? 'LA' : 'Lark');
    expect(await rail.getByRole('button').evaluateAll(buttons => buttons.every(button => {
      const box = button.getBoundingClientRect();
      const label = [...button.querySelectorAll('span')].find(span => span.getBoundingClientRect().width > 0);
      const hit = document.elementFromPoint(box.left + box.width / 2, box.bottom - 2);
      return box.left >= 0 && box.right <= innerWidth && label.scrollWidth <= label.clientWidth && button.contains(hit);
    }))).toBe(true);
    const inspected = rail.locator('[data-inspect="p1"]');
    await expect(inspected).toHaveAccessibleName(/Aria Nightfall/);
    await inspected.click();
    await expect(page.getByRole('dialog')).toContainText('Aria Nightfall');
    await page.getByRole('button', { name: 'Close dialog' }).click();
    await info.attach('Turn rail at ' + width + 'px', { body: await rail.screenshot(), contentType: 'image/png' });
    await restore(page, next);
    expect(await readLabels()).toEqual(labels);
    await expect(rail.getByRole('button').first()).toHaveAttribute('data-inspect', next.activeId);
  }
});
