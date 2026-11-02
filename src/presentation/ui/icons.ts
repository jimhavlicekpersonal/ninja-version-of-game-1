/** Small inline SVG icons (original artwork) used by the HUD. */
const svg = (body: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" aria-hidden="true" focusable="false">${body}</svg>`;

export const icons = {
  acorns: svg(
    '<circle cx="12" cy="12" r="8.6" fill="#e9b44c" stroke="#7a5418" stroke-width="1.5"/>' +
      '<circle cx="12" cy="12" r="6.2" fill="none" stroke="#b9822a" stroke-width="1"/>' +
      '<rect x="9.6" y="9.6" width="4.8" height="4.8" rx=".6" fill="#7a5418"/>' +
      '<path d="M7.4 8.2c.7-1.2 1.8-2 3-2.4" stroke="#fff4d0" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  dew: svg(
    '<ellipse cx="12" cy="13.5" rx="8.5" ry="6.8" fill="#e6cf95" stroke="#6b5326" stroke-width="1.5"/>' +
      '<path d="M4.2 11.2h15.6M4 15.8h16" stroke="#9c7a3a" stroke-width="1.6"/>' +
      '<path d="M12 6.7V4M9.5 5.2L12 3.2l2.5 2" fill="none" stroke="#6b5326" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M7 9.3c1-.8 2.2-1.2 3.5-1.3" stroke="#fff8e0" stroke-width="1.3" stroke-linecap="round"/>',
  ),
  moonstones: svg(
    '<path d="M12 2.8l7.5 6.2-7.5 12.2L4.5 9z" fill="#45b383" stroke="#1d5a40" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M4.5 9h15M12 2.8l-3 6.2 3 12.2 3-12.2z" fill="none" stroke="#1d5a40" stroke-width="1" stroke-linejoin="round"/>' +
      '<path d="M8.6 6.4l1.2-1.2" stroke="#d8fff0" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  beaver: svg(
    '<circle cx="12" cy="11" r="6.8" fill="#f1c9a0" stroke="#3a2a1e" stroke-width="1.4"/>' +
      '<path d="M5.2 9.2c1.6-1.2 4-1.9 6.8-1.9s5.2.7 6.8 1.9l-.3 1.6H5.5z" fill="#3f6fa0" stroke="#1f3550" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M18.6 9.6l2.6-1.4M18.6 10.6l2.4.8" stroke="#3f6fa0" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="9.6" cy="12.2" r="1" fill="#26303d"/><circle cx="14.4" cy="12.2" r="1" fill="#26303d"/>' +
      '<path d="M10.2 15c1.1.7 2.5.7 3.6 0" stroke="#7a4a2a" stroke-width="1.1" stroke-linecap="round" fill="none"/>' +
      '<path d="M5 21.5l4-4" stroke="#8a5a2c" stroke-width="2" stroke-linecap="round"/><rect x="8" y="15.2" width="4.2" height="2.6" rx=".6" transform="rotate(-45 10.1 16.5)" fill="#9aa6ae" stroke="#3a2a1e" stroke-width=".9"/>',
  ),
  gear: svg(
    '<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8.4 5l1.6 1.3-2 3.4-2-.7a7.6 7.6 0 0 1-2 1.2l-.4 2.1h-3.9l-.4-2.1a7.6 7.6 0 0 1-2-1.2l-2 .7-2-3.4 1.6-1.3a7.8 7.8 0 0 1 0-2.4L1.6 9.2l2-3.4 2 .7a7.6 7.6 0 0 1 2-1.2L8 3.2h3.9l.4 2.1a7.6 7.6 0 0 1 2 1.2l2-.7 2 3.4-1.6 1.3a7.8 7.8 0 0 1 0 2.4z" fill="#f6ead2" stroke="#6b4a6e" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  hammer: svg(
    '<path d="M13.5 9.5l-9 9a1.8 1.8 0 0 0 2.5 2.5l9-9z" fill="#c98d48" stroke="#6b4a6e" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M11 6.5l4-4 3 1 3.5 3.5-2.5 2.5-1.5-1.5-3 3-3.5-3.5z" fill="#9aa6ae" stroke="#6b4a6e" stroke-width="1.4" stroke-linejoin="round"/>',
  ),
  clock: svg('<circle cx="12" cy="12" r="8.5" fill="#fffaf0" stroke="#6b4a6e" stroke-width="1.6"/><path d="M12 7v5l3.5 2" fill="none" stroke="#6b4a6e" stroke-width="1.8" stroke-linecap="round"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>'),
  check: svg('<path d="M4.5 12.5l5 5 10-11" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>'),
  move: svg('<path d="M12 2.5v19M2.5 12h19M12 2.5l-3 3M12 2.5l3 3M12 21.5l-3-3M12 21.5l3-3M2.5 12l3-3M2.5 12l3 3M21.5 12l-3-3M21.5 12l-3 3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>'),
  up: svg('<path d="M12 20V5M5.5 11.5L12 5l6.5 6.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'),
  swords: svg(
    '<path d="M4 3l9.5 9.5-2 2L2 5V3z" fill="#e8eef8" stroke="#6b4a6e" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M20 3l-9.5 9.5 2 2L22 5V3z" fill="#e8eef8" stroke="#6b4a6e" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<path d="M5 15l4 4M19 15l-4 4M3.5 20.5l3-3M20.5 20.5l-3-3" stroke="#c98450" stroke-width="2.6" stroke-linecap="round"/>',
  ),
  scroll: svg(
    '<path d="M6 3.5h11a2.5 2.5 0 0 1 0 5H8v10a2.5 2.5 0 0 1-5 0V6a2.5 2.5 0 0 1 3-2.5z" fill="#fff3d6" stroke="#6b4a6e" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M8 8.5h10v10a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 0 8 18.5z" fill="#ffe6b0" stroke="#6b4a6e" stroke-width="1.4" stroke-linejoin="round"/>' +
      '<path d="M10.5 12h5M10.5 15h5" stroke="#b08a5a" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  troops: svg(
    '<circle cx="9" cy="11" r="6" fill="#2f3a4a" stroke="#141a22" stroke-width="1.3"/>' +
      '<rect x="4.6" y="9" width="8.8" height="3.4" rx="1.6" fill="#f1c9a0"/>' +
      '<circle cx="7.4" cy="10.7" r=".9" fill="#141a22"/><circle cx="10.6" cy="10.7" r=".9" fill="#141a22"/>' +
      '<path d="M3.2 8.4l-1.8-1.6M3.4 9.8l-2.2.2" stroke="#d2412f" stroke-width="1.4" stroke-linecap="round"/>' +
      '<circle cx="16.5" cy="14" r="5.4" fill="#7a2e26" stroke="#3a120e" stroke-width="1.2"/>' +
      '<rect x="12.6" y="12.3" width="7.8" height="3" rx="1.4" fill="#f1c9a0"/>' +
      '<circle cx="15" cy="13.8" r=".8" fill="#141a22"/><circle cx="18" cy="13.8" r=".8" fill="#141a22"/>',
  ),
  leaf: svg(
    '<circle cx="12" cy="12" r="8.6" fill="#f7f0e1" stroke="#26303d" stroke-width="1.5"/>' +
      '<path d="M12 4.6l1.7 5.1 5.3.3-4.2 3.2 1.5 5.1L12 15.3l-4.3 3 1.5-5.1-4.2-3.2 5.3-.3z" fill="#d2412f" stroke="#7a1f16" stroke-width="1" stroke-linejoin="round"/>' +
      '<circle cx="12" cy="12" r="1.6" fill="#f7f0e1"/>',
  ),
  shield: svg(
    '<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="#8fd3ff" stroke="#1f6fa0" stroke-width="1.5" stroke-linejoin="round"/>' +
      '<path d="M12 5v14c3.2-1.3 5.5-4 5.5-7.5V7z" fill="#5cb8ee"/><path d="M8 8.5c.5-1 1.5-1.8 2.5-2" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  chest: svg(
    '<path d="M3 10h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#e2a764" stroke="#7a4a22" stroke-width="1.4"/>' +
      '<path d="M3 10a4 4 0 0 1 4-5h10a4 4 0 0 1 4 5z" fill="#c98450" stroke="#7a4a22" stroke-width="1.4"/>' +
      '<rect x="10" y="9" width="4" height="5" rx="1" fill="#ffd23f" stroke="#7a4a22" stroke-width="1.2"/>',
  ),
  lantern: svg(
    '<path d="M12 1.8v2.4M9 4.2h6" stroke="#26303d" stroke-width="1.6" stroke-linecap="round"/>' +
      '<ellipse cx="12" cy="12" rx="6.4" ry="7.4" fill="#d2412f" stroke="#7a1f16" stroke-width="1.5"/>' +
      '<path d="M6 9.5h12M5.6 12h12.8M6 14.5h12" stroke="#a32d20" stroke-width="1"/>' +
      '<ellipse cx="12" cy="12" rx="2.6" ry="5.4" fill="#ffb15c" opacity=".55"/>' +
      '<rect x="9.4" y="19" width="5.2" height="2" rx=".6" fill="#26303d"/>',
  ),
  star: svg('<path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4-4.7-4.4 6.4-.8z" fill="#ffd23f" stroke="#c98a13" stroke-width="1.4" stroke-linejoin="round"/><path d="M9.5 8.5l1-1.5" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>'),
  grove: svg(
    '<path d="M6 21V3" stroke="#3a2a1e" stroke-width="1.6" stroke-linecap="round"/><path d="M18 21V3" stroke="#3a2a1e" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path d="M6 4h8.5l-2 3 2 3H6z" fill="#d2412f" stroke="#7a1f16" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<path d="M18 9h-8.5l2 3-2 3H18z" fill="#3f7fb5" stroke="#1f3550" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<circle cx="9.5" cy="7" r="1.2" fill="#f7f0e1"/><circle cx="14.5" cy="12" r="1.2" fill="#f7f0e1"/>',
  ),
  toadstool: svg(
    '<path d="M2.5 9.5L12 4l9.5 5.5c-1.5.8-3.4 1-5 .8H7.5c-1.6.2-3.5 0-5-.8z" fill="#c8402f" stroke="#26303d" stroke-width="1.3" stroke-linejoin="round"/>' +
      '<rect x="6" y="10.3" width="12" height="4" fill="#f7f0e1" stroke="#26303d" stroke-width="1.2"/>' +
      '<path d="M4 15.6l8-3.2 8 3.2c-1.3.6-2.7.7-4 .6H8c-1.3.1-2.7 0-4-.6z" fill="#c8402f" stroke="#26303d" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<rect x="7.2" y="16.2" width="9.6" height="4.8" fill="#8c6a4a" stroke="#26303d" stroke-width="1.2"/><rect x="10.6" y="17.6" width="2.8" height="3.4" fill="#26303d"/>' +
      '<path d="M12 4V1.8" stroke="#e9b44c" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  smoke: svg(
    '<circle cx="8.5" cy="13" r="5" fill="#c9ced6" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="15" cy="10.5" r="5.6" fill="#dfe3e8" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="13.5" cy="16" r="4.5" fill="#b8bec8" stroke="#5f6b78" stroke-width="1.3"/>' +
      '<circle cx="5.5" cy="6.5" r="2.4" fill="#26303d"/><path d="M7.2 5l1.6-1.6" stroke="#e9b44c" stroke-width="1.4" stroke-linecap="round"/>',
  ),
  sabotage: svg(
    '<path d="M4 20l9-9" stroke="#26303d" stroke-width="2.6" stroke-linecap="round"/>' +
      '<path d="M13 11l5.5-7 1.5 1.5-7 5.5z" fill="#c9ced6" stroke="#26303d" stroke-width="1.2" stroke-linejoin="round"/>' +
      '<circle cx="17" cy="17" r="4.2" fill="#e9b44c" stroke="#7a5418" stroke-width="1.2"/><path d="M15.2 15.2l3.6 3.6M18.8 15.2l-3.6 3.6" stroke="#7a1f16" stroke-width="1.5" stroke-linecap="round"/>',
  ),
};

export type IconName = keyof typeof icons;
