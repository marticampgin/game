import { ruContent } from './locales/ru-content.js';
import { ruInterface } from './locales/ru-interface.js';
import { ruMessages } from './locales/ru-messages.js';

const words = new Map([...ruInterface, ...ruContent].map(([key, value]) => [key.toLowerCase(), value]));
const coins = new Intl.PluralRules('ru');
const coinForms = {one:'монета', few:'монеты', many:'монет', other:'монеты'};
const escapePattern = text => text.replace(/[.*+?^$()|[\]\\]/g, '\\$&');
const templates = ruMessages.map(([source, format]) => {
  const fields = [];
  const pattern = source.split(/(\{[npt]\})/).map(part => {
    if (part.length !== 3 || part[0] !== '{') return escapePattern(part);
    fields.push(part[1]);
    return part === '{n}' ? '([+−–\\-\\d][\\d+−–\\-.,/\\u00a0\\u202f]*)' : '(.+?)';
  }).join('');
  return {pattern:new RegExp('^' + pattern + '$', 'iu'), fields, format};
});
const numericFormat = text => text.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1\u00a0');
function russian(value, depth) {
  const fixed = words.get(value.toLowerCase());
  if (fixed !== undefined) return fixed;
  if (!/[A-Za-z]/.test(value) || depth > 5) return numericFormat(value);
  const coinMatch = /^([\d,]+) coins$/i.exec(value);
  if (coinMatch) return numericFormat(coinMatch[1]) + ' ' + coinForms[coins.select(Number(coinMatch[1].replaceAll(',','')))];
  for (const {pattern, fields, format} of templates) {
    const match = pattern.exec(value);
    if (match) return format.replace(/\$(\d+)/g, (_, n) => {
      const raw = match[n];
      return fields[n - 1] === 't' ? russian(raw, depth + 1) : fields[n - 1] === 'n' ? numericFormat(raw) : raw;
    });
  }
  // Lists are built from independent, public UI fields. Names inside journal
  // sentences have already been captured verbatim by the complete template.
  for (const separator of [' · ', ' / ', ', ', '. ']) {
    if (value.includes(separator)) return value.split(separator).map((word, i, list) => {
      const period = separator === '. ' && i + 1 < list.length;
      const translated = russian(word + (period ? '.' : ''), depth + 1);
      return period ? translated.replace(/\.$/,'') : translated;
    }).join(separator);
  }
  const bullet = /^(·\s*|)(.+?)(\s*·|)$/.exec(value);
  if (bullet && (bullet[1] || bullet[3])) return bullet[1] + russian(bullet[2], depth + 1) + bullet[3];
  const status = /^([+−]?\d+)\s+(.+)$/.exec(value);
  if (status && words.has(status[2].toLowerCase())) return words.get(status[2].toLowerCase()) + ' ×' + status[1];
  return value;
}

const translatedText = new Map();
export function translate(value, locale = language) {
  const text = String(value ?? '');
  if (locale !== 'ru') return text;
  if (translatedText.has(text)) return translatedText.get(text);
  const result = text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, left, content, right) => left + russian(content,0) + right);
  if (translatedText.size >= 1500) translatedText.clear();
  translatedText.set(text, result);
  return result;
}

let language = 'en';
let observer;
const originals = new WeakMap();
const titleParts = new WeakMap();
function localizedTitle(parts) {
  return parts.map(part => typeof part === 'string' ? translate(part) : part.name).join('');
}
export function setLocalizedTitle(node, parts) {
  titleParts.set(node, parts);
  node.title = localizedTitle(parts);
}
const attributes = ['aria-label','aria-description','aria-valuetext','title','placeholder','alt'];
const excluded = 'script,style,textarea,[translate="no"],[data-room-code],.rail-name,.rail-code,.fighter-title,.command-player-info>strong,#target-select option[value]:not([value=""]),.bench-seat strong,.inspect-top h2,.watch-fighter strong,.opening-turn .recap-handoff>strong';
function field(node, key, source, apply) {
  if (key === 'title' && titleParts.has(node)) {
    const result = localizedTitle(titleParts.get(node));
    if (result !== source) apply(result);
    return;
  }
  let record = originals.get(node);
  const old = record?.get(key);
  const original = old && old.output === source ? old.source : source;
  const name = node.dataset?.personName;
  let output;
  if (language === 'ru' && name && (key === 'aria-label' || key === 'title')) {
    // The source renderer knows which part is the seat name, including when
    // the player named themselves after a class, an item or a UI command.
    const heading = node.closest('.turn-rail') ? original.indexOf(' · ') + 3
      : node.matches('.fighter-main,.fighter-info') && key === 'aria-label' ? original.indexOf(' ') + 1 : 0;
    const start = original.indexOf(name, heading);
    if (start >= 0) {
      const marked = original.slice(0, start) + '\uFFFC' + original.slice(start + name.length);
      output = translate(marked).replace('\uFFFC', () => name);
    }
  }
  output ??= translate(original);
  if (output !== source) apply(output);
  if (original !== output) {
    if (!record) originals.set(node, record = new Map());
    record.set(key, {source:original,output});
  } else record?.delete(key);
}
function localizeNode(node) {
  if (node.nodeType === 3) {
    if (!node.parentElement?.closest(excluded + ',[data-quantity-line]') && node.data.trim())
      field(node, 'text', node.data, value => {node.data = value;});
    return;
  }
  if (node.nodeType === 1 && !node.closest('[translate="no"]')) {
    if (node.hasAttribute('data-quantity-line')) {
      const line = translate(node.dataset.quantityLine);
      if (line !== node.textContent) {
        const parts = line.split(/(\d+(?:\.\d+)?%?)/g).map((part, i) => {
          if (i % 2 === 0) return document.createTextNode(part);
          const bold = document.createElement('b');
          bold.textContent = part;
          return bold;
        });
        node.replaceChildren(...parts);
      }
    }
    for (const key of attributes) if (node.hasAttribute(key))
      field(node,key,node.getAttribute(key),value => node.setAttribute(key,value));
  }
}
export function localizeTree(root) {
  if (!root || root.nodeType === 3) { if (root) localizeNode(root); return; }
  const walker = document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  localizeNode(root);
  while (walker.nextNode()) localizeNode(walker.currentNode);
}
export function setLanguage(locale) {
  language = locale === 'ru' ? 'ru' : 'en';
  if (typeof document === 'undefined') return;
  observer?.disconnect();
  document.documentElement.lang = language;
  localizeTree(document.documentElement);
  const description = document.querySelector('meta[name="description"]');
  if (description) field(description,'content',description.content,value => {description.content=value;});
  for (const select of document.querySelectorAll('[data-language]')) select.value = language;
  if (language === 'ru') {
    observer ??= new MutationObserver(records => {
      for (const record of records) {
        const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
        const line = element?.closest('[data-quantity-line]');
        if (line) { localizeNode(line); continue; }
        if (record.type === 'childList') for (const added of record.addedNodes) localizeTree(added);
        else localizeNode(record.target);
      }
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'data-quantity-line']});
  }
  document.dispatchEvent(new Event('rift-language'));
}
export const getLanguage = () => language;

export function setPlayerLine(node, before, playerName, after) {
  const name = document.createElement('span');
  name.setAttribute('translate','no');
  name.textContent = playerName;
  node.replaceChildren(before, name, after);
}

