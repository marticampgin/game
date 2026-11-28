import { fighterSpriteHTML, preloadArenaSkins } from './animation.js';

// The Outfitter and practice yard share the same handover. A painted fighter
// stays on the plinth until every required layer of the selected look is ready.
export function createSkinPreview(stage, body, previousClass, {withEffects = false} = {}) {
  let request = 0, reveal;
  function clearTransition() {
    reveal?.cancel();
    stage.querySelector('.' + previousClass)?.remove();
  }

  async function show(player, key, label, canTransition = () => true) {
    if (stage.dataset.requested === key) return;
    const revision = ++request;
    stage.dataset.requested = key;
    delete stage.dataset.failed;
    stage.setAttribute('aria-busy','true');
    if (!body.firstElementChild) body.innerHTML = fighterSpriteHTML(player);
    const ready = await preloadArenaSkins([player], {withEffects});
    if (revision !== request || !stage.isConnected) return;
    stage.setAttribute('aria-busy','false');
    if (!ready.every(Boolean)) {
      stage.dataset.failed = key;
      return 'failed';
    }
    clearTransition();
    const old = body.firstElementChild;
    const changed = stage.dataset.shown && stage.dataset.shown !== key;
    body.innerHTML = fighterSpriteHTML(player);
    stage.dataset.shown = key;
    stage.setAttribute('aria-label',label);
    if (old && changed && canTransition() && !stage.closest('.reduce-motion') &&
        !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const lower = document.createElement('span');
      lower.className = previousClass;
      lower.setAttribute('aria-hidden','true');
      lower.append(old);
      stage.append(lower);
      const time = {duration:150, easing:'ease-out'};
      // The two mask edges meet at the same scanline throughout the wipe.
      const conceal = lower.animate([{clipPath:'inset(-25% -40% -25%)'},{clipPath:'inset(125% -40% -25%)'}],time);
      conceal.onfinish = () => lower.remove();
      reveal = body.animate([{clipPath:'inset(-25% -40% 125%)'},{clipPath:'inset(-25% -40% -25%)'}],time);
    }
    return 'ready';
  }
  function dispose() { ++request; clearTransition(); }
  return {show, dispose};
}
