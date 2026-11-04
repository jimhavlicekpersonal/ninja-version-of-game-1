/** Tiny DOM helpers so the HUD needs no UI framework. */

type Attrs = Record<string, string | number | boolean | undefined | null | ((e: Event) => void)>;
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (typeof v === 'function') el.addEventListener(k.replace(/^on/, '').toLowerCase(), v as EventListener);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k === 'class') el.className = String(v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

let iconSerial = 0;

/**
 * An element whose innerHTML is a trusted inline SVG icon. Gradient ids (`kg-*`) are made unique per
 * copy: a `url(#id)` resolves to the first match in the document, and one inside a hidden panel
 * would leave every other copy unfilled.
 */
export function icon(svgMarkup: string, cls = 'icon'): HTMLSpanElement {
  const s = document.createElement('span');
  s.className = cls;
  const n = ++iconSerial;
  s.innerHTML = svgMarkup.includes('kg-') ? svgMarkup.replace(/kg-([a-z0-9]+)/g, `kg${n}-$1`) : svgMarkup;
  return s;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}
