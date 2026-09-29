import { findObject } from '../core/document';
import type { EditorStore } from '../core/store';
import { displayName } from '../core/structure';
import { scaleOf, worldToScreen } from '../core/viewport';
import { aabbOf, cornersOf, footprintToWorld } from '../geometry/transform';
import { type Vec2, DEG, boundsOf } from '../geometry/vec';
import { drawSymbol } from './drawSymbol';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

/** Design: the ghost is drawn at 55 %; the "+" badge sits below-right of the cursor tip. */
const GHOST_ALPHA = 0.55;
const BADGE = { dx: 20, dy: 24, r: 8 };

function segment(g: G, a: Vec2, b: Vec2): void {
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
}

/**
 * Furniture tool feedback (design 05): the snapped drop target in green
 * with corner dots, alignment and walkway guides in the tool colour, the
 * translucent ghost under the pointer with its label, and the "+" badge.
 */
export function drawGhostOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  if (store.tools.active !== 'furniture') return;
  const ghost = store.tools.furniture.ghost;
  if (!ghost) return;
  const v = store.viewport;
  const s = scaleOf(v);
  const { item, at, pointer } = ghost;
  const t = at.transform;
  const nameOf = (id: string) => {
    const o = findObject(store.doc, id);
    return o ? displayName(o) : id;
  };

  // Drop target.
  const outline = footprintToWorld(t, item.footprint).map((p) => worldToScreen(v, p));
  g.beginPath();
  outline.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
  g.closePath();
  g.globalAlpha = 0.1;
  g.fillStyle = theme.success;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.success;
  g.lineWidth = 1.5;
  g.stroke();
  for (const c of cornersOf(t)) {
    const p = worldToScreen(v, c);
    g.beginPath();
    g.arc(p.x, p.y, 4, 0, Math.PI * 2);
    g.fill();
  }

  // Guides: what it lined up with, and a walkway that's too tight.
  g.strokeStyle = theme.tool;
  g.lineWidth = 1;
  if (at.aligned) {
    const a = worldToScreen(v, at.aligned.from);
    segment(g, a, worldToScreen(v, at.aligned.to));
    const other = findObject(store.doc, at.aligned.id);
    const right = other?.kind === 'furniture' ? worldToScreen(v, { x: aabbOf(other.transform).maxX, y: 0 }).x : a.x;
    pill(g, `${at.aligned.kind} · ${nameOf(at.aligned.id)}`, right + 8, a.y - 14, theme.tool, theme);
  }
  if (at.gap) {
    // Measured beside the drop, clear of the ghost's label (design: tick 4 px off the right edge).
    const a = worldToScreen(v, at.gap.from);
    const b = worldToScreen(v, at.gap.to);
    const drop = boundsOf(outline);
    const text = `${at.gap.dist.toFixed(2)} m`;
    if (Math.abs(b.y - a.y) >= Math.abs(b.x - a.x)) {
      const x = drop.maxX + 4;
      segment(g, { x, y: a.y }, { x, y: b.y });
      pill(g, text, x + 6, (a.y + b.y) / 2 - 9.5, theme.tool, theme);
    } else {
      const y = drop.minY - 4;
      segment(g, { x: a.x, y }, { x: b.x, y });
      pill(g, text, (a.x + b.x) / 2, y - 12, theme.tool, theme, true);
    }
  }

  // The ghost follows the pointer unsnapped, turned like the drop.
  const sp = worldToScreen(v, pointer);
  const w = t.w * s;
  const h = t.h * s;
  g.save();
  g.translate(sp.x, sp.y);
  g.rotate(t.rotation * DEG);
  g.globalAlpha = GHOST_ALPHA;
  drawSymbol(g, item.parts, { ...item.appearance, fill: store.tools.furniture.fillOf(item) }, w, h, s / 50);
  g.globalAlpha = 1;
  g.strokeStyle = theme.accent;
  g.lineWidth = 1;
  g.beginPath();
  g.roundRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4, 3);
  g.stroke();
  g.restore();

  const box = boundsOf(footprintToWorld({ ...t, x: pointer.x, y: pointer.y }, item.footprint));
  const drop = boundsOf(footprintToWorld(t, item.footprint));
  const bl = worldToScreen(v, { x: box.minX, y: box.maxY });
  pill(
    g,
    `${item.title}  ·  X ${drop.minX.toFixed(2)}  Y ${drop.minY.toFixed(2)} m`,
    bl.x,
    bl.y + 19,
    theme.ink,
    theme,
  );

  // "+" copy badge.
  const bx = sp.x + BADGE.dx;
  const by = sp.y + BADGE.dy;
  g.beginPath();
  g.arc(bx, by, BADGE.r, 0, Math.PI * 2);
  g.fillStyle = theme.accent;
  g.fill();
  g.strokeStyle = theme.surface;
  g.lineWidth = 1.5;
  g.stroke();
  g.lineWidth = 2;
  segment(g, { x: bx - 4, y: by }, { x: bx + 4, y: by });
  segment(g, { x: bx, y: by - 4 }, { x: bx, y: by + 4 });
}
