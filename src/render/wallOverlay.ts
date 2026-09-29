import type { Wall } from '../core/document';
import type { EditorStore } from '../core/store';
import { allowedAngles } from '../core/wallSnap';
import { scaleOf, worldToScreen } from '../core/viewport';
import { type Vec2, boundsOf } from '../geometry/vec';
import { buildWallGraph, wallPolygon } from '../geometry/walls';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

const NODE = 8;
const PROTRACTOR_R = 44;
/** Dimension chains sit this far outside the plan (design: 34 px). */
const CHAIN_OFFSET = 34;
/** Walls at least this thick are exterior: the dimension chains measure them. */
const EXTERIOR_MIN_M = 0.2;
const SNAP_LABEL = { grid: 'grid point', endpoint: 'endpoint', wall: 'on wall', free: 'free' } as const;

const deg = (a: number) => (a * Math.PI) / 180;
/** Screen direction of an on-screen angle (counter-clockwise, y down). */
const dir = (a: number) => ({ x: Math.cos(deg(a)), y: -Math.sin(deg(a)) });

function line(g: G, a: Vec2, b: Vec2): void {
  g.beginPath();
  g.moveTo(a.x, a.y);
  g.lineTo(b.x, b.y);
  g.stroke();
}

function tick(g: G, p: Vec2, vertical: boolean): void {
  g.lineWidth = 0.75;
  line(
    g,
    vertical ? { x: p.x, y: p.y - 6 } : { x: p.x - 6, y: p.y },
    vertical ? { x: p.x, y: p.y + 6 } : { x: p.x + 6, y: p.y },
  );
  g.lineWidth = 1.5;
  line(g, { x: p.x - 3, y: p.y + 3 }, { x: p.x + 3, y: p.y - 3 });
}

