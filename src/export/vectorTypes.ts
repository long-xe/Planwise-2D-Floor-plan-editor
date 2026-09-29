/** Vector ops the recorder produces and the PDF / SVG writers consume (design 12). */

export type Seg =
  | { t: 'M'; x: number; y: number }
  | { t: 'L'; x: number; y: number }
  | { t: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { t: 'Z' };

export interface Paint {
  color: string;
  alpha: number;
}

export interface Stroke extends Paint {
  width: number;
  dash: number[];
  join: CanvasLineJoin;
  cap: CanvasLineCap;
}

export type VectorOp =
  | { t: 'path'; d: Seg[]; fill?: Paint; stroke?: Stroke }
  | {
      t: 'text';
      text: string;
      x: number;
      y: number;
      /** Radians, clockwise on screen (canvas y-down). */
      angle: number;
      size: number;
      weight: number;
      mono: boolean;
      align: 'left' | 'center' | 'right';
      paint: Paint;
    }
  | { t: 'clip'; d: Seg[] }
  | { t: 'save' }
  | { t: 'restore' };

/** Parses "#RRGGBB", "#RGB" and "rgb(a)(…)" into a hex colour and an alpha. */
export function parseColor(s: string): Paint {
  const c = s.trim();
  if (c.startsWith('#')) {
    const h =
      c.length === 4
        ? c
            .slice(1)
            .split('')
            .map((x) => x + x)
            .join('')
        : c.slice(1, 7);
    return { color: `#${h.toUpperCase()}`, alpha: 1 };
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const [r, g, b, a] = m[1]!.split(',').map((x) => parseFloat(x));
    const hex = [r, g, b]
      .map((v) =>
        Math.round(v ?? 0)
          .toString(16)
          .padStart(2, '0'),
      )
      .join('');
    return { color: `#${hex.toUpperCase()}`, alpha: a ?? 1 };
  }
  return { color: '#000000', alpha: 1 };
}

/** "600 11px IBM Plex Sans" → weight, size, mono. */
export function parseFont(font: string): { size: number; weight: number; mono: boolean } {
  const size = parseFloat(font.match(/([\d.]+)px/)?.[1] ?? '10');
  const w = font.match(/^\s*(\d{3}|bold)\b/)?.[1];
  return { size, weight: w === 'bold' ? 700 : w ? Number(w) : 400, mono: /mono/i.test(font) };
}

// Cubic control distance for a quarter circle.
export const KAPPA = 0.5522847498;
