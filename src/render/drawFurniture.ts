import type { Doc, Furniture, Layer } from '../core/document';
import { type Viewport, scaleOf } from '../core/viewport';
import { DEG } from '../geometry/vec';
import { catalogItem } from '../library/catalog';
import { drawSymbol } from './drawSymbol';
import type { CanvasTheme } from './theme';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

// Hoisted so the per-object draw doesn't allocate.
const RUG_DASH = [4, 3];
const NO_DASH: number[] = [];
const WIRE_DASH = [4, 3];

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
 * recolouring the layer recolours its symbols. Returns draw calls.
 */
export function drawFixture(
  g: Ctx2D,
  f: Furniture,
  v: Viewport,
  dpr: number,
  color: string,
  theme: CanvasTheme,
): number {
  const { w, h } = localFrame(g, f, v, dpr);
  const z = scaleOf(v) / 50;
  g.fillStyle = theme.surface;
  g.strokeStyle = color;
  let calls = 2;
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
    calls++;
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
    calls++;
  } else {
    footprintPath(g, f, w, h);
    g.fill();
    g.lineWidth = 1.5;
    g.stroke();
  }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return calls;
}

/** Dashed home-run from each switch to the lights on its circuit, bowed like a hand-drawn wire. */
export function drawCircuits(g: Ctx2D, doc: Doc, layer: Layer, v: Viewport): number {
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
  if (!started) return 0;
  g.setLineDash(WIRE_DASH);
  g.strokeStyle = layer.color;
  g.lineWidth = 1;
  g.stroke();
  g.setLineDash(NO_DASH);
  return 1;
}

/** Draws in the object's local frame via the context transform: no per-point allocations. Returns draw calls. */
export function drawFurniture(g: Ctx2D, f: Furniture, v: Viewport, dpr: number): number {
  const { w, h } = localFrame(g, f, v, dpr);
  const item = catalogItem(f.catalogId);
  if (item) {
    const calls = drawSymbol(g, item.parts, f.appearance, w, h, scaleOf(v) / 50);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return calls;
  }
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
  return 2;
}
