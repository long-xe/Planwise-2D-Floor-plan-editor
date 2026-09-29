import { formatLength } from '../core/annotations';
import type { MeasurePoint } from '../core/measureSnap';
import type { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

/** Screen angle of a → b, 0–180° (a measurement has no direction). */
export function measureAngle(a: Vec2, b: Vec2): number {
  const deg = (Math.atan2(Math.abs(b.y - a.y), b.x - a.x) * 180) / Math.PI;
  return Math.round(deg * 10) / 10;
}

function endpoint(g: G, p: Vec2, theme: CanvasTheme): void {
  g.beginPath();
  g.arc(p.x, p.y, 6, 0, Math.PI * 2);
  g.fillStyle = theme.surface;
  g.fill();
  g.strokeStyle = theme.tool;
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  g.arc(p.x, p.y, 2, 0, Math.PI * 2);
  g.fillStyle = theme.tool;
  g.fill();
}

/** Where the pointer would land: a 24 px target square with a dot (design 10). */
function target(g: G, p: Vec2, theme: CanvasTheme): void {
  g.strokeStyle = theme.ink;
  g.lineWidth = 1.25;
  g.strokeRect(p.x - 12, p.y - 12, 24, 24);
  g.beginPath();
  g.arc(p.x, p.y, 2, 0, Math.PI * 2);
  g.fillStyle = theme.ink;
  g.fill();
}

/** Snap chip right of an end: level with it for the upper end, just below it for the lower (design 10). */
function snapPill(g: G, m: MeasurePoint, at: Vec2, theme: CanvasTheme, below = true): void {
  if (m.label) pill(g, `snap · ${m.label}`, at.x + 12, below ? at.y + 4 : at.y - 9.5, theme.success, theme);
}

/**
 * Live Measure tool feedback (design 10): the measured line with its ends,
 * each end's snap ("snap · TV unit · front"), the readout (distance, Δx,
 * Δy, angle) beside the line, and the target under the pointer.
 */
export function drawMeasureOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  if (store.tools.active !== 'measure') return;
  const m = store.tools.measure;
  const { a, b, hover, fixed } = m.draft;
  const v = store.viewport;
  if (a && b) {
    const pa = worldToScreen(v, a.point);
    const pb = worldToScreen(v, b.point);
    g.strokeStyle = theme.tool;
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(pa.x, pa.y);
    g.lineTo(pb.x, pb.y);
    g.stroke();
    endpoint(g, pa, theme);
    endpoint(g, pb, theme);
    if (!fixed) target(g, pb, theme);
    snapPill(g, a, pa, theme, pa.y > pb.y);
    snapPill(g, b, pb, theme, pb.y >= pa.y);
    const f = m.style.format;
    const dx = Math.abs(b.point.x - a.point.x);
    const dy = Math.abs(b.point.y - a.point.y);
    const len = Math.hypot(dx, dy);
    const main = formatLength(len, f);
    const sub = `Δx ${formatLength(dx, f, false)} · Δy ${formatLength(dy, f, false)} · ${measureAngle(a.point, b.point)}°`;
    // Readout box: 136 × 40 in the design, right of the line just under the upper end's snap pill.
    const top = pa.y <= pb.y ? pa : pb;
    const mid = { x: Math.max(pa.x, pb.x) + 12, y: top.y + 16 };
    g.font = `600 15px ${theme.fontMono}`;
    const wMain = g.measureText(main).width;
    g.font = `400 8.5px ${theme.fontMono}`;
    const w = Math.ceil(Math.max(wMain, g.measureText(sub).width)) + 20;
    g.beginPath();
    g.roundRect(mid.x, mid.y, w, 40, 3);
    g.fillStyle = theme.tool;
    g.fill();
    g.fillStyle = theme.surface;
    g.textBaseline = 'top';
    g.font = `600 15px ${theme.fontMono}`;
    g.fillText(main, mid.x + 10, mid.y + 5);
    g.font = `400 8.5px ${theme.fontMono}`;
    g.fillText(sub, mid.x + 10, mid.y + 25);
    return;
  }
  if (a) endpoint(g, worldToScreen(v, a.point), theme);
  if (hover) {
    const p = worldToScreen(v, hover.point);
    target(g, p, theme);
    snapPill(g, hover, p, theme);
  }
}
