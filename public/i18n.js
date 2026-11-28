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
  const status = /^(\d+)\s+(.+)$/.exec(value);
  if (status && words.has(status[2].toLowerCase())) return words.get(status[2].toLowerCase()) + ' ×' + status[1];
  return value;
}

export function translate(value, locale = language) {
  const text = String(value ?? '');
  if (locale !== 'ru') return text;
  return text.replace(/^(\s*)([\s\S]*?)(\s*)$/, (_, left, content, right) => left + russian(content,0) + right);
}

let language = 'en';
let observer;
const originals = new WeakMap();
const attributes = ['aria-label','aria-description','aria-valuetext','title','placeholder','alt'];
const excluded = 'script,style,textarea,[translate="no"],[data-room-code],.rail-name,.rail-code,.fighter-title,.command-player-info>strong,.target-name,#target-select option[value]:not([value=""]),.bench-seat strong,.inspect-top h2,.watch-fighter strong,.recap-route>span,.opening-turn .recap-handoff>strong';
function field(node, key, source, apply) {
  let record = originals.get(node);
  const old = record?.get(key);
  const original = old && old.output === source ? old.source : source;
  const output = translate(original);
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
        if (record.type === 'childList') for (const added of record.addedNodes) localizeTree(added);
        else localizeNode(record.target);
      }
    });
    observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
  }
  document.dispatchEvent(new Event('rift-language'));
}
export const getLanguage = () => language;

