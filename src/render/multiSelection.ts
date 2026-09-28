import type { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import { HANDLES, cornersOf, handlePosition } from '../geometry/transform';
import type { Rect, Vec2 } from '../geometry/vec';
import { rectAsTransform, rotateKnobPosition } from '../tools/TransformTool';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

const UNIT_MARK = 5;
const HANDLE = 8;
const KNOB_R = 5;
/** Label chip sits this far above the padded box (design: 300 → 248). */
const LABEL_ABOVE_PX = 52;

function screenRect(store: EditorStore, r: Rect) {
  const a = worldToScreen(store.viewport, { x: r.minX, y: r.minY });
  const b = worldToScreen(store.viewport, { x: r.maxX, y: r.maxY });
  return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y };
}

function outline(g: CanvasRenderingContext2D, pts: Vec2[], theme: CanvasTheme): void {
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.5;
  g.stroke();
  g.fillStyle = theme.accent;
  for (const p of pts) g.fillRect(p.x - UNIT_MARK / 2, p.y - UNIT_MARK / 2, UNIT_MARK, UNIT_MARK);
}

/**
 * Multi-selection chrome (design 07): every unit outlined with corner marks,
 * one padded box with handles + rotate knob around them all, and a
 * "N selected · W × H m" chip above.
 */
export function drawMultiSelection(g: CanvasRenderingContext2D, store: EditorStore, box: Rect, padded: Rect, theme: CanvasTheme): void {
  const v = store.viewport;
  const units = store.units;
  for (const u of units) {
    const only = u.members.length === 1 ? u.members[0]! : null;
    const pts = only
      ? cornersOf({ ...only.transform, flipX: false })
      : [{ x: u.bounds.minX, y: u.bounds.minY }, { x: u.bounds.maxX, y: u.bounds.minY }, { x: u.bounds.maxX, y: u.bounds.maxY }, { x: u.bounds.minX, y: u.bounds.maxY }];
    outline(g, pts.map((p) => worldToScreen(v, p)), theme);
  }

  const r = screenRect(store, padded);
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.25;
  g.strokeRect(r.x, r.y, r.w, r.h);

  const t = rectAsTransform(padded);
  const top = worldToScreen(v, handlePosition(t, 'n'));
  const knob = worldToScreen(v, rotateKnobPosition(store, t));
  g.beginPath();
  g.moveTo(top.x, top.y - HANDLE / 2);
  g.lineTo(knob.x, knob.y + KNOB_R);
  g.lineWidth = 1;
  g.stroke();

  g.lineWidth = 1.25;
  g.fillStyle = theme.surface;
  for (const h of HANDLES) {
    const p = worldToScreen(v, handlePosition(t, h));
    g.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
    g.strokeRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
  }
  g.beginPath();
  g.arc(knob.x, knob.y, KNOB_R, 0, Math.PI * 2);
  g.fill();
  g.stroke();

  const count = units.length === 1 ? `${units[0]!.name}` : `${units.length} selected`;
  const size = `${(box.maxX - box.minX).toFixed(2)} × ${(box.maxY - box.minY).toFixed(2)} m`;
  pill(g, `${count} · ${size}`, r.x + r.w / 2, r.y - LABEL_ABOVE_PX + 19 / 2, theme.accent, theme, true);
}

/** Live marquee: dashed accent outline over a faint accent wash. */
export function drawMarquee(g: CanvasRenderingContext2D, store: EditorStore, rect: Rect, theme: CanvasTheme): void {
  const r = screenRect(store, rect);
  g.fillStyle = theme.accent;
  g.globalAlpha = 0.06;
  g.fillRect(r.x, r.y, r.w, r.h);
  g.globalAlpha = 0.9;
  g.setLineDash([5, 3]);
  g.strokeStyle = theme.accent;
  g.lineWidth = 1;
  g.strokeRect(Math.round(r.x) + 0.5, Math.round(r.y) + 0.5, Math.round(r.w), Math.round(r.h));
  g.setLineDash([]);
  g.globalAlpha = 1;
}
