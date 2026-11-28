import { expect, test } from '@playwright/test';
import { applyCommand, createMatch } from '../src/game/index.js';

test('class signatures and wooden, metal and glass impacts render distinct audible waveforms', async ({ page }) => {
  await page.goto('/');
  test.skip(
    await page.evaluate(() => typeof OfflineAudioContext !== 'function'),
    'This browser build has no offline audio renderer.',
  );
  const samples = await page.evaluate(async () => {
    const { playContactSound } = await import('/combat-sound.js');
    const results = [];
    for (const [action, role, effect] of [
      ['bastion-bash', 'guardian', 'bastion'],
      ['attack', 'guardian', 'slash'],
      ['venom-flask', 'alchemist', 'venom'],
      ['cut-the-deck', 'gambler', 'slash'],
      ['soul-tithe', 'necromancer', 'doom'],
      ['mirror-feint', 'trickster', 'slash'],
      ['rivet-drive', 'artificer', 'bastion'],
    ]) {
      const audio = new OfflineAudioContext(1, 20000, 48000);
      playContactSound(audio, { action, role, effect, event: { type: 'damage', amount: 21 }, first: true });
      const samples = (await audio.startRendering()).getChannelData(0);
      let peak = 0,
        energy = 0,
        derivative = 0;
      for (let i = 1; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]));
        energy += samples[i] ** 2;
        derivative += (samples[i] - samples[i - 1]) ** 2;
      }
      results.push({ peak, brightness: Math.sqrt(derivative / energy) });
    }
    return results;
  });
  for (const sample of samples) {
    expect(sample.peak).toBeGreaterThan(0.012);
    expect(sample.peak).toBeLessThan(0.65);
  }
  expect(new Set(samples.map(sample => sample.brightness.toFixed(5))).size).toBe(samples.length);
  expect(samples[2].brightness).toBeGreaterThan(samples[0].brightness * 2);
  expect(samples[1].brightness).toBeGreaterThan(samples[0].brightness * 1.1);
});

test('combat contact respects the persisted sound choice on a real desktop turn', async ({ page }) => {
  await page.addInitScript(() => {
    window.contactTones = 0;
    window.countInstant = false;
    for (const Source of [window.OscillatorNode, window.AudioBufferSourceNode].filter(Boolean)) {
      const original = Source.prototype.start;
      Source.prototype.start = function (...args) {
        if (window.countInstant || document.querySelector('.arena-fx[data-stage="impact"]')) window.contactTones++;
        return original.apply(this, args);
      };
    }
  });
  await page.goto('/');
  const canPlay = await page.evaluate(() => typeof AudioContext === 'function');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const players = [
    { id: 'p1', name: 'Moss', classId: 'guardian' },
    { id: 'p2', name: 'Cinder', classId: 'berserker' },
  ];
  let state;
  for (let i = 0; i < 64; i++) {
    state = createMatch({ seed: 'desktop-contact-' + i, players });
    if (state.activeId === 'p1') break;
  }
  state = applyCommand(state, 'p1', { type: 'pick', rewardId: state.offers[0] });
  for (const [sound, reduced] of [[false, false], [true, false], [true, true], [false, false]]) {
    await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' });
    await page.evaluate(
      (state) => sessionStorage.setItem('rift-solo', JSON.stringify({ state, viewerId: 'p1' })),
      state,
    );
    await page.reload();
    const button = page.locator('[data-ui="battle-sound"]');
    if (
      sound !==
      !!(await page.evaluate(() => JSON.parse(localStorage.getItem('rift-preferences') || '{}').sound))
    )
      await button.click();
    await page.locator('[data-action="bastion-bash"]').click();
    await page.locator('[data-aim="p2"]').click();
    await page.evaluate((reduced)=>{ window.countInstant = reduced; }, reduced);
    await page.locator('[data-execute="bastion-bash"]').click();
    if(!reduced) await expect(page.locator('.arena-fx')).toHaveCount(1);
    await expect(page.locator('.arena-fx')).toBeHidden({ timeout: 7000 });
    const count = await page.evaluate(() => window.contactTones);
    expect(await page.evaluate(() => !!JSON.parse(localStorage.getItem('rift-preferences')).sound)).toBe(
      sound,
    );
    if (sound && canPlay) expect(count).toBeGreaterThan(1);
    else expect(count).toBe(0);
  }
  expect(errors).toEqual([]);
});
