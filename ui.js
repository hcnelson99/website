// @ts-check

/**
 * ui.js — Minimal vanilla component library.
 *
 * - css`...` for co-located styles (CSS-in-JS)
 * - h(tag, attrs, ...children) for DOM creation
 * - Element shorthand factories: div, span, button, etc.
 *
 * Components are pure functions returning DOM nodes.
 * No virtual DOM, no diffing, no reactivity — just regenerate the DOM.
 */

// ── CSS-in-JS ───────────────────────────────────────────────

const _uiSheet = document.head.appendChild(document.createElement('style'));
let _uiId = 0;

/**
 * Inject global CSS (not scoped to a class).
 * Use for body/html styles, @keyframes, etc.
 *
 * @param {TemplateStringsArray} strings
 * @param {(string | number)[]} values
 */
export function globalCss(strings, ...values) {
  let body = '';
  for (let i = 0; i < strings.length; i++) {
    body += strings[i];
    if (i < values.length) body += String(values[i]);
  }
  _uiSheet.textContent += body + '\n';
}

/**
 * Define a CSS class with a unique generated name.
 * Call at module level, not inside render functions.
 * Supports native CSS nesting with `&`.
 *
 * @example
 * const card = css`
 *   width: 60px;
 *   &:hover { transform: scale(1.05); }
 * `;
 *
 * @param {TemplateStringsArray} strings
 * @param {(string | number)[]} values
 * @returns {string} Generated class name
 */
export function css(strings, ...values) {
  const name = `_${_uiId++}`;
  let body = '';
  for (let i = 0; i < strings.length; i++) {
    body += strings[i];
    if (i < values.length) body += String(values[i]);
  }
  _uiSheet.textContent += `.${name}{${body}}\n`;
  return name;
}

// ── DOM Creation ────────────────────────────────────────────

/** @typedef {string | number | Node | null | false | undefined} Child */
/** @typedef {Child | Child[]} Children */

/**
 * Create an HTML element.
 *
 * - `class`: string or array of (string | falsy). Falsy values filtered out.
 * - `style`: string or object (merged via Object.assign).
 * - `on*`: event listeners (onclick, onmouseenter, etc).
 * - Anything else: setAttribute.
 *
 * Children can be strings, numbers, Nodes, arrays, or null/false/undefined (ignored).
 *
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} attrs
 * @param {...Children} children
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        Object.assign(el.style, v);
      } else if (k === 'class') {
        const cls = Array.isArray(v) ? v.filter(Boolean).join(' ') : String(v);
        if (cls) el.className = cls;
      } else if (k.startsWith('on')) {
        el.addEventListener(k.slice(2), /** @type {EventListener} */ (v));
      } else {
        el.setAttribute(k, String(v));
      }
    }
  }
  _appendChildren(el, children);
  return el;
}

/**
 * @param {Node} parent
 * @param {any[]} children
 */
function _appendChildren(parent, children) {
  for (const child of children) {
    if (child == null || child === false) continue;
    if (Array.isArray(child)) {
      _appendChildren(parent, child);
    } else if (child instanceof Node) {
      parent.appendChild(child);
    } else {
      parent.appendChild(document.createTextNode(String(child)));
    }
  }
}

// ── Element Factories ───────────────────────────────────────
// Usage: div({ class: myStyle, onclick: fn }, child1, child2)
// Always pass attrs first ({} if none needed).

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLDivElement} */
export const div = (attrs, ...ch) => h('div', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLSpanElement} */
export const span = (attrs, ...ch) => h('span', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLParagraphElement} */
export const p = (attrs, ...ch) => h('p', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLAnchorElement} */
export const a = (attrs, ...ch) => h('a', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLButtonElement} */
export const button = (attrs, ...ch) => h('button', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLHeadingElement} */
export const h1 = (attrs, ...ch) => h('h1', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLHeadingElement} */
export const h2 = (attrs, ...ch) => h('h2', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLHeadingElement} */
export const h3 = (attrs, ...ch) => h('h3', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLUListElement} */
export const ul = (attrs, ...ch) => h('ul', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLLIElement} */
export const li = (attrs, ...ch) => h('li', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLInputElement} */
export const input = (attrs, ...ch) => h('input', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLLabelElement} */
export const label = (attrs, ...ch) => h('label', attrs, ...ch);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLImageElement} */
export const img = (attrs) => h('img', attrs);

/** @type {(attrs: Record<string, any>, ...children: Children[]) => HTMLCanvasElement} */
export const canvas = (attrs, ...ch) => h('canvas', attrs, ...ch);
