import type { Doc, Furniture, Layer, Wall } from '../core/document';
import { isFixture } from '../core/document';
import { hostWall } from '../core/structure';
import { openingShape } from '../geometry/openings';
import { type WallGraph, buildWallGraph, wallPolygon } from '../geometry/walls';
import { type Viewport, scaleOf } from '../core/viewport';
import type { Rect, Vec2 } from '../geometry/vec';
import { DEG } from '../geometry/vec';
import type { CanvasTheme } from './theme';

export interface SceneCounters {
  drawn: number;
  culled: number;
}

/** Grid: minor every 0.4 m, major every 2 m (design grid/minor, grid/major). */
export function drawGrid(g: CanvasRenderingContext2D, v: Viewport, view: Rect, theme: CanvasTheme): void {
  const s = scaleOf(v);
  const line = (step: number, color: string) => {
    g.beginPath();
    for (let x = Math.ceil(view.minX / step) * step; x <= view.maxX; x += step) {
      const sx = Math.round(x * s + v.panX) + 0.5;
      g.moveTo(sx, view.minY * s + v.panY);
      g.lineTo(sx, view.maxY * s + v.panY);
    }
    for (let y = Math.ceil(view.minY / step) * step; y <= view.maxY; y += step) {
      const sy = Math.round(y * s + v.panY) + 0.5;
      g.moveTo(view.minX * s + v.panX, sy);
      g.lineTo(view.maxX * s + v.panX, sy);
    }
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
  };
  // Skip the minor grid once it would be denser than 8 px.
  if (0.4 * s >= 8) line(0.4, theme.gridMinor);
  line(2, theme.gridMajor);
}

/**
 * Draws one layer's objects (walls, furniture, fixtures). Returns how many
 * objects were drawn, for the per-layer "N draws" in the Layers manager.
 */
export function drawLayer(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: Doc,
  layer: Layer,
  v: Viewport,
  view: Rect,
  theme: CanvasTheme,
  dpr: number,
  out: SceneCounters,
  /** Auto-join corners (04): mitred L corners instead of square ends. */
  mitre = true,
): number {
  let drawn = 0;
  // One graph per layer draw: every wall needs its neighbours for its corners.
  const walls = doc.objects.filter((o): o is Wall => o.kind === 'wall' && o.layerId === layer.id);
  const graph = walls.length ? buildWallGraph(walls) : null;
  for (const o of doc.objects) {
    if (o.layerId !== layer.id) continue;
    if (o.kind === 'wall') {
      drawWall(g, o, graph, mitre, v, theme);
      drawn++;
    } else if (o.kind === 'opening') {
      // Drawn after every wall (drawOpenings) so no wall paints over a cut.
      drawn++;
    } else if (visible(o, view)) {
      if (isFixture(o.icon)) drawFixture(g, o, v, dpr, layer.color, theme);
      else drawFurniture(g, o, v, dpr);
      drawn++;
    } else out.culled++;
  }
  drawOpenings(g, doc, layer, v, theme);
  drawCircuits(g, doc, layer, v);
  out.drawn += drawn;
  return drawn;
}

