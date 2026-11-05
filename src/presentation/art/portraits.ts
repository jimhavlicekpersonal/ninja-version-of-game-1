/**
 * Sensei Hoshi, the clan elder who guides the tutorial (art re-audit item 8): a code-drawn bust,
 * as an SVG string, with a few expressions. Original character: an old ninja master with a white
 * topknot, long white brows and beard, an indigo haori over a white kimono collar, and the clan
 * crest (three kunai in a ring) on the haori's chest. Owned by the ART compartment.
 *
 * GUI wiring (ui/tutorial.ts, `.tut-face`): `senseiPortrait(expressionForStep)` in place of the
 * Keep icon. viewBox 0 0 64 64; it fills its box, so size it with CSS. Ids are unique per copy.
 */
import { crestSvg } from './chest';

export type SenseiExpression = 'calm' | 'smile' | 'stern' | 'surprised';
export const SENSEI_EXPRESSIONS: SenseiExpression[] = ['calm', 'smile', 'stern', 'surprised'];

let uid = 0;

export function senseiPortrait(expression: SenseiExpression = 'calm', opts: { label?: string } = {}): string {
  const id = `kgs${++uid}`;
  const INK = '#26303d';
  const SKIN = '#f1c9a0';
  const HAIR = '#f4f1ea';
  const defs =
    `<radialGradient id="${id}bg" cx=".4" cy=".35" r=".8"><stop offset="0" stop-color="#fbe9c4"/><stop offset="1" stop-color="#e3b871"/></radialGradient>` +
    `<linearGradient id="${id}h" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4f78a8"/><stop offset="1" stop-color="#22385a"/></linearGradient>` +
    `<radialGradient id="${id}f" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#fbe0c2"/><stop offset="1" stop-color="#dba57a"/></radialGradient>` +
    `<clipPath id="${id}c"><circle cx="32" cy="32" r="31"/></clipPath>`;
  // Background disc (a warm dusk sun), then the haori shoulders with the crest.
  const back = `<circle cx="32" cy="32" r="31" fill="url(#${id}bg)"/>`;
  const body =
    `<path d="M4 64Q6 46 22 43L32 50L42 43Q58 46 60 64Z" fill="url(#${id}h)" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<path d="M22 43L32 58L42 43L38 42L32 50L26 42Z" fill="#fbf7ee" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M27 52Q32 54 37 52" stroke="#c8402f" stroke-width="1.6" fill="none"/>` +
    `<circle cx="16" cy="54" r="5.2" fill="#fbf7ee" stroke="${INK}" stroke-width="1"/>` +
    crestSvg(16, 54, 4, '#22385a') +
    `<path d="M48 48Q52 52 53 60" stroke="#6f95c2" stroke-width="1.2" fill="none" opacity=".6"/>`;
  // Head: ears, face, white hair at the sides and a tied topknot.
  const head =
    `<ellipse cx="18.5" cy="30" rx="2.6" ry="3.6" fill="${SKIN}" stroke="${INK}" stroke-width="1.2"/>` +
    `<ellipse cx="45.5" cy="30" rx="2.6" ry="3.6" fill="${SKIN}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M20 28Q20 14 32 14Q44 14 44 28V34Q44 44 32 45Q20 44 20 34Z" fill="url(#${id}f)" stroke="${INK}" stroke-width="1.6"/>` +
    `<path d="M20 30Q18 20 24 15Q20 24 22 31Z" fill="${HAIR}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M44 30Q46 20 40 15Q44 24 42 31Z" fill="${HAIR}" stroke="${INK}" stroke-width="1"/>` +
    `<path d="M24 16Q32 11 40 16Q36 14 32 14Q28 14 24 16Z" fill="${HAIR}" stroke="${INK}" stroke-width="1"/>` +
    `<ellipse cx="32" cy="9.5" rx="4.6" ry="3.4" fill="${HAIR}" stroke="${INK}" stroke-width="1.2"/>` +
    `<path d="M29 12.5H35" stroke="#c8402f" stroke-width="1.8" stroke-linecap="round"/>` +
    `<path d="M26 22Q28 23 30 22M34 22Q36 23 38 22" stroke="#c9906a" stroke-width=".8" fill="none" opacity=".7"/>`;
  // Expression: brows, eyes and mouth. The beard and moustache stay the same.
  const brows: Record<SenseiExpression, string> = {
    calm: 'M22.5 26Q26 24.4 29.5 26.2M34.5 26.2Q38 24.4 41.5 26',
    smile: 'M22.5 25.4Q26 23.6 29.5 25.2M34.5 25.2Q38 23.6 41.5 25.4',
    stern: 'M22.5 24.6Q26 25.4 29.8 27.4M34.2 27.4Q38 25.4 41.5 24.6',
    surprised: 'M22.8 23.4Q26 21.4 29.4 23.2M34.6 23.2Q38 21.4 41.2 23.4',
  };
  const eyes: Record<SenseiExpression, string> = {
    calm: `<path d="M24.5 29.6Q26.5 31 28.5 29.6M35.5 29.6Q37.5 31 39.5 29.6" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
    smile: `<path d="M24.5 30.4Q26.5 28.6 28.5 30.4M35.5 30.4Q37.5 28.6 39.5 30.4" stroke="${INK}" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
    stern: `<path d="M24.6 29.8H28.6M35.4 29.8H39.4" stroke="${INK}" stroke-width="1.6" stroke-linecap="round"/><circle cx="27" cy="30.4" r=".9" fill="${INK}"/><circle cx="37" cy="30.4" r=".9" fill="${INK}"/>`,
    surprised: `<circle cx="26.5" cy="29.8" r="1.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="37.5" cy="29.8" r="1.6" fill="#fff" stroke="${INK}" stroke-width="1"/><circle cx="26.6" cy="30" r=".8" fill="${INK}"/><circle cx="37.6" cy="30" r=".8" fill="${INK}"/>`,
  };
  const mouth: Record<SenseiExpression, string> = {
    calm: 'M29.5 39.4Q32 40.4 34.5 39.4',
    smile: 'M28.8 38.8Q32 41.6 35.2 38.8',
    stern: 'M29.5 40H34.5',
    surprised: 'M31 39.2Q32 38.2 33 39.2Q33.4 41.2 32 41.4Q30.6 41.2 31 39.2Z',
  };
  const beard =
    `<path d="M24 37Q26 40 29.5 39.6Q32 42 34.5 39.6Q38 40 40 37Q41 46 36 52Q33 55 32 58Q31 55 28 52Q23 46 24 37Z" fill="${HAIR}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
    `<path d="M32 36.4Q28 35.6 25 38.6Q28 37.6 31.4 38.4ZM32 36.4Q36 35.6 39 38.6Q36 37.6 32.6 38.4Z" fill="${HAIR}" stroke="${INK}" stroke-width=".9"/>` +
    `<path d="M30 44Q31 49 32 52M34 44Q33 49 32 52" stroke="#cfcac0" stroke-width=".8" fill="none"/>` +
    `<path d="M31 33.2Q32 35.6 33.2 33.6" stroke="#b97a54" stroke-width="1.1" fill="none" stroke-linecap="round"/>`;
  const face =
    `<path d="${brows[expression]}" stroke="${HAIR}" stroke-width="2.6" stroke-linecap="round" fill="none"/>` +
    `<path d="${brows[expression]}" stroke="${INK}" stroke-width=".6" stroke-linecap="round" fill="none" opacity=".5"/>` +
    eyes[expression] +
    beard +
    `<path d="${mouth[expression]}" stroke="${INK}" stroke-width="1.2" stroke-linecap="round" fill="${expression === 'surprised' ? '#7a3a2a' : 'none'}"/>` +
    (expression === 'smile' ? '<ellipse cx="23.6" cy="34" rx="2.2" ry="1.3" fill="#e88a7a" opacity=".45"/><ellipse cx="40.4" cy="34" rx="2.2" ry="1.3" fill="#e88a7a" opacity=".45"/>' : '');
  const ring = `<circle cx="32" cy="32" r="31" fill="none" stroke="${INK}" stroke-width="1.6"/>`;
  const title = opts.label ? `<title>${opts.label.replace(/[<&]/g, '')}</title>` : '';
  return `<svg viewBox="0 0 64 64" ${opts.label ? 'role="img"' : 'aria-hidden="true"'} focusable="false">${title}<defs>${defs}</defs>${back}<g clip-path="url(#${id}c)">${body}${head}${face}</g>${ring}</svg>`;
}
