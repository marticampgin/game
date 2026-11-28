import { fighterKit, fighterLayout } from './fighter-kit.js';

const playing = new WeakMap();
const defaults = {collapse:[110,225,440], celebrate:[190,460,760]};

export function stopEnding(sprite) {
  playing.get(sprite)?.cancel();
  playing.delete(sprite);
  delete sprite.dataset.collapsing;
  delete sprite.dataset.celebrating;
}

export function playFighterEnding(sprite, layer, still, speed = 1) {
  if (!sprite || still || !sprite.hasAttribute('data-' + layer + '-ready')) return;
  stopEnding(sprite);
  const [first, accent, finish] = fighterKit(sprite.dataset.class).endingTimingMs?.[layer] ?? defaults[layer];
  const times = [0, first*.50, first, (first+accent)/2, accent,
    accent+(finish-accent)*.35, accent+(finish-accent)*.66, accent+(finish-accent)*.88, finish];
  const bands = fighterLayout.health;
  const row = bands.findIndex(band => band.id === sprite.dataset.tier);
  const columns = fighterLayout.layers[layer].columns;
  const frames = times.map((time,index) => ({
    offset:time / finish, easing:'steps(1,end)',
    backgroundImage:'url("' + sprite.dataset[layer + 'Src'] + '")',
    backgroundSize:columns * 100 + '% ' + bands.length * 100 + '%',
    backgroundPositionX:index * 100 / (columns-1) + '%',
    backgroundPositionY:row * 100 / (bands.length-1) + '%',
  }));
  const cue = sprite.querySelector('.arena-cel').animate(frames,{duration:finish / speed,fill:'both'});
  cue.id = 'fighter-' + layer;
  sprite.setAttribute(layer === 'collapse' ? 'data-collapsing' : 'data-celebrating','');
  playing.set(sprite,cue);
  // The standing atlas has an identical endpoint. Let the last exposure paint
  // before releasing the animation, including when a server refreshes the HUD.
  cue.onfinish = () => requestAnimationFrame(() => {
    if (playing.get(sprite) === cue) stopEnding(sprite);
  });
  return { animation:cue, landmarks:[first, accent, times[6], finish] };
}
