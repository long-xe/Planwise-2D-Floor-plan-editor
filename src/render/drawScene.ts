import type { Doc, Furniture, Layer, Wall } from '../core/document';
import { isFixture } from '../core/document';
import { hostWall } from '../core/structure';
import { openingShape } from '../geometry/openings';
import { type WallGraph, buildWallGraph, wallPolygon } from '../geometry/walls';
import { type Viewport, scaleOf } from '../core/viewport';
import type { Rect, Vec2 } from '../geometry/vec';
import type { CanvasTheme } from './theme';
import type { AnnotationStyle } from '../core/annotations';
import type { SymbolBatcher } from './batchDraw';
import { drawAnnotation } from './drawAnnotations';
import { drawCircuits, drawFixture, drawFurniture } from './drawFurniture';
import { catalogItem } from '../library/catalog';

export interface SceneCounters {
  drawn: number;
  culled: number;
  /** Fill / stroke / drawImage calls issued. */
  calls: number;
}

/** Grid: minor every 0.4 m, major every 2 m (design grid/minor, grid/major). */
export function drawGrid(g: Ctx2D, v: Viewport, view: Rect, theme: CanvasTheme): void {
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

/** One layer draw's inputs: where, what's in view, and how to paint it. */
export interface LayerPass {
  v: Viewport;
  view: Rect;
  theme: CanvasTheme;
  dpr: number;
  out: SceneCounters;
  /** Auto-join corners (04): mitred L corners instead of square ends. */
  mitre: boolean;
  /** Broadphase candidates from the cull index (11); null tests every piece. */
  only: ReadonlySet<string> | null;
  /** "Batch same-style paths" (11): catalog pieces queue here and draw per style. */
  batch: SymbolBatcher | null;
  /** Units, precision and dimension style for annotations (10). */
  annot: AnnotationStyle;
}

/**
 * Draws one layer's objects (walls, furniture, fixtures). Returns how many
 * objects were drawn, for the per-layer "N draws" in the Layers manager;
 * fill / stroke calls add up in `out.calls` (the Perf HUD's draw calls).
 */
export function drawLayer(
  g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  doc: Doc,
  layer: Layer,
  p: LayerPass,
): number {
  const { v, view, theme, dpr, out } = p;
  let drawn = 0;
  let calls = 0;
  // One graph per layer draw: every wall needs its neighbours for its corners.
  const walls = doc.objects.filter((o): o is Wall => o.kind === 'wall' && o.layerId === layer.id);
  const graph = walls.length ? buildWallGraph(walls) : null;
  for (const o of doc.objects) {
    if (o.layerId !== layer.id) continue;
    if (o.kind === 'wall') {
      drawWall(g, o, graph, p.mitre, v, theme);
      drawn++;
      calls++;
    } else if (o.kind === 'opening') {
      // Drawn after every wall (drawOpenings) so no wall paints over a cut.
      drawn++;
    } else if (o.kind === 'annotation') {
      // Few, and mostly outside the plan's bounds (chains, notes): never culled.
      calls += drawAnnotation(g, o, v, theme, p.annot);
      drawn++;
    } else if ((!p.only || p.only.has(o.id)) && visible(o, view)) {
      const item = p.batch && !isFixture(o.icon) ? catalogItem(o.catalogId) : undefined;
      if (item) p.batch!.add(o, item);
      else if (isFixture(o.icon)) calls += drawFixture(g, o, v, dpr, layer.color, theme);
      else calls += drawFurniture(g, o, v, dpr);
      drawn++;
    } else out.culled++;
  }
  if (p.batch) calls += p.batch.flush(g, v, dpr);
  calls += drawOpenings(g, doc, layer, v, theme);
  calls += drawCircuits(g, doc, layer, v);
  out.drawn += drawn;
  out.calls += calls;
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
function drawOpenings(g: Ctx2D, doc: Doc, layer: Layer, v: Viewport, theme: CanvasTheme): number {
  let calls = 0;
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
      calls += 3;
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
    calls += 3;
  }
  g.lineCap = 'butt';
  return calls;
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
