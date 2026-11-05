/**
 * Daily chest art and its reveal (art re-audit item 7). Plain SVG strings and one DOM helper, so
 * the HUD can use them without Phaser. Owned by the ART compartment.
 *
 * Honest reveal (root CLAUDE.md, "Daily chest"): the lid opens, then the reward that was actually
 * granted appears. No spinning reels, no items flashing past, no "almost" moments; the animation
 * never depends on what is inside, and it is the same for every outcome.
 *
 * GUI wiring (ui/dailyUi.ts): show `chestSvg('closed')` on the Daily card while the chest is ready
 * and `chestSvg('open')` after it is claimed; on claim, call
 * `revealChest(container, rewardElement)` with an element built from the claim's real grants.
 */

let uid = 0;

/** Clan crest (three kunai in a ring) as an SVG group centred on (cx, cy). */
export function crestSvg(cx: number, cy: number, r: number, color: string): string {
  let blades = '';
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * 360 - 90;
    blades +=
      `<g transform="rotate(${a} ${cx} ${cy})">` +
      `<path d="M${cx + r * 0.34} ${cy}L${cx + r * 0.52} ${cy - r * 0.15}L${cx + r * 0.86} ${cy}L${cx + r * 0.52} ${cy + r * 0.15}Z" fill="${color}"/>` +
      `<path d="M${cx + r * 0.1} ${cy}H${cx + r * 0.34}M${cx + r * 0.32} ${cy - r * 0.12}V${cy + r * 0.12}" stroke="${color}" stroke-width="${(r * 0.11).toFixed(2)}" stroke-linecap="round"/>` +
      `</g>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${(r * 0.16).toFixed(2)}"/>${blades}<circle cx="${cx}" cy="${cy}" r="${r * 0.1}" fill="${color}"/>`;
}

/**
 * The daily chest: a lacquered clan strongbox with gold corner fittings, a rope tie and the crest.
 * `open` tips the lid back and shows the warm glow inside. viewBox 0 0 96 96; ids are unique per copy.
 * The lid is its own group (`.kg-chest-lid`, hinge at its back edge) so the reveal can swing it.
 */
export function chestSvg(state: 'closed' | 'open', opts: { label?: string } = {}): string {
  const id = `kgc${++uid}`;
  const INK = '#26303d';
  const defs =
    `<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b0402f"/><stop offset="1" stop-color="#6e1f18"/></linearGradient>` +
    `<linearGradient id="${id}l" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4523c"/><stop offset="1" stop-color="#8a2a20"/></linearGradient>` +
    `<linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#e9b44c"/><stop offset="1" stop-color="#a8772a"/></linearGradient>` +
    `<radialGradient id="${id}r" cx=".5" cy=".6" r=".6"><stop offset="0" stop-color="#fff6c8" stop-opacity=".95"/><stop offset="1" stop-color="#ffcf70" stop-opacity="0"/></radialGradient>`;
  const shadow = `<ellipse cx="48" cy="86" rx="34" ry="5" fill="${INK}" opacity=".22"/>`;
  // Body: front face, side shading, gold corner fittings, the crest plate and the rope.
  const body =
    `<path d="M14 46H82V80Q82 84 78 84H18Q14 84 14 80Z" fill="url(#${id}w)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M14 54H82" stroke="#5a1812" stroke-width="1.4" opacity=".6"/>` +
    `<path d="M14 46H24V56H14ZM72 46H82V56H72ZM14 74H24V84H18Q14 84 14 80ZM72 74H82V80Q82 84 78 84H72Z" fill="url(#${id}g)" stroke="${INK}" stroke-width="1.4"/>` +
    `<circle cx="48" cy="66" r="9" fill="#fbf7ee" stroke="${INK}" stroke-width="1.6"/>` +
    crestSvg(48, 66, 6.6, '#c8402f') +
    `<path d="M30 46V84M66 46V84" stroke="#e6cf95" stroke-width="2.6"/><path d="M30 46V84M66 46V84" stroke="#9c7a3a" stroke-width=".8" stroke-dasharray="2 2"/>` +
    `<path d="M18 50Q20 48 26 48" stroke="#ffffff" stroke-width="1.6" opacity=".35" stroke-linecap="round" fill="none"/>`;
  const lidShape =
    `<path d="M12 46V36Q12 26 22 24H74Q84 26 84 36V46Z" fill="url(#${id}l)" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>` +
    `<path d="M12 36H84" stroke="#5a1812" stroke-width="1.2" opacity=".5"/>` +
    `<path d="M12 38V46H22V38ZM74 38V46H84V38Z" fill="url(#${id}g)" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M30 25V46M66 25V46" stroke="#e6cf95" stroke-width="2.6"/>` +
    `<rect x="42" y="40" width="12" height="9" rx="2" fill="url(#${id}g)" stroke="${INK}" stroke-width="1.4"/>` +
    `<path d="M20 29Q30 27 44 27" stroke="#ffffff" stroke-width="2" opacity=".4" stroke-linecap="round" fill="none"/>`;
  const open = state === 'open';
  const glow = open ? `<ellipse class="kg-chest-glow" cx="48" cy="40" rx="44" ry="30" fill="url(#${id}r)"/>` : '';
  const inside = open ? `<path d="M16 46H80L76 51H20Z" fill="#3a1410" stroke="#26303d" stroke-width="1.2"/><path d="M24 46Q48 36 72 46" fill="#fff2b8" opacity=".85"/>` : '';
  // Open: the lid swung back on its hinge (drawn foreshortened above the box).
  const lid = open
    ? `<g class="kg-chest-lid" transform="translate(0 -9) translate(48 46) scale(1 .62) translate(-48 -46) rotate(-6 48 46)">${lidShape}</g>`
    : `<g class="kg-chest-lid" style="transform-origin:48px 30px;transform-box:view-box">${lidShape}</g>`;
  const title = opts.label ? `<title>${opts.label.replace(/[<&]/g, '')}</title>` : '';
  return `<svg viewBox="0 0 96 96" ${opts.label ? 'role="img"' : 'aria-hidden="true"'} focusable="false">${title}<defs>${defs}</defs>${shadow}${open ? glow + body + inside + lid : body + lid}</svg>`;
}

