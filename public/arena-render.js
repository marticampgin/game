// A turn update can change a single target or HP value. Keep standing sprites
// attached to the document so their idle cycles continue across those updates.
function reconcile(live, next) {
  if (live.isEqualNode(next)) return;
  if (live.nodeName !== next.nodeName || live.namespaceURI !== next.namespaceURI) {
    live.replaceWith(next.cloneNode(true));
    return;
  }
  if (live.nodeType === Node.TEXT_NODE) {
    live.data = next.data;
    return;
  }
  for (const name of live.getAttributeNames()) if (!next.hasAttribute(name)) live.removeAttribute(name);
  for (const { name, value } of next.attributes)
    if (live.getAttribute(name) !== value) live.setAttribute(name, value);
  const children = Array.from(next.childNodes);
  children.forEach((child, index) => {
    const existing = live.childNodes[index];
    if (existing) reconcile(existing, child);
    else live.append(child.cloneNode(true));
  });
  while (live.childNodes.length > children.length) live.lastChild.remove();
  if (live instanceof HTMLSelectElement) live.value = next.value;
}

export function renderArena(root, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const next = template.content.firstElementChild;
  if (root.firstElementChild?.classList.contains('battle-shell')) reconcile(root.firstElementChild, next);
  else root.replaceChildren(next);
}
