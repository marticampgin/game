import test from 'node:test';
import assert from 'node:assert/strict';
import { beltHTML, beltPoint, wornGear } from '../public/worn-gear.js';
import { fighterLayout } from '../public/fighter-kit.js';

test('visible belt equipment comes from the public equipped slots and respects replacement', () => {
  const pack = {classId:'guardian',artifacts:['vial-sash'],abilities:[{id:'ward-lantern'},{id:'menders-bell'}],consumables:['snare']};
  assert.equal(wornGear(pack),'menders-bell');
  pack.abilities.pop();
  assert.equal(wornGear(pack),'ward-lantern');
  pack.abilities = [];
  assert.equal(wornGear(pack),'vial-sash');
  assert.equal(beltHTML({...pack,hp:0},'critical'),'');
  assert.equal(beltHTML({consumables:['menders-bell']},'healthy'),'');
});
test('equipped props stay on the selected skin and recover to its own belt point', () => {
  for (const [classId, kit] of Object.entries(fighterLayout.founders)) {
    const start = beltPoint(classId,'healthy','idle');
    const critical = beltPoint(classId,'critical','idle');
    assert.ok(critical[1] > start[1]);
    if (kit.anchors?.critical?.belt) assert.deepEqual(critical,kit.anchors.critical.belt);
    const override = [90,70];
    const end = beltPoint(classId,'healthy','utility',11,override);
    assert.deepEqual(end,override);
    assert.ok(beltPoint(classId,'healthy','utility',7,override)[1] > end[1]);
    assert.match(beltHTML({classId,abilities:[{id:'ward-lantern'}]},'healthy',{healthy:{belt:override}}), /data-x="90" data-y="70"/);
  }
});
