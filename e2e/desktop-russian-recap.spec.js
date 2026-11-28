import { expect, test } from '@playwright/test';
import { applyCommand, createMatch, sandboxEdit } from '../src/game/index.js';

test('a Russian knockout recap announces each result and distinguishes a handle from a self-target', async ({page}) => {
  const players = [{id:'lead', name:'Hit', classId:'berserker'}, {id:'other', name:'self', classId:'guardian'}];
  let opening = createMatch({seed:'receipt-0', players});
  opening = applyCommand(opening, 'lead', {type:'pick', rewardId:opening.offers[0]});
  opening = sandboxEdit(opening, {type:'stat', playerId:'other', stat:'hp', value:3});
  opening = sandboxEdit(opening, {type:'stat', playerId:'other', stat:'shield', value:2});
  await page.goto('/');
  await page.getByRole('combobox', {name:'Language'}).selectOption('ru');
  async function loadAction(actionId, targetId) {
    const state = applyCommand(opening, 'lead', {type:'act', actionId, targetId});
    await page.evaluate(save => sessionStorage.setItem('rift-solo', JSON.stringify(save)), {state,viewerId:'lead'});
    await page.reload();
    await page.locator('[data-ui="toggle-recap"]').click();
  }
  await loadAction('attack', 'other');
  const outcome = page.locator('.recap-outcome p');
  await expect(outcome).toHaveText('Потеря здоровья: 3 · Щит поглотил: 2 · self выбывает. Причина — Обычная атака.');
  await expect(outcome.locator('b')).toHaveText(['3','2']);
  const live = page.locator('#battle-announcement');
  await expect(live).toContainText('Hit применяет «Обычная атака».');
  await expect(live).toContainText('Потеря здоровья: 3');
  await expect(live).toContainText('Щит поглотил: 2');
  await expect(live).toContainText('self выбывает.');
  const route = page.locator('.recap-details .recap-route > span');
  await expect(route).toHaveText(['Hit','self']);
  await loadAction('defend', 'lead');
  await expect(route).toHaveText(['Hit','себя']);
});

test('Russian live effect receipts localize action names and preserve player names through language switches', async ({page}) => {
  await page.goto('/');
  await page.getByRole('combobox', {name:'Language'}).selectOption('ru');
  for (const [name, translation] of [['Soul Tithe','Дань душ'],['Blood Cleave','Кровавый размах'],['Time Bolt','Стрела времени']]) {
    await page.evaluate(async actionName => {
      const {mountEffectStrip} = await import('/effect-strip.js');
      const stage = document.querySelector('#receipt-check') || document.body.appendChild(document.createElement('div'));
      stage.id = 'receipt-check';
      const players = [{id:'actor',name:'Hit'}, {id:'target',name:'Soul Tithe'}];
      const show = mountEffectStrip(stage, {actionName,actorName:'Hit'}, players);
      const hit = {type:'damage',targetId:'target',healthDamage:14};
      show({event:hit,events:[hit]}, 0, 2);
      window.showGroupedReceipt = () => show({events:[hit,{...hit,targetId:'actor'}]}, 1, 2);
    },name);
    const stage = page.locator('#receipt-check');
    await expect(stage.locator('.live-phase strong')).toHaveText(translation);
    await expect(stage.locator('.live-phase small')).toContainText('Hit');
    await expect(stage.locator('.effect-receipt').first()).toContainText('ПопаданиеSoul Tithe · −14 ОЗ');
    const live = stage.getByRole('status');
    await expect(live).toHaveText(translation + '. Попадание. Soul Tithe · −14 ОЗ');
    await page.evaluate(() => window.showGroupedReceipt());
    await expect(live).toContainText(translation + '. ');
    await expect(live).toContainText('Soul Tithe · −14 ОЗ / Hit · −14 ОЗ');
    const grouped = stage.locator('.effect-receipt').last();
    await expect(grouped).toHaveAttribute('title','Soul Tithe · −14 ОЗ / Hit · −14 ОЗ');
    await page.getByRole('combobox', {name:'Язык'}).selectOption('en');
    await expect(grouped).toHaveAttribute('title','Soul Tithe · −14 HP / Hit · −14 HP');
    await page.getByRole('combobox', {name:'Language'}).selectOption('ru');
  }
});
