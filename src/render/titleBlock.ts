import type { SheetInfo } from '../core/document';
import type { CanvasTheme } from './theme';

const W = 310;
const H = 130;
/** Rows: title band 34 px, then two 48 px rows split at 160 px (design 10 title block). */
const ROW1 = 34;
const ROW2 = 82;
const SPLIT = 160;

function cell(
  g: CanvasRenderingContext2D,
  theme: CanvasTheme,
  x: number,
  y: number,
  label: string,
  value: string,
  mono: boolean,
): void {
  g.fillStyle = theme.inkMuted;
  g.font = `500 8px ${theme.fontMono}`;
  g.fillText(label.toUpperCase(), x, y);
  g.fillStyle = theme.ink;
  g.font = mono ? `400 11px ${theme.fontMono}` : `500 11px ${theme.fontSans}`;
  g.fillText(value, x, y + 14);
}

/** Sheet title block in the canvas's bottom-right corner (design 10), in screen space like the north arrow. */
export function drawTitleBlock(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  theme: CanvasTheme,
  title: string,
  s: SheetInfo,
): void {
  const x = Math.round(w - 16 - W) + 0.5;
  const y = Math.round(h - 20 - H) + 0.5;
  g.fillStyle = theme.surface;
  g.fillRect(x, y, W, H);
  g.strokeStyle = theme.ink;
  g.lineWidth = 1;
  g.strokeRect(x, y, W, H);
  g.beginPath();
  g.moveTo(x, y + ROW1);
  g.lineTo(x + W, y + ROW1);
  g.moveTo(x, y + ROW2);
  g.lineTo(x + W, y + ROW2);
  g.moveTo(x + SPLIT, y + ROW1);
  g.lineTo(x + SPLIT, y + H);
  g.stroke();
  g.textBaseline = 'top';
  g.fillStyle = theme.ink;
  g.font = `700 12px ${theme.fontSans}`;
  g.fillText(title, x + 10, y + 9);
  cell(g, theme, x + 10, y + ROW1 + 6, 'Project', s.project, false);
  cell(g, theme, x + SPLIT + 10, y + ROW1 + 6, 'Scale', s.scale, true);
  cell(g, theme, x + 10, y + ROW2 + 6, 'Drawn', s.drawn, false);
  cell(g, theme, x + SPLIT + 10, y + ROW2 + 6, 'Rev · date', `${s.rev} · ${s.date}`, true);
}
