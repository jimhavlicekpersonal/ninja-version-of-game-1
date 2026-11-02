/** Small inline SVG icons (original artwork) used by the HUD. */
const svg = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  acorns: svg(
    '<ellipse cx="12" cy="14.5" rx="6.2" ry="7" fill="#d39552" stroke="#3b2a1c" stroke-width="1.5"/>' +
      '<path d="M4.8 10.5c0-3.6 3.2-5.6 7.2-5.6s7.2 2 7.2 5.6z" fill="#6e4524" stroke="#3b2a1c" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M12 4.9l1.4-2.6" stroke="#6e4524" stroke-width="1.8" stroke-linecap="round"/>' +
      '<ellipse cx="9.8" cy="13.5" rx="1.4" ry="2.2" fill="#f0c58e"/>',
  ),
  dew: svg(
    '<path d="M12 2.5C10 6.5 5.5 10.5 5.5 15a6.5 6.5 0 0 0 13 0c0-4.5-4.5-8.5-6.5-12.5z" fill="#4cb2e8" stroke="#1f4f6b" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<ellipse cx="9.7" cy="14" rx="1.5" ry="2.6" fill="#d4f4ff" transform="rotate(20 9.7 14)"/>',
  ),
  moonstones: svg(
    '<path d="M12 2.5l6.5 5-2.5 11.5h-8L5.5 7.5z" fill="#b48cff" stroke="#3a2466" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M5.5 7.5h13M12 2.5l-2.4 5 2.4 11.5 2.4-11.5z" fill="none" stroke="#3a2466" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M8.5 6l1-1.4" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  beaver: svg(
    '<circle cx="7" cy="6.5" r="2.4" fill="#8f5a28" stroke="#3b2a1c" stroke-width="1.2"/>' +
      '<circle cx="17" cy="6.5" r="2.4" fill="#8f5a28" stroke="#3b2a1c" stroke-width="1.2"/>' +
      '<circle cx="12" cy="12.5" r="8" fill="#a8703a" stroke="#3b2a1c" stroke-width="1.5"/>' +
      '<ellipse cx="12" cy="15.5" rx="4.6" ry="3.4" fill="#e3c299"/>' +
      '<circle cx="9" cy="10.5" r="1.2" fill="#20150c"/><circle cx="15" cy="10.5" r="1.2" fill="#20150c"/>' +
      '<circle cx="12" cy="13.3" r="1.5" fill="#3a2213"/>' +
      '<rect x="10.4" y="15.4" width="3.2" height="3.4" rx=".5" fill="#fff" stroke="#20150c" stroke-width=".8"/>',
  ),
  gear: svg(
    '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5l1.6 1.3-2 3.4-2-.7a7.6 7.6 0 0 1-2 1.2l-.4 2.1h-3.9l-.4-2.1a7.6 7.6 0 0 1-2-1.2l-2 .7-2-3.4 1.6-1.3a7.8 7.8 0 0 1 0-2.4L1.6 9.2l2-3.4 2 .7a7.6 7.6 0 0 1 2-1.2L8 3.2h3.9l.4 2.1a7.6 7.6 0 0 1 2 1.2l2-.7 2 3.4-1.6 1.3a7.8 7.8 0 0 1 0 2.4z" fill="#f6ead2" stroke="#3b2a1c" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  hammer: svg(
    '<path d="M13.5 9.5l-9 9a1.8 1.8 0 0 0 2.5 2.5l9-9z" fill="#c98d48" stroke="#3b2a1c" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M11 6.5l4-4 3 1 3.5 3.5-2.5 2.5-1.5-1.5-3 3-3.5-3.5z" fill="#9aa6ae" stroke="#3b2a1c" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="8.5" fill="#fffaf0" stroke="#3b2a1c" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="#3b2a1c" stroke-width="1.8" stroke-linecap="round"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  move: svg('<path d="M12 2.5v19M2.5 12h19M12 2.5l-3 3M12 2.5l3 3M12 21.5l-3-3M12 21.5l3-3M2.5 12l3-3M2.5 12l3 3M21.5 12l-3-3M21.5 12l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  up: svg('<path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  toadstool: svg(
    '<path d="M9 13h6l.8 7.5H8.2z" fill="#fff4dc" stroke="#3b2a1c" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M2.5 13c0-5.5 4.3-9 9.5-9s9.5 3.5 9.5 9z" fill="#d9413a" stroke="#3b2a1c" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<circle cx="8" cy="9" r="1.6" fill="#fff"/><circle cx="14.5" cy="7.5" r="1.3" fill="#fff"/><circle cx="17" cy="11" r="1.1" fill="#fff"/>',
  ),
};

export type IconName = keyof typeof icons;
