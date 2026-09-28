import type { CanvasTheme } from './theme';

/** Label chip: 10 px mono, 6/3 px padding, 3 px radius (design Button/* chips). */
export function pill(
  g: CanvasRenderingContext2D, text: string, x: number, y: number, bg: string, theme: CanvasTheme, centered = false,
): void {
  g.font = `500 10px ${theme.fontMono}`;
  const w = Math.ceil(g.measureText(text).width) + 12;
  const h = 19;
  const left = centered ? x - w / 2 : x;
  const top = centered ? y - h / 2 : y;
  g.beginPath();
  g.roundRect(left, top, w, h, 3);
  g.fillStyle = bg;
  g.fill();
  g.fillStyle = theme.surface;
  g.textBaseline = 'middle';
  g.fillText(text, left + 6, top + h / 2 + 0.5);
}