function visible(f: Furniture, view: Rect): boolean {
  // Cheap conservative cull: the circumscribed circle of the box.
  const t = f.transform;
  const r = Math.hypot(t.w, t.h) / 2;
  return t.x + r >= view.minX && t.x - r <= view.maxX && t.y + r >= view.minY && t.y - r <= view.maxY;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const DOOR_LEAF_PX = 1.75;
const DOOR_ARC_PX = 0.8;
const WINDOW_FRAME_PX = 1;
const WINDOW_PANE_PX = 0.8;

/**
 * Doors and windows (design 20:804–827), after every wall of the layer so
 * a neighbouring wall can't paint over a cut. Doors clear the wall to the
 * canvas colour and draw an open leaf plus its swing arc; windows draw a
 * glass pane with a 1 px frame inside the cut and a centre line.
 */
function drawOpenings(g: Ctx2D, doc: Doc, layer: Layer, v: Viewport, theme: CanvasTheme): void {
  const s = scaleOf(v);
  const P = (p: Vec2) => ({ x: p.x * s + v.panX, y: p.y * s + v.panY });
  const quad = (pts: readonly Vec2[]) => {
    g.beginPath();
    pts.forEach((p, i) => {
      const q = P(p);
      if (i) g.lineTo(q.x, q.y);
      else g.moveTo(q.x, q.y);
    });
    g.closePath();
  };
  g.lineCap = 'round';
  for (const o of doc.objects) {
    if (o.kind !== 'opening' || o.layerId !== layer.id) continue;
    const w = hostWall(doc, o);
    if (!w) continue;
    const shape = openingShape(w, o);
    if (o.type === 'window') {
      // Frame drawn inside the cut (Figma stroke-align: inside).
      const k = WINDOW_FRAME_PX / s;
      quad(shape.cut);
      g.fillStyle = theme.ink;
      g.fill();
      quad(
        openingShape({ ...w, thickness: w.thickness - 2 * k }, { ...o, offset: o.offset + k, width: o.width - 2 * k })
          .cut,
      );
      g.fillStyle = theme.glass;
      g.fill();
      const [a, b] = shape.axis.map(P) as [Vec2, Vec2];
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.strokeStyle = theme.ink;
      g.lineWidth = WINDOW_PANE_PX;
      g.stroke();
      continue;
    }
    quad(shape.cut);
    g.fillStyle = theme.canvas;
    g.fill();
    const d = shape.door!;
    const h = P(d.hinge);
    const leaf = P(d.leafEnd);
    g.beginPath();
    g.moveTo(h.x, h.y);
    g.lineTo(leaf.x, leaf.y);
    g.strokeStyle = theme.ink;
    g.lineWidth = DOOR_LEAF_PX;
    g.stroke();
    // Quarter circle about the hinge, from the leaf tip to the far jamb.
    const a0 = Math.atan2(d.leafEnd.y - d.hinge.y, d.leafEnd.x - d.hinge.x);
    const a1 = Math.atan2(d.closedEnd.y - d.hinge.y, d.closedEnd.x - d.hinge.x);
    const sweep = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    g.beginPath();
    g.arc(h.x, h.y, o.width * s, a0, a1, sweep < 0);
    g.lineWidth = DOOR_ARC_PX;
    g.stroke();
  }
  g.lineCap = 'butt';
}

function drawWall(g: Ctx2D, w: Wall, graph: WallGraph | null, mitre: boolean, v: Viewport, theme: CanvasTheme): void {
  const s = scaleOf(v);
  g.beginPath();
  wallPolygon(w, graph, mitre).forEach((p, i) => {
    const x = p.x * s + v.panX;
    const y = p.y * s + v.panY;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
  g.closePath();
  g.fillStyle = theme.ink;
  g.fill();
}

// Hoisted so the per-object draw doesn't allocate.
const RUG_DASH = [4, 3];
const NO_DASH: number[] = [];

function localFrame(g: Ctx2D, f: Furniture, v: Viewport, dpr: number): { w: number; h: number } {
  const s = scaleOf(v);
  const t = f.transform;
  const c = Math.cos(t.rotation * DEG);
  const sn = Math.sin(t.rotation * DEG);
  const fx = t.flipX ? -1 : 1;
  const k = dpr;
  g.setTransform(c * fx * k, sn * fx * k, -sn * k, c * k, (t.x * s + v.panX) * k, (t.y * s + v.panY) * k);
  return { w: t.w * s, h: t.h * s };
}

function footprintPath(g: Ctx2D, f: Furniture, w: number, h: number): void {
  g.beginPath();
  const p0 = f.footprint[0]!;
  g.moveTo(p0.x * w, p0.y * h);
  for (let i = 1; i < f.footprint.length; i++) g.lineTo(f.footprint[i]!.x * w, f.footprint[i]!.y * h);
  g.closePath();
}

/**
 * Electrical symbols (design 08): outlet half-disc on the wall, "S" switch
 * box, ceiling light circle with a cross. Stroked in the layer colour so
 * recolouring the layer recolours its symbols.
 */
function drawFixture(g: Ctx2D, f: Furniture, v: Viewport, dpr: number, color: string, theme: CanvasTheme): void {
  const { w, h } = localFrame(g, f, v, dpr);
  const z = scaleOf(v) / 50;
  g.fillStyle = theme.surface;
  g.strokeStyle = color;
  if (f.icon === 'switch') {
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, 2 * z);
    g.fill();
    g.lineWidth = 1.25;
    g.stroke();
    g.fillStyle = color;
    g.font = `700 ${10 * z}px ${theme.fontSans}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('S', 0, 0.5 * z);
    g.textAlign = 'left';
  } else if (f.icon === 'light') {
    g.beginPath();
    g.arc(0, 0, w / 2, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 1.5;
    g.stroke();
    // Cross spans 12 of the 18 px disc in the design.
    const r = (w / 2) * (6 / 9) * Math.SQRT1_2;
    g.beginPath();
    g.moveTo(-r, -r);
    g.lineTo(r, r);
    g.moveTo(r, -r);
    g.lineTo(-r, r);
    g.lineWidth = 1.25;
    g.stroke();
  } else {
    footprintPath(g, f, w, h);
    g.fill();
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

const WIRE_DASH = [4, 3];

/** Dashed home-run from each switch to the lights on its circuit, bowed like a hand-drawn wire. */
function drawCircuits(g: Ctx2D, doc: Doc, layer: Layer, v: Viewport): void {
  const s = scaleOf(v);
  let started = false;
  for (const sw of doc.objects) {
    if (sw.kind !== 'furniture' || sw.layerId !== layer.id || sw.icon !== 'switch' || !sw.circuit) continue;
    for (const light of doc.objects) {
      if (light.kind !== 'furniture' || light.icon !== 'light' || light.circuit !== sw.circuit) continue;
      if (!started) {
        g.beginPath();
        started = true;
      }
      const a = { x: sw.transform.x * s + v.panX, y: sw.transform.y * s + v.panY };
      const b = { x: light.transform.x * s + v.panX, y: light.transform.y * s + v.panY };
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      g.moveTo(a.x, a.y);
      g.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - len * 0.25, b.x, b.y);
    }
  }
  if (!started) return;
  g.setLineDash(WIRE_DASH);
  g.strokeStyle = layer.color;
  g.lineWidth = 1;
  g.stroke();
  g.setLineDash(NO_DASH);
}

/** Draws in the object's local frame via the context transform: no per-point allocations. */
function drawFurniture(g: Ctx2D, f: Furniture, v: Viewport, dpr: number): void {
  const { w, h } = localFrame(g, f, v, dpr);
  if (f.footprint.length === 4) {
    g.beginPath();
    g.roundRect(-w / 2, -h / 2, w, h, Math.min(3, w / 4, h / 4));
  } else footprintPath(g, f, w, h);
  const a = f.appearance;
  const alpha = g.globalAlpha;
  g.globalAlpha = alpha * a.fillOpacity;
  g.fillStyle = a.fill;
  g.fill();
  g.globalAlpha = alpha;
  g.strokeStyle = a.stroke;
  g.lineWidth = a.strokeWidth;
  if (a.dashed) g.setLineDash(RUG_DASH);
  g.stroke();
  if (a.dashed) g.setLineDash(NO_DASH);
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}
