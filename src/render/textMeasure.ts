import type { FontSpec, Measure } from '../core/annotationLayout';
import type { CanvasTheme } from './theme';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const fontOf = (f: FontSpec, sans: string, mono: string): string =>
  `${f.weight} ${f.px}px ${f.mono ? mono : sans}`;

/** Measures with a canvas already set up for drawing (renderer, overlay). */
export function canvasMeasure(g: Ctx2D, theme: CanvasTheme): Measure {
  return (text, f) => {
    g.font = fontOf(f, theme.fontSans, theme.fontMono);
    return g.measureText(text).width;
  };
}

let scratch: Ctx2D | null | undefined;
let fonts: { sans: string; mono: string } | null = null;

/**
 * Measures off-screen, for picking and the inline editor. Without a canvas
 * (unit tests in Node) it estimates, which is all a hit box needs.
 */
export const measureText: Measure = (text, f) => {
  if (scratch === undefined)
    scratch = typeof OffscreenCanvas === 'undefined' ? null : new OffscreenCanvas(1, 1).getContext('2d');
  if (!scratch) return text.length * f.px * 0.56;
  if (!fonts) {
    const cs = getComputedStyle(document.documentElement);
    fonts = { sans: cs.getPropertyValue('--pw-font-sans').trim(), mono: cs.getPropertyValue('--pw-font-mono').trim() };
  }
  scratch.font = fontOf(f, fonts.sans, fonts.mono);
  return scratch.measureText(text).width;
};
