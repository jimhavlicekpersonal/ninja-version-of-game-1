/**
 * Small inline SVG icons (original artwork) used by the HUD.
 * Style: sumi-ink outlines (#26303d), light from the upper left, a glint on hard surfaces.
 * Gradients use fixed ids (`kg-*`); every copy defines them identically, so repeats are harmless.
 */
const svg = (body: string, defs = '', vb = '0 0 24 24') =>
  `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>`;

const INK = '#26303d';
const lin = (id: string, stops: [number, string][], x2 = 0, y2 = 1) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
const rad = (id: string, stops: [number, string][], cx = 0.35, cy = 0.3) =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r=".75">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;

const GOLD = rad('kg-gold', [[0, '#fff2b8'], [0.45, '#f2c75a'], [1, '#b9822a']]);
const STEEL = lin('kg-steel', [[0, '#ffffff'], [0.5, '#d4dbe5'], [1, '#8f9aaa']], 1, 1);
const WOOD = lin('kg-wood', [[0, '#d9a066'], [1, '#8a5a2c']], 1, 0);
const WASHI = lin('kg-washi', [[0, '#fffaf0'], [1, '#efe0bd']]);

export const icons = {
  acorns: svg(
    '<circle cx="12" cy="12.4" r="8.8" fill="#7a5418" opacity=".35"/>' +
      `<circle cx="12" cy="12" r="8.6" fill="url(#kg-gold)" stroke="#6b4a12" stroke-width="1.4"/>` +
      '<circle cx="12" cy="12" r="6.1" fill="none" stroke="#b9822a" stroke-width="1"/>' +
      '<rect x="9.6" y="9.6" width="4.8" height="4.8" rx=".6" fill="#6b4a12"/>' +
      '<path d="M7.2 8.4c.7-1.3 1.9-2.2 3.2-2.6" stroke="#fffbe8" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
    GOLD,
  ),
  // Report section 5 step 4 (art F9): an indigo bowl heaped with rice. The old tan bale was the gold coin's
  // size, shape and colour family, so the two main resource pills looked the same at a glance.
  dew: svg(
    '<ellipse cx="12" cy="20.2" rx="6.4" ry="1.4" fill="#1d2a4a" opacity=".3"/>' +
      `<path d="M7 8.6c1-3 3-4.6 5-4.6s4 1.6 5 4.6z" fill="url(#kg-rice)" stroke="#8a8f9e" stroke-width="1"/>` +
      '<path d="M9.2 6.6l.6.3M12 5.4v.7M14.6 6.6l-.6.3M10.6 8l.4.2M13.4 8l-.4.2" stroke="#b9bccb" stroke-width=".9" stroke-linecap="round"/>' +
      `<path d="M3.4 9.4h17.2c-.4 5.2-3.9 9-8.6 9s-8.2-3.8-8.6-9z" fill="url(#kg-bowl)" stroke="#1d2a4a" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<path d="M3.4 9.4h17.2" stroke="#e7ecfb" stroke-width="1.2"/>' +
      '<path d="M7 12.2c.5 1.6 1.6 2.9 3 3.5" stroke="#9fb3ec" stroke-width="1.3" stroke-linecap="round" fill="none"/>',
    rad('kg-rice', [[0, '#ffffff'], [0.7, '#f1f0ea'], [1, '#d9d7cd']]) + lin('kg-bowl', [[0, '#5b78c8'], [0.6, '#33509c'], [1, '#22376f']], 0.5, 1),
  ),
  moonstones: svg(
    `<path d="M12 2.8l7.5 6.2-7.5 12.2L4.5 9z" fill="url(#kg-jade)" stroke="#16503a" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<path d="M4.5 9h15" fill="none" stroke="#16503a" stroke-width="1"/>' +
      '<path d="M12 2.8L9 9l3 12.2L15 9z" fill="#ffffff" opacity=".18" stroke="#16503a" stroke-width=".9" stroke-linejoin="round"/>' +
      '<path d="M8.4 6.6l1.4-1.4" stroke="#e8fff6" stroke-width="1.5" stroke-linecap="round"/>',
    lin('kg-jade', [[0, '#8ae6bd'], [0.5, '#45b383'], [1, '#22805a']], 0.6, 1),
  ),
  beaver: svg(
    '<circle cx="12" cy="11" r="6.8" fill="#f1c9a0" stroke="#3a2a1e" stroke-width="1.4"/>' +
      '<path d="M5.2 9.2c1.6-1.2 4-1.9 6.8-1.9s5.2.7 6.8 1.9l-.3 1.6H5.5z" fill="#3f6fa0" stroke="#1f3550" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M18.6 9.6l2.6-1.4M18.6 10.6l2.4.8" stroke="#3f6fa0" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="9.6" cy="12.2" r="1" fill="#26303d"/><circle cx="14.4" cy="12.2" r="1" fill="#26303d"/>' +
      '<path d="M10.2 15c1.1.7 2.5.7 3.6 0" stroke="#7a4a2a" stroke-width="1.1" stroke-linecap="round" fill="none"/>' +
      `<path d="M5 21.5l4-4" stroke="url(#kg-wood)" stroke-width="2.2" stroke-linecap="round"/><rect x="8" y="15.2" width="4.2" height="2.6" rx=".6" transform="rotate(-45 10.1 16.5)" fill="url(#kg-steel)" stroke="#3a2a1e" stroke-width=".9"/>`,
    WOOD + STEEL,
  ),
  gear: svg(
    `<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5l1.6 1.3-2 3.4-2-.7a7.6 7.6 0 0 1-2 1.2l-.4 2.1h-3.9l-.4-2.1a7.6 7.6 0 0 1-2-1.2l-2 .7-2-3.4 1.6-1.3a7.8 7.8 0 0 1 0-2.4L1.6 9.2l2-3.4 2 .7a7.6 7.6 0 0 1 2-1.2L8 3.2h3.9l.4 2.1a7.6 7.6 0 0 1 2 1.2l2-.7 2 3.4-1.6 1.3a7.8 7.8 0 0 1 0 2.4z" fill="url(#kg-steel)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<circle cx="12" cy="12" r="2.2" fill="#c8402f" stroke="#26303d" stroke-width="1"/>',
    STEEL,
  ),
  hammer: svg(
    `<path d="M13.5 9.5l-9 9a1.8 1.8 0 0 0 2.5 2.5l9-9z" fill="url(#kg-wood)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M11 6.5l4-4 3 1 3.5 3.5-2.5 2.5-1.5-1.5-3 3-3.5-3.5z" fill="url(#kg-steel)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<path d="M13.4 5.6l2-2" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>',
    WOOD + STEEL,
  ),
  clock: svg(
    `<circle cx="12" cy="12" r="8.5" fill="url(#kg-washi)" stroke="${INK}" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/><circle cx="12" cy="12" r="1.1" fill="#c8402f"/>`,
    WASHI,
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  move: svg('<path d="M12 2.5v19M2.5 12h19M12 2.5l-3 3M12 2.5l3 3M12 21.5l-3-3M12 21.5l3-3M2.5 12l3-3M2.5 12l3 3M21.5 12l-3-3M21.5 12l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  up: svg('<path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  swords: svg(
    // Two crossed katana: bright blades, gold guards, wrapped grips.
    `<path d="M3.2 2.6l10.6 10.6-1.6 1.6L1.8 4.4l.2-1.6z" fill="url(#kg-steel)" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<path d="M20.8 2.6L10.2 13.2l1.6 1.6L22.2 4.4 22 2.8z" fill="url(#kg-steel)" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
      '<path d="M8.6 14.2l1.6 1.6M15.4 14.2l-1.6 1.6" stroke="#e9b44c" stroke-width="3.2" stroke-linecap="round"/>' +
      '<path d="M8.6 14.2l1.6 1.6M15.4 14.2l-1.6 1.6" stroke="#7a5418" stroke-width="1" stroke-linecap="round" opacity=".6"/>' +
      '<path d="M5.6 17.2l1.6 1.6M18.4 17.2l-1.6 1.6M3.6 20.4l2.4-2.4M20.4 20.4L18 18" stroke="#26303d" stroke-width="2.8" stroke-linecap="round"/>' +
      '<path d="M4.4 19.6l.8-.8M19.6 19.6l-.8-.8" stroke="#c8402f" stroke-width="1.2" stroke-linecap="round"/>',
    STEEL,
  ),
  // News and messages (retention audit G17): a folded letter with a vermilion seal.
  letter: svg(
    `<rect x="3" y="6" width="18" height="13" rx="2" fill="url(#kg-washi)" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M3.8 7l8.2 6.2L20.2 7" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<circle cx="12" cy="13.4" r="2.6" fill="#c8402f" stroke="#7a2418" stroke-width=".9"/>',
    WASHI,
  ),
  scroll: svg(
    `<path d="M6 3.5h11a2.5 2.5 0 0 1 0 5H8v10a2.5 2.5 0 0 1-5 0V6a2.5 2.5 0 0 1 3-2.5z" fill="url(#kg-washi)" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      `<path d="M8 8.5h10v10a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 0 8 18.5z" fill="#f4e2b8" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>` +
      '<path d="M10.5 12h5M10.5 15h5" stroke="#8a6a3a" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M15.6 3.6v4.8" stroke="#c8402f" stroke-width="1.6" stroke-linecap="round"/>',
    WASHI,
  ),
  troops: svg(
    `<circle cx="9" cy="11" r="6" fill="url(#kg-hood)" stroke="#141a22" stroke-width="1.3"/>` +
      '<rect x="4.6" y="9" width="8.8" height="3.4" rx="1.6" fill="#f1c9a0"/>' +
      '<path d="M6.6 10.4l1.8.5M9.6 10.9l1.8-.5" stroke="#141a22" stroke-width="1.1" stroke-linecap="round"/>' +
      '<path d="M3.2 8.4l-1.8-1.6M3.4 9.8l-2.2.2" stroke="#c8402f" stroke-width="1.4" stroke-linecap="round"/>' +
      '<path d="M3.4 8.1c3.6-.9 7.6-.9 11.2 0" stroke="#c8402f" stroke-width="1.4" fill="none"/>' +
      `<circle cx="16.5" cy="14" r="5.4" fill="url(#kg-hood2)" stroke="#3a120e" stroke-width="1.2"/>` +
      '<rect x="12.6" y="12.3" width="7.8" height="3" rx="1.4" fill="#f1c9a0"/>' +
      '<path d="M14.4 13.6l1.4.4M17.2 14l1.4-.4" stroke="#141a22" stroke-width="1" stroke-linecap="round"/>',
    rad('kg-hood', [[0, '#55627a'], [1, '#1f2734']]) + rad('kg-hood2', [[0, '#b0503f'], [1, '#5a1f18']]),
  ),
  leaf: svg(
    `<circle cx="12" cy="12" r="8.6" fill="url(#kg-washi)" stroke="${INK}" stroke-width="1.5"/>` +
      '<path d="M12 4.6l1.7 5.1 5.3.3-4.2 3.2 1.5 5.1L12 15.3l-4.3 3 1.5-5.1-4.2-3.2 5.3-.3z" fill="url(#kg-red)" stroke="#7a1f16" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="1.6" fill="#f7f0e1"/>',
    WASHI + rad('kg-red', [[0, '#f08a77'], [1, '#a82f20']]),
  ),
  shield: svg(
    `<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="url(#kg-shield)" stroke="#1d4466" stroke-width="1.5" stroke-linejoin="round"/>` +
      '<path d="M12 5v14c3.2-1.3 5.5-4 5.5-7.5V7z" fill="#2a5a85" opacity=".35"/>' +
      '<path d="M7.8 8.6c.5-1 1.5-1.8 2.5-2" stroke="#fff" stroke-width="1.5" stroke-linecap="round" fill="none"/>',
    lin('kg-shield', [[0, '#b8e6ff'], [0.5, '#5aa6dc'], [1, '#2f6f9f']]),
  ),
  chest: svg(
    `<path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="url(#kg-chest)" stroke="#5a3418" stroke-width="1.4"/>` +
      `<path d="M3 10a4 4 0 0 1 4-5h10a4 4 0 0 1 4 5z" fill="#b0703c" stroke="#5a3418" stroke-width="1.4"/>` +
      '<path d="M7 5.2V21M17 5.2V21" stroke="#e9b44c" stroke-width="1.6"/>' +
      `<rect x="10" y="9" width="4" height="5" rx="1" fill="url(#kg-gold)" stroke="#5a3418" stroke-width="1.2"/>` +
      '<path d="M5 7.2c1-.9 2.2-1.4 3.4-1.5" stroke="#ffe2b8" stroke-width="1.2" stroke-linecap="round" fill="none"/>',
    lin('kg-chest', [[0, '#e2a764'], [1, '#a3622e']]) + GOLD,
  ),
  lantern: svg(
    '<path d="M12 1.8v2.4M9 4.2h6" stroke="#26303d" stroke-width="1.6" stroke-linecap="round"/>' +
      `<ellipse cx="12" cy="12" rx="6.4" ry="7.4" fill="url(#kg-lamp)" stroke="#7a1f16" stroke-width="1.5"/>` +
      '<path d="M6 9.5c4 .8 8 .8 12 0M5.6 12h12.8M6 14.5c4-.8 8-.8 12 0" stroke="#a32d20" stroke-width="1" fill="none"/>' +
      '<rect x="9.4" y="19" width="5.2" height="2" rx=".6" fill="#26303d"/><rect x="9.4" y="3.4" width="5.2" height="1.6" rx=".5" fill="#26303d"/>',
    rad('kg-lamp', [[0, '#ffd27a'], [0.4, '#e8603f'], [1, '#a82f20']], 0.5, 0.5),
  ),
  star: svg(
    `<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="url(#kg-gold)" stroke="#8c5f1a" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 8.5l1-1.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>`,
    GOLD,
  ),
  grove: svg(
    '<path d="M6 21V3" stroke="#3a2a1e" stroke-width="1.6" stroke-linecap="round"/><path d="M18 21V3" stroke="#3a2a1e" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M6 4h8.5l-2 3 2 3H6z" fill="url(#kg-red)" stroke="#7a1f16" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M18 9h-8.5l2 3-2 3H18z" fill="url(#kg-blue)" stroke="#1f3550" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<circle cx="9.5" cy="7" r="1.2" fill="#f7f0e1"/><circle cx="14.5" cy="12" r="1.2" fill="#f7f0e1"/>',
    rad('kg-red', [[0, '#f08a77'], [1, '#a82f20']]) + rad('kg-blue', [[0, '#8fc0e8'], [1, '#2a5a85']]),
  ),
  /** Two ninja heads, one in front: Friends (roadmap step 60). */
  friends: svg(
    '<circle cx="15.5" cy="8" r="3.6" fill="#8fa3bb" stroke="#26303d" stroke-width="1.3"/><path d="M9.8 19.5c.6-3.6 2.9-5.6 5.7-5.6s5.1 2 5.7 5.6z" fill="#8fa3bb" stroke="#26303d" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<circle cx="9" cy="9.5" r="4" fill="url(#kg-steel)" stroke="#26303d" stroke-width="1.4"/><path d="M5.2 8.6h7.6" stroke="#a82f20" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M2.6 21c.7-4 3.3-6.2 6.4-6.2s5.7 2.2 6.4 6.2z" fill="url(#kg-steel)" stroke="#26303d" stroke-width="1.4" stroke-linejoin="round"/>',
    STEEL,
  ),
  toadstool: svg(
    `<path d="M2.5 9.5L12 4l9.5 5.5c-1.5.8-3.4 1-5 .8H7.5c-1.6.2-3.5 0-5-.8z" fill="url(#kg-red)" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
      `<rect x="6" y="10.3" width="12" height="4" fill="url(#kg-washi)" stroke="${INK}" stroke-width="1.2"/>` +
      `<path d="M4 15.6l8-3.2 8 3.2c-1.3.6-2.7.7-4 .6H8c-1.3.1-2.7 0-4-.6z" fill="url(#kg-red)" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<rect x="7.2" y="16.2" width="9.6" height="4.8" fill="#9aa0aa" stroke="${INK}" stroke-width="1.2"/><rect x="10.6" y="17.6" width="2.8" height="3.4" fill="${INK}"/>` +
      '<path d="M12 4V1.8" stroke="#e9b44c" stroke-width="1.4" stroke-linecap="round"/>',
    rad('kg-red', [[0, '#f08a77'], [1, '#a82f20']]) + WASHI,
  ),
  smoke: svg(
    '<circle cx="8.5" cy="13" r="5" fill="url(#kg-smoke)" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="15" cy="10.5" r="5.6" fill="url(#kg-smoke)" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="13.5" cy="16" r="4.5" fill="url(#kg-smoke)" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="5.5" cy="6.5" r="2.4" fill="#26303d"/><path d="M7.2 5l1.6-1.6" stroke="#e9b44c" stroke-width="1.4" stroke-linecap="round"/>',
    rad('kg-smoke', [[0, '#ffffff'], [1, '#b8bec8']]),
  ),
  sabotage: svg(
    '<path d="M4 20l9-9" stroke="#26303d" stroke-width="2.6" stroke-linecap="round"/>' +
      `<path d="M13 11l5.5-7 1.5 1.5-7 5.5z" fill="url(#kg-steel)" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
      `<circle cx="17" cy="17" r="4.2" fill="url(#kg-gold)" stroke="#7a5418" stroke-width="1.2"/><path d="M15.2 15.2l3.6 3.6M18.8 15.2l-3.6 3.6" stroke="#7a1f16" stroke-width="1.5" stroke-linecap="round"/>`,
    STEEL + GOLD,
  ),
};

export type IconName = keyof typeof icons;
