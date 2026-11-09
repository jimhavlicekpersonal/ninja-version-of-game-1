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

/**
 * The Enter that sends or searches, not the Enter that confirms an input-method candidate (Chinese pinyin,
 * Japanese, Korean): that one must never send a half-typed message. Safari reports it as keyCode 229 with
 * isComposing false, so both are checked.
 */
export function isSubmitEnter(e: KeyboardEvent): boolean {
  return e.key === 'Enter' && !e.isComposing && e.keyCode !== 229;
}

/**
 * Keeps a text field to `max` code points (a UTF-16 maxlength splits emoji and counts other scripts wrongly),
 * without cutting into an input-method composition: the limit applies once the composition ends.
 */
export function limitCodePoints(el: HTMLInputElement | HTMLTextAreaElement, max: number): void {
  const trim = () => { const cps = Array.from(el.value); if (cps.length > max) el.value = cps.slice(0, max).join(''); };
  el.addEventListener('input', (e) => { if (!(e as InputEvent).isComposing) trim(); });
  el.addEventListener('compositionend', trim);
}
