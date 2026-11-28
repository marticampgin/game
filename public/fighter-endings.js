import { fighterKit, fighterLayout } from './fighter-kit.js';

const playing = new WeakMap();
const defaults = {collapse:[110,225,440], celebrate:[190,460,760]};

export function stopEnding(sprite) {
  playing.get(sprite)?.cancel();
  playing.delete(sprite);
  delete sprite.dataset.collapsing;
  delete sprite.dataset.celebrating;
}

export function playFighterEnding(sprite, layer, still, speed = 1, scene) {
  if (!sprite || still || !sprite.hasAttribute('data-' + layer + '-ready')) return;
  stopEnding(sprite);
  const [first, accent, finish] = fighterKit(sprite.dataset.class).endingTimingMs?.[layer] ?? defaults[layer];
  const times = [0, first*.50, first, (first+accent)/2, accent,
    accent+(finish-accent)*.35, accent+(finish-accent)*.66, accent+(finish-accent)*.88, finish];
  const bands = fighterLayout.health;
  const row = bands.findIndex(band => band.id === sprite.dataset.tier);
  const columns = fighterLayout.layers[layer].columns;
  const sheet = {
    backgroundImage:'url("' + sprite.dataset[layer + 'Src'] + '")',
    backgroundSize:columns * 100 + '% ' + bands.length * 100 + '%',
    backgroundPositionY:row * 100 / (bands.length-1) + '%',
  };
  const columnAt = index => index * 100 / (columns-1) + '%';
  const cel = sprite.querySelector('.arena-cel');
  sprite.setAttribute(layer === 'collapse' ? 'data-collapsing' : 'data-celebrating','');
  if (scene) {
    // A reaction shares the command clock. Write the exposed column on each
    // beat so a busy compositor cannot race the landing or the following turn.
    const saved = {};
    for (const key of [...Object.keys(sheet),'backgroundPositionX']) saved[key] = cel.style[key];
    const handle = {cancel:() => Object.assign(cel.style,saved)};
    playing.set(sprite,handle);
    Object.assign(cel.style,sheet,{backgroundPositionX:columnAt(0)});
    scene.reservePaint([first, accent, times[6], finish]);
    times.slice(1).forEach((time,i) => scene.at(time,() => {
      if (playing.get(sprite) === handle) cel.style.backgroundPositionX = columnAt(i+1);
    }));
    scene.at(finish + 18,() => {
      if (playing.get(sprite) === handle) stopEnding(sprite);
    });
    return;
  }
  const frames = times.map((time,index) => ({
    ...sheet, offset:time / finish, easing:'steps(1,end)', backgroundPositionX:columnAt(index),
  }));
  const cue = cel.animate(frames,{duration:finish / speed,fill:'both'});
  cue.id = 'fighter-' + layer;
  playing.set(sprite,cue);
  // The standing atlas has an identical endpoint. Let the last exposure paint
  // before releasing the animation, including when a server refreshes the HUD.
  cue.onfinish = () => requestAnimationFrame(() => {
    if (playing.get(sprite) === cue) stopEnding(sprite);
  });
}