/** True when the player asked for less motion. */
function reducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function anim(el: Element, frames: Keyframe[], opts: KeyframeAnimationOptions): Promise<void> {
  if (typeof (el as HTMLElement).animate !== 'function') return Promise.resolve();
  return new Promise((done) => {
    const a = (el as HTMLElement).animate(frames, { fill: 'forwards', ...opts });
    a.onfinish = () => done();
    a.oncancel = () => done();
  });
}

/**
 * Play the chest reveal inside `host` (its content is replaced) and resolve when the reward is
 * showing. Sequence, about 1.1 s: the closed chest drops in, the lid swings open with a burst of
 * light, then `reward` (the real grants, built by the caller) rises out and settles. The same for
 * every outcome. With reduced motion (or `opts.instant`) the open chest and the reward appear at once.
 * `onOpen` fires as the lid opens (play a sound or a haptic there).
 */
export async function revealChest(host: HTMLElement, reward: HTMLElement | string, opts: { instant?: boolean; onOpen?: () => void } = {}): Promise<void> {
  const doc = host.ownerDocument;
  const stage = doc.createElement('div');
  stage.className = 'kg-chest-stage';
  stage.style.cssText = 'position:relative;display:flex;flex-direction:column;align-items:center;gap:8px;';
  const box = doc.createElement('div');
  box.className = 'kg-chest';
  box.style.cssText = 'width:112px;height:112px;';
  const prize = typeof reward === 'string' ? Object.assign(doc.createElement('div'), { textContent: reward }) : reward;
  prize.classList.add('kg-chest-reward');
  host.replaceChildren(stage);
  stage.append(box, prize);
  if (opts.instant || reducedMotion()) {
    box.innerHTML = chestSvg('open');
    opts.onOpen?.();
    return;
  }
  prize.style.opacity = '0';
  box.innerHTML = chestSvg('closed');
  await anim(box, [{ transform: 'translateY(-18px) scale(.9)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,1.4,.5,1)' });
  const lid = box.querySelector('.kg-chest-lid');
  if (lid) await anim(lid, [{ transform: 'rotate(0deg)' }, { transform: 'translateY(-6px) rotate(-14deg)' }], { duration: 180, easing: 'ease-in' });
  box.innerHTML = chestSvg('open');
  opts.onOpen?.();
  const glow = box.querySelector('.kg-chest-glow');
  if (glow) void anim(glow, [{ opacity: 0 }, { opacity: 1, offset: 0.3 }, { opacity: 0.6 }], { duration: 700 });
  await anim(prize, [{ transform: 'translateY(18px) scale(.6)', opacity: 0 }, { transform: 'translateY(-4px) scale(1.06)', opacity: 1, offset: 0.7 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: 420, easing: 'ease-out' });
  prize.style.opacity = '1';
}
