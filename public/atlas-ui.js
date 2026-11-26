let instance = 0;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const titleCase = value => value.replaceAll('-', ' ').replace(/(^| )\w/g, c => c.toUpperCase());
export const option = (value, label) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`;
export const icon = (key, size = 18) => {
  const paths = {
    back: 'm14 5-7 7 7 7', search: 'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 1 1 16 0',
    plus: 'M12 5v14 M5 12h14', minus: 'M5 12h14', fit: 'M9 3H3v6 M15 3h6v6 M3 15v6h6 M21 15v6h-6',
    link: 'm4 12 4 4 6-6 M13 5h6v6 M7 17 19 5', chevron: 'm8 5 7 7-7 7', down: 'm5 9 7 7 7-7',
  };
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[key]}"/></svg>`;
};

export function toolPage(host, name, onClose) {
  const before = document.activeElement;
  if (!document.querySelector('link[href$="/atlas.css"], link[data-rift-atlas]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = new URL('./atlas.css', import.meta.url);
    link.dataset.riftAtlas = '';
    document.head.append(link);
  }
  const root = document.createElement('section');
  const uid = `rift-tool-${++instance}`;
  root.className = 'rb-tool';
  root.setAttribute('aria-labelledby', uid);
  root.innerHTML = `<header class="rb-tool-head"><button type="button" class="rb-tool-back" data-back>${icon('back')}Back</button>
    <h1 tabindex="-1" id="${uid}">${name}</h1><div class="rb-head-extra"></div></header>`;
  host.replaceChildren(root);
  root.querySelector('h1').focus({ preventScroll: true });
  const controller = new AbortController();
  const signal = controller.signal;
  const destroy = () => {
    controller.abort();
    root.remove();
    if (before instanceof HTMLElement && before.isConnected) before.focus({ preventScroll: true });
  };
  const close = () => {
    destroy();
    onClose?.();
  };
  root.querySelector('[data-back]').addEventListener('click', close, { signal });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && event.target.tagName !== 'SELECT') {
      event.preventDefault();
      close();
    }
  }, { signal });
  return { root, destroy, signal, close };
}
