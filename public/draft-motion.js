let flying = null;

function enabled() {
  return !document.hidden && !document.body.classList.contains('reduce-motion') &&
    matchMedia('(min-width: 761px) and (prefers-reduced-motion: no-preference)').matches;
}

export function dealOffers(root) {
  if (!enabled()) return;
  root.querySelectorAll('.draft-card .offer-mount').forEach((mount, index) => {
    mount.animate([
      { transform: 'translateY(12px)', opacity: 0.45 },
      { transform: 'translateY(-2px)', opacity: 1, offset: 0.74 },
      { transform: 'translateY(0)' },
    ], { duration: 250, delay: index * 48, easing: 'cubic-bezier(.18,.7,.28,1)', fill: 'backwards' });
  });
}

export function pickedEmblem(root, id) {
  if (!enabled()) return null;
  const image = root.querySelector('[data-draft-select="' + CSS.escape(id) + '"] .reward-art');
  if (!image) return null;
  const { x, y, width, height } = image.getBoundingClientRect();
  return { src: image.currentSrc || image.src, x: x + width / 2, y: y + height / 2, size: height };
}

export function clearRewardFlight() {
  flying?.abort();
  flying = null;
}

// Fly only an accepted, locally viewed pick. Drawing this outside the game
// tree lets room revisions reconcile the HUD without interrupting the flight.
export function deliverReward(root, playerId, from) {
  clearRewardFlight();
  if (!from || !enabled()) return;
  const seat = root.querySelector('[data-seat="' + CSS.escape(playerId) + '"] .fighter-art');
  if (!seat) return;
  const target = seat.getBoundingClientRect();
  const to = { x: target.x + target.width / 2, y: target.y + target.height * 0.52 };
  const size = Math.max(26, Math.min(56, from.size));
  const layer = document.createElement('span');
  layer.className = 'reward-flight';
  layer.setAttribute('aria-hidden', 'true');
  const token = document.createElement('img');
  token.src = from.src;
  token.alt = '';
  token.style.width = token.style.height = size + 'px';
  const glint = document.createElement('i');
  glint.style.left = (to.x - 3) + 'px';
  glint.style.top = (to.y - 3) + 'px';
  layer.append(token, glint);
  document.body.append(layer);

  const travel = (x, y, scale) =>
    'translate(' + (x - size / 2) + 'px,' + (y - size / 2) + 'px) scale(' + scale + ')';
  const flight = token.animate([
    { transform: travel(from.x, from.y, 1), opacity: 1 },
    { transform: travel(from.x, from.y - 14, 1.12), offset: 0.18 },
    { transform: travel(from.x * 0.55 + to.x * 0.45, (from.y + to.y) / 2 - 38, 0.92), offset: 0.57 },
    { transform: travel(to.x, to.y, 0.32), opacity: 0 },
  ], { duration: 445, easing: 'cubic-bezier(.3,.05,.42,1)', fill: 'forwards' });
  const light = glint.animate([
    { transform: 'scale(.45)', opacity: 0 },
    { transform: 'scale(1)', opacity: 1, offset: 0.27 },
    { transform: 'scale(1.55)', opacity: 0 },
  ], { delay: 375, duration: 205, fill: 'both' });

  const lifetime = new AbortController();
  flying = lifetime;
  function finish() {
    if (flying === lifetime) clearRewardFlight();
  }
  lifetime.signal.addEventListener('abort', () => {
    flight.cancel();
    light.cancel();
    layer.remove();
  }, { once: true });
  for (const event of ['scroll', 'resize']) {
    window.addEventListener(event, finish, { passive: true, signal: lifetime.signal });
  }
  light.finished.then(finish, () => {});
}
