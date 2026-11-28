import { CLASSES, RARITIES, REWARDS } from '../src/game/catalog.js';
import { SHOP, owns } from '../src/game/progression.js';
import { rewardIcon } from './art.js';
import { buildAtlas, MAP_HEIGHT, MAP_WIDTH, matchingRewards, REGIONS } from './atlas-model.js';
import { escapeHTML, icon, option, titleCase, toolPage } from './atlas-ui.js';

const rewards = Object.values(REWARDS);
const graph = buildAtlas(rewards);
const byName = (a, b) => a.name.localeCompare(b.name);
const options = (first, values) => option('', first) + values.map(id => option(id, titleCase(id))).join('');
const tags = [...new Set(rewards.flatMap(reward => reward.tags))].sort();
const categories = [...new Set(rewards.map(reward => reward.category))].sort();
const keys = ['search', 'rarity', 'category', 'classId', 'tag'];

function relationList(edges, incoming) {
  if (!edges.length) return '<p class="rb-no-relation">No known reward interaction.</p>';
  return '<ul class="rb-links">' + edges.map(edge => {
    const reward = REWARDS[incoming ? edge.from : edge.to];
    const mechanic = edge.ingredients.map(titleCase).join(' · ');
    return `<li><button type="button" data-jump="${reward.id}"><span class="rb-link-art">${rewardIcon(reward)}</span>
      <span><strong>${escapeHTML(reward.name)}</strong><small>${escapeHTML(mechanic)}</small></span>${icon('chevron', 14)}</button></li>`;
  }).join('') + '</ul>';
}

function detail(reward, profile) {
  const license = SHOP.find(item => item.rewardId === reward.id);
  const availability = !license ? '' : '<p class="rb-license">' + (owns(profile,license) ? 'Unlocked for your drafts' : 'Outfitter unlock · ' + license.price + ' coins') + '</p>';
  const incoming = graph.edges.filter(edge => edge.to === reward.id);
  const outgoing = graph.edges.filter(edge => edge.from === reward.id);
  return `<div class="rb-art-halo"><div>${rewardIcon(reward)}</div></div>
    <h2>${escapeHTML(reward.name)}</h2><div class="rb-traits">
      <span class="rb-rarity" data-tier="${reward.rarity}">${titleCase(reward.rarity)}</span>
      <span>${titleCase(reward.category)}</span>${reward.exclusive ? `<span>${CLASSES[reward.exclusive].name}</span>` : ''}
    </div>
    <p class="rb-description">${escapeHTML(reward.description)}</p>${availability}
    <h3>Incoming <small>${incoming.length}</small></h3>${relationList(incoming, true)}
    <h3>Outgoing <small>${outgoing.length}</small></h3>${relationList(outgoing, false)}
    <div class="rb-tags">${reward.tags.map(tag => `<button type="button" data-tag="${tag}">${titleCase(tag)}</button>`).join('')}</div>`;
}

function edgePath(edge, selected) {
  const a = graph.points.get(edge.from);
  const b = graph.points.get(edge.to);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const inset = 22;
  const dx = (b.x - a.x) / length;
  const dy = (b.y - a.y) / length;
  const isSelected = edge.from === selected || edge.to === selected;
  return `<path class="${isSelected ? 'rb-hot-edge' : 'rb-edge'}" d="M${a.x + dx * inset} ${a.y + dy * inset} L${b.x - dx * inset} ${b.y - dy * inset}"${isSelected ? ' marker-end="url(#rb-arrow)"' : ''}/>`;
}

