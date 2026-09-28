import { type Viewport, scaleOf } from '../core/viewport';
import type { CanvasTheme } from './theme';

export const RULER_PX = 20;

/** Picks a major tick step (metres) that keeps labels at least ~80 px apart. */
export function rulerStep(scale: number): number {
  for (const m of [0.5, 1, 2, 5, 10, 20, 50, 100]) if (m * scale >= 80) return m;
  return 200;
}

/** Top and left rulers in metres (design: ticks every 0.2 m, labels every 2 m at 100%). */
export function drawRulers(g: CanvasRenderingContext2D, v: Viewport, w: number, h: number, theme: CanvasTheme): void {
  const s = scaleOf(v);
  const major = rulerStep(s);
  const minor = major / 10;
  const mid = major / 2;

  g.fillStyle = theme.surfaceSunken;
  g.fillRect(0, 0, w, RULER_PX);
  g.fillRect(0, 0, RULER_PX, h);
  g.fillStyle = theme.border;
  g.fillRect(0, RULER_PX - 1, w, 1);
  g.fillRect(RULER_PX - 1, 0, 1, h);
  g.fillStyle = theme.surface;
  g.fillRect(0, 0, RULER_PX, RULER_PX);

  g.beginPath();
  g.font = `8px ${theme.fontMono}`;
  g.fillStyle = theme.inkMuted;
  g.textBaseline = 'top';
  const tickLen = (m: number) => (isMultiple(m, major) ? 9 : isMultiple(m, mid) ? 6 : 3);

  for (let m = Math.floor(-v.panX / s / minor) * minor; m * s + v.panX < w; m += minor) {
    const x = Math.round(m * s + v.panX) + 0.5;
    if (x < RULER_PX) continue;
    const len = tickLen(m);
    g.moveTo(x, RULER_PX - 1 - len);
    g.lineTo(x, RULER_PX - 1);
    if (len === 9) g.fillText(label(m), x + 3.5, 2);
  }
  for (let m = Math.floor(-v.panY / s / minor) * minor; m * s + v.panY < h; m += minor) {
    const y = Math.round(m * s + v.panY) + 0.5;
    if (y < RULER_PX) continue;
    const len = tickLen(m);
    g.moveTo(RULER_PX - 1 - len, y);
    g.lineTo(RULER_PX - 1, y);
    if (len === 9) g.fillText(label(m), 2, y + 2);
  }
  g.strokeStyle = theme.inkFaint;
  g.lineWidth = 1;
  g.stroke();
}

function isMultiple(v: number, step: number): boolean {
  const r = Math.abs(v / step - Math.round(v / step));
  return r < 1e-6;
}

function label(m: number): string {
  const r = Math.round(m * 100) / 100;
  return String(Object.is(r, -0) ? 0 : r);
}
