import type { DirtyRegion } from '../core/perf';
import { pill } from './pill';
import { RULER_PX } from './rulers';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

/** The broadphase looks this far past the canvas edge, so pieces don't pop in while panning. */
export const CULL_MARGIN_PX = 64;

const DASH = [4, 3];
const NO_DASH: number[] = [];

/**
 * Perf HUD marks on the overlay canvas (design 11): the regions the last
 * partial repaint touched ("dirty #1 · moved dining chair"), and the
 * viewport cull bounds just inside the canvas edge.
 */
export function drawPerfOverlay(
  g: G,
  theme: CanvasTheme,
  w: number,
  h: number,
  dirty: readonly DirtyRegion[] | null,
  culling: boolean,
): void {
  if (dirty) {
    dirty.forEach((r, i) => {
      g.globalAlpha = 0.07;
      g.fillStyle = theme.tool;
      g.fillRect(r.x, r.y, r.w, r.h);
      g.globalAlpha = 1;
      g.strokeStyle = theme.tool;
      g.lineWidth = 1.5;
      g.setLineDash(DASH);
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.setLineDash(NO_DASH);
      pill(g, `dirty #${i + 1} · ${r.label}`, r.x, r.y - 19, theme.tool, theme);
    });
  }
  if (culling) {
    const x = RULER_PX + 4;
    const y = RULER_PX + 4;
    g.globalAlpha = 0.7;
    g.strokeStyle = theme.accent;
    g.lineWidth = 1;
    g.setLineDash(DASH);
    g.strokeRect(x + 0.5, y + 0.5, w - x - 4, h - y - 4);
    g.setLineDash(NO_DASH);
    g.globalAlpha = 1;
    const text = `viewport cull bounds · +${CULL_MARGIN_PX} px`;
    g.font = `500 10px ${theme.fontMono}`;
    const tw = Math.ceil(g.measureText(text).width) + 12;
    pill(g, text, w - 28 - tw, h - 30, theme.accent, theme);
  }
}