export function mountAtlas(host, { onClose, readProfile, subscribeProfile } = {}) {
  const { root, destroy, signal } = toolPage(host, 'Reward Atlas', onClose);
  root.insertAdjacentHTML('beforeend', `<form class="rb-filters" role="search" aria-label="Filter rewards">
    <label class="rb-search">${icon('search')}<input type="search" name="search" aria-label="Search rewards or mechanics" placeholder="Search rewards or mechanics" autocomplete="off"/></label>
    <select name="rarity" aria-label="Rarity">${options('Rarity', RARITIES)}</select>
    <select name="category" aria-label="Category">${options('Category', categories)}</select>
    <select name="classId" aria-label="Class affinity">${option('', 'Class affinity')}${option('universal', 'Universal')}${Object.values(CLASSES).map(c => option(c.id, c.name)).join('')}</select>
    <select name="tag" aria-label="Mechanic">${options('Mechanic', tags)}</select>
  </form>
  <div class="rb-atlas-body">
    <div class="rb-map-pane"><div class="rb-map" tabindex="0" role="region" aria-label="Constellation map. Drag to pan. Use arrow keys to pan and plus or minus to zoom.">
      <div class="rb-world"><svg class="rb-edges" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" aria-hidden="true"><defs><marker id="rb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M1 1 9 5 1 9" fill="none" stroke="#edba6a" stroke-width="1.5"/></marker></defs><g></g></svg>
      <div class="rb-regions"></div><div class="rb-nodes"></div></div>
      <div class="rb-map-controls"><button type="button" data-map="minus" aria-label="Zoom out">${icon('minus', 16)}</button><button type="button" data-map="overview">Overview</button><button type="button" data-map="plus" aria-label="Zoom in">${icon('plus', 16)}</button></div>
      <div class="rb-map-empty" hidden><strong>No matching rewards</strong><button type="button" data-clear>Clear filters</button></div>
      <div class="rb-hover" hidden></div>
    </div><div class="rb-browse"><label>Find on map<select aria-label="Find reward on map" data-browse></select></label><button type="button" data-clear hidden>Clear filters</button></div></div>
    <aside class="rb-detail" aria-label="Reward details"></aside>
  </div>`);

  const get = selector => root.querySelector(selector);
  const form = get('.rb-filters');
  const map = get('.rb-map');
  const world = get('.rb-world');
  const inspector = get('.rb-detail');
  const browse = get('[data-browse]');
  const hover = get('.rb-hover');
  let visible = rewards;
  let selected = REWARDS['bastion-bash']?.id || rewards[0]?.id;
  let zoom = 1, x = 0, y = 0;
  let drag = null;

  function fitScale() {
    return Math.min(map.clientWidth / MAP_WIDTH, map.clientHeight / MAP_HEIGHT);
  }
  function transform() {
    // Leave enough of the star chart on screen to drag it home.
    x = Math.max(65 - MAP_WIDTH * zoom, Math.min(map.clientWidth - 65, x));
    y = Math.max(65 - MAP_HEIGHT * zoom, Math.min(map.clientHeight - 65, y));
    world.style.transform = `translate(${x}px, ${y}px) scale(${zoom})`;
    get('[data-map="minus"]').disabled = zoom <= fitScale() * .8 + .001;
    get('[data-map="plus"]').disabled = zoom >= 2.59;
  }
  function center(point, scale) {
    zoom = Math.min(2.6, Math.max(fitScale() * .8, scale));
    x = map.clientWidth / 2 - point.x * zoom;
    y = map.clientHeight / 2 - point.y * zoom;
    transform();
  }
  function overview() {
    const elements = [...world.querySelectorAll('.rb-node, .rb-region')];
    if (!elements.length) return;
    // Region titles can extend beyond the nominal world. Reserve the toolbar's
    // row and fit the actual ink bounds, including centers offset by -50%.
    const left = Math.min(...elements.map(el => el.offsetLeft - el.offsetWidth / 2));
    const right = Math.max(...elements.map(el => el.offsetLeft + el.offsetWidth / 2));
    const top = Math.min(...elements.map(el => el.offsetTop - el.offsetHeight / 2));
    const bottom = Math.max(...elements.map(el => el.offsetTop + el.offsetHeight / 2));
    const toolbar = get('.rb-map-controls');
    const inset = 12;
    const headroom = toolbar.offsetTop + toolbar.offsetHeight + inset;
    zoom = Math.min(fitScale(), (map.clientWidth - 2 * inset) / (right - left),
      (map.clientHeight - headroom - inset) / (bottom - top));
    x = (map.clientWidth - (right + left) * zoom) / 2;
    y = (map.clientHeight + headroom - inset - (bottom + top) * zoom) / 2;
    transform();
  }
  function focusReward(id, scale) {
    const point = graph.points.get(id);
    center(point, scale);
    if (map.clientWidth >= 480) return;
    const frame = map.getBoundingClientRect();
    const title = get(`[data-region="${point.region.id}"]`).getBoundingClientRect();
    const dot = get(`[data-node="${id}"]`).getBoundingClientRect();
    // Keep the focused constellation's title below the zoom toolbar while
    // retaining the whole selected reward when they sit far apart.
    const toolbarBottom = get('.rb-map-controls').getBoundingClientRect().bottom;
    const shiftY = Math.min(Math.max(0, toolbarBottom + 6 - title.top), frame.bottom - dot.bottom - 8);
    const shiftX = Math.max(0, frame.left + 8 - title.left) - Math.max(0, title.right - frame.right + 8);
    x += Math.max(frame.left + 8 - dot.left, Math.min(shiftX, frame.right - dot.right - 8));
    y += Math.max(0, shiftY);
    transform();
  }
  function frameVisible() {
    if (selected && (map.clientWidth < 480 || visible.length === 1)) {
      focusReward(selected, Math.max(.97, fitScale() * 1.35));
    } else overview();
  }
  function zoomAt(amount, cx = map.clientWidth / 2, cy = map.clientHeight / 2) {
    const next = Math.max(fitScale() * .8, Math.min(2.6, zoom * amount));
    x = cx - (cx - x) * next / zoom;
    y = cy - (cy - y) * next / zoom;
    zoom = next;
    transform();
  }
  function paint() {
    const ids = new Set(visible.map(reward => reward.id));
    const linked = new Set([selected]);
    const paths = graph.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to));
    const local = [], hot = [];
    for (const edge of paths) {
      if (edge.from === selected || edge.to === selected) {
        linked.add(edge.from);
        linked.add(edge.to);
        hot.push(edgePath(edge, selected));
      } else if (graph.points.get(edge.from).region === graph.points.get(edge.to).region) {
        local.push(edgePath(edge));
      }
    }
    get('.rb-edges g').innerHTML = local.join('') + hot.join('');
    const homes = new Set(visible.map(reward => graph.points.get(reward.id).region.id));
    get('.rb-regions').innerHTML = REGIONS.filter(region => homes.has(region.id)).map(region => {
      const y = Math.min(...[...graph.points.values()].filter(point => point.region === region).map(point => point.y)) - 46;
      return `<button type="button" class="rb-region" data-region="${region.id}" style="left:${region.x}px;top:${y}px;--region:${region.color}" aria-label="Focus ${region.name} constellation">${region.name}</button>`;
    }).join('');
    get('.rb-nodes').innerHTML = visible.map(reward => {
      const p = graph.points.get(reward.id);
      const name = escapeHTML(reward.name);
      return `<button type="button" class="rb-node${linked.has(reward.id) ? ' rb-related' : ''}" data-node="${reward.id}" aria-label="${name}" aria-pressed="${selected === reward.id}" style="left:${p.x}px;top:${p.y}px;--region:${p.region.color}">${rewardIcon(reward)}</button>`;
    }).join('');
    get('.rb-head-extra').textContent = `${visible.length} ${visible.length === 1 ? 'reward' : 'rewards'}`;
    get('.rb-map-empty').hidden = visible.length !== 0;
    world.hidden = !visible.length;
    hover.hidden = true;
    inspector.innerHTML = selected ? detail(REWARDS[selected], readProfile?.()) : '<p class="rb-detail-empty">Choose a reward to inspect its interactions.</p>';
    inspector.scrollTop = 0;
    browse.innerHTML = [...visible].sort(byName).map(reward => option(reward.id, reward.name)).join('');
    browse.disabled = !visible.length;
    if (selected) browse.value = selected;
    get('.rb-browse [data-clear]').hidden = !keys.some(key => form.elements[key].value);
  }
  function filter() {
    const filters = Object.fromEntries(new FormData(form));
    visible = matchingRewards(rewards, CLASSES, filters);
    if (!visible.some(r => r.id === selected)) selected = visible[0]?.id;
    paint();
    frameVisible();
  }
  function select(id, focusMap = false) {
    if (!visible.some(reward => reward.id === id)) {
      form.reset();
      visible = rewards;
    }
    selected = id;
    paint();
    if (focusMap) focusReward(id, Math.max(.95, fitScale() * 1.35));
  }
  function showHover(button) {
    const reward = REWARDS[button.dataset.node];
    hover.textContent = `${reward.name} · ${titleCase(reward.rarity)} ${reward.category}`;
    hover.hidden = false;
  }
  form.addEventListener('submit', event => event.preventDefault(), { signal });
  form.addEventListener('input', filter, { signal });
  browse.addEventListener('change', () => select(browse.value, true), { signal });
  root.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-clear')) { form.reset(); filter(); }
    if (button.dataset.node) {
      const keyboard = event.detail === 0;
      select(button.dataset.node);
      if (keyboard) get(`[data-node="${selected}"]`)?.focus({ preventScroll: true });
      showHover(get(`[data-node="${selected}"]`));
    }
    if (button.dataset.jump) {
      select(button.dataset.jump, true);
      inspector.querySelector('h2').setAttribute('tabindex', '-1');
      inspector.querySelector('h2').focus({ preventScroll: true });
    }
    if (button.dataset.tag) { form.elements.tag.value = button.dataset.tag; filter(); }
    if (button.dataset.map === 'plus') zoomAt(1.3);
    if (button.dataset.map === 'minus') zoomAt(1 / 1.3);
    if (button.dataset.map === 'overview') overview();
    if (button.dataset.region) center(REGIONS.find(region => region.id === button.dataset.region), Math.max(1.05, fitScale() * 1.65));
  }, { signal });
  for (const eventType of ['pointerover', 'focusin']) {
    map.addEventListener(eventType, event => {
      const button = event.target.closest('[data-node]');
      if (button) showHover(button);
    }, { signal });
  }
  for (const eventType of ['pointerout', 'focusout']) {
    map.addEventListener(eventType, event => {
      if (event.target.closest('[data-node]')) hover.hidden = true;
    }, { signal });
  }
  map.addEventListener('wheel', event => {
    event.preventDefault();
    const rect = map.getBoundingClientRect();
    zoomAt(Math.exp(-Math.sign(event.deltaY) * .12), event.clientX - rect.left, event.clientY - rect.top);
  }, { passive: false, signal });
  map.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button')) return;
    map.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, left: event.clientX, top: event.clientY, x, y };
    map.classList.add('rb-dragging');
  }, { signal });
  map.addEventListener('pointermove', event => {
    if (drag?.id !== event.pointerId) return;
    x = drag.x + event.clientX - drag.left;
    y = drag.y + event.clientY - drag.top;
    transform();
  }, { signal });
  map.addEventListener('lostpointercapture', () => { drag = null; map.classList.remove('rb-dragging'); }, { signal });
  map.addEventListener('keydown', event => {
    const moves = { ArrowLeft: [55, 0], ArrowRight: [-55, 0], ArrowUp: [0, 55], ArrowDown: [0, -55] };
    if (moves[event.key]) {
      x += moves[event.key][0];
      y += moves[event.key][1];
      transform();
    } else if (event.key === '+' || event.key === '=') zoomAt(1.3);
    else if (event.key === '-') zoomAt(1 / 1.3);
    else if (event.key === '0') overview();
    else return;
    event.preventDefault();
  }, { signal });
  const unsubscribe = subscribeProfile?.(() => {
    if (selected) inspector.innerHTML = detail(REWARDS[selected], readProfile?.());
  });
  if (unsubscribe) signal.addEventListener('abort', unsubscribe, {once:true});
  const observer = new ResizeObserver(frameVisible);
  observer.observe(map);
  signal.addEventListener('abort', () => observer.disconnect(), { once: true });
  paint();
  frameVisible();
  return destroy;
}