/** Overall "12.00 m" / "8.40 m" chains above and left of the plan (design 04). */
function drawChains(g: G, store: EditorStore, walls: Wall[], theme: CanvasTheme): void {
  const box = boundsOf(walls.flatMap((w) => wallPolygon(w, null, false)));
  const v = store.viewport;
  const tl = worldToScreen(v, { x: box.minX, y: box.minY });
  const br = worldToScreen(v, { x: box.maxX, y: box.maxY });
  g.strokeStyle = theme.accent;
  g.fillStyle = theme.accent;
  g.font = `500 10px ${theme.fontMono}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const label = (text: string, x: number, y: number, rotate: boolean) => {
    const w = g.measureText(text).width + 8;
    g.save();
    g.translate(x, y);
    if (rotate) g.rotate(-Math.PI / 2);
    g.fillStyle = theme.canvas;
    g.fillRect(-w / 2, -7, w, 14);
    g.fillStyle = theme.accent;
    g.fillText(text, 0, 0.5);
    g.restore();
  };
  const y = tl.y - CHAIN_OFFSET;
  g.lineWidth = 1;
  line(g, { x: tl.x, y }, { x: br.x, y });
  tick(g, { x: tl.x, y }, true);
  tick(g, { x: br.x, y }, true);
  label(`${(box.maxX - box.minX).toFixed(2)} m`, (tl.x + br.x) / 2, y, false);
  const x = tl.x - CHAIN_OFFSET;
  g.lineWidth = 1;
  line(g, { x, y: tl.y }, { x, y: br.y });
  tick(g, { x, y: tl.y }, false);
  tick(g, { x, y: br.y }, false);
  label(`${(box.maxY - box.minY).toFixed(2)} m`, x, (tl.y + br.y) / 2, true);
  g.textAlign = 'left';
}

/** Interior wall lengths beside each wall ("7.84 m"). */
function drawLengths(g: G, store: EditorStore, walls: Wall[], theme: CanvasTheme): void {
  const v = store.viewport;
  const s = scaleOf(v);
  g.font = `500 9px ${theme.fontMono}`;
  g.fillStyle = theme.accent;
  for (const w of walls) {
    if (w.thickness >= EXTERIOR_MIN_M) continue;
    const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);
    const box = boundsOf(wallPolygon(w, null, false).map((p) => worldToScreen(v, p)));
    const text = len * s < 40 ? len.toFixed(2) : `${len.toFixed(2)} m`;
    if (Math.abs(w.b.x - w.a.x) >= Math.abs(w.b.y - w.a.y)) {
      g.textAlign = 'center';
      g.textBaseline = 'bottom';
      g.fillText(text, (box.minX + box.maxX) / 2, box.minY - 3);
    } else {
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillText(text, box.maxX + 4, (box.minY + box.maxY) / 2);
    }
  }
  g.textAlign = 'left';
}

function marker(g: G, p: Vec2, r: number, dot: number, alpha: number, theme: CanvasTheme): void {
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fillStyle = theme.success;
  g.globalAlpha = alpha;
  g.fill();
  g.globalAlpha = 1;
  g.strokeStyle = theme.success;
  g.lineWidth = 1.5;
  g.stroke();
  g.beginPath();
  g.arc(p.x, p.y, dot, 0, Math.PI * 2);
  g.fill();
}

/** Angle guide around the segment start: allowed directions, the current one in the tool colour. */
function drawProtractor(g: G, c: Vec2, angle: number | null, allowed: number[], theme: CanvasTheme): void {
  g.setLineDash([2, 3]);
  g.strokeStyle = theme.accent;
  g.globalAlpha = 0.6;
  g.lineWidth = 1;
  g.beginPath();
  g.arc(c.x, c.y, PROTRACTOR_R, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
  for (const a of allowed) {
    const d = dir(a);
    line(
      g,
      { x: c.x + d.x * (PROTRACTOR_R - 6), y: c.y + d.y * (PROTRACTOR_R - 6) },
      { x: c.x + d.x * (PROTRACTOR_R + 6), y: c.y + d.y * (PROTRACTOR_R + 6) },
    );
  }
  g.globalAlpha = 1;
  g.font = `400 9px ${theme.fontMono}`;
  g.fillStyle = theme.accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const a of [0, 45, 90]) {
    if (!allowed.includes(a) || (angle !== null && Math.abs(angle - a) < 0.05)) continue;
    const d = dir(a);
    g.fillText(`${a}°`, c.x + d.x * (PROTRACTOR_R + 18), c.y + d.y * (PROTRACTOR_R + 18));
  }
  if (angle !== null) {
    const d = dir(angle);
    g.strokeStyle = theme.tool;
    g.lineWidth = 2;
    line(
      g,
      { x: c.x + d.x * (PROTRACTOR_R - 6), y: c.y + d.y * (PROTRACTOR_R - 6) },
      { x: c.x + d.x * (PROTRACTOR_R + 16), y: c.y + d.y * (PROTRACTOR_R + 16) },
    );
    g.font = `700 9px ${theme.fontMono}`;
    g.fillStyle = theme.tool;
    g.fillText(`${+angle.toFixed(1)}°`, c.x + d.x * (PROTRACTOR_R + 26), c.y + d.y * (PROTRACTOR_R + 26) - 8);
  }
  g.textAlign = 'left';
}

/**
 * Wall tool overlay (design 04): graph nodes, lengths and dimension
 * chains, and the segment being drawn with its angle guide, snap target
 * and readouts.
 */
export function drawWallOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  const t = store.tools;
  if (t.active !== 'wall') return;
  const v = store.viewport;
  const walls = store.doc.objects.filter((o): o is Wall => o.kind === 'wall' && o.layerId === 'walls');
  if (walls.length) {
    if (t.wall.showLengths) {
      drawChains(g, store, walls, theme);
      drawLengths(g, store, walls, theme);
    }
    g.fillStyle = theme.surface;
    g.strokeStyle = theme.accent;
    g.lineWidth = 1.25;
    for (const n of buildWallGraph(walls).nodes) {
      const p = worldToScreen(v, n);
      g.fillRect(p.x - NODE / 2, p.y - NODE / 2, NODE, NODE);
      g.strokeRect(p.x - NODE / 2, p.y - NODE / 2, NODE, NODE);
    }
  }

  const d = t.draft;
  if (!d) return;
  const start = worldToScreen(v, d.start);
  const end = worldToScreen(v, d.end);
  if (d.placing) {
    const preview: Wall = {
      kind: 'wall',
      id: '_draft',
      layerId: 'walls',
      a: d.start,
      b: d.end,
      thickness: t.wall.thickness,
      align: t.wall.align,
    };
    g.beginPath();
    wallPolygon(preview, null, false).forEach((p, i) => {
      const q = worldToScreen(v, p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.closePath();
    g.fillStyle = theme.ink;
    g.globalAlpha = 0.3;
    g.fill();
    g.globalAlpha = 1;
    g.setLineDash([6, 4]);
    g.strokeStyle = theme.tool;
    g.lineWidth = 1.5;
    line(g, start, end);
    if (d.ahead) {
      const to = worldToScreen(v, d.ahead.to);
      g.setLineDash([2, 3]);
      g.strokeStyle = theme.inkFaint;
      g.lineWidth = 1;
      line(g, end, to);
      g.font = `400 9px ${theme.fontMono}`;
      g.fillStyle = theme.inkMuted;
      g.textBaseline = 'bottom';
      g.fillText(`${d.ahead.dist.toFixed(2)} m`, (end.x + to.x) / 2 + 2, end.y - 6);
    }
    g.setLineDash([]);
    drawProtractor(g, start, d.angle, t.wall.angles.length ? allowedAngles(t.wall.angles) : [], theme);
    marker(g, start, 6, 2.5, 0.25, theme);
    const len = Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y);
    pill(g, `${len.toFixed(2)} m`, (start.x + end.x) / 2, (start.y + end.y) / 2 + 19, theme.tool, theme, true);
    if (d.angle !== null) {
      pill(g, `∠ ${+d.angle.toFixed(1)}°  ${d.snapped ? 'snapped' : 'free'}`, end.x + 14, end.y - 40, theme.ink, theme);
    }
  }
  marker(g, end, 11, 3, 0.18, theme);
  g.strokeStyle = theme.ink;
  g.lineWidth = 1.25;
  line(g, { x: end.x - 12, y: end.y }, { x: end.x + 12, y: end.y });
  line(g, { x: end.x, y: end.y - 12 }, { x: end.x, y: end.y + 12 });
  const text = `${SNAP_LABEL[d.kind]}  ${d.end.x.toFixed(2)}, ${d.end.y.toFixed(2)}`;
  pill(g, text, end.x + 14, end.y + 16, d.kind === 'free' ? theme.inkMuted : theme.success, theme);
}
