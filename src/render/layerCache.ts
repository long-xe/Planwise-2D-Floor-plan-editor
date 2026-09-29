import type { Doc, Layer } from '../core/document';
import { layerSignature } from '../core/layerStats';
import type { Viewport } from '../core/viewport';

export type CacheState = 'hit' | 'miss' | 'none';

type Surface = OffscreenCanvas | HTMLCanvasElement;
type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function createSurface(w: number, h: number): Surface {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

interface Entry {
  surface: Surface;
  key: string;
}

/**
 * Static layers (locked, or "Cache as static bitmap") are rasterised once
 * into an off-screen canvas and blitted each frame. The key covers the
 * view (pan, zoom, size, DPR) and the layer's signature; anything else
 * reuses the bitmap.
 */
export class LayerCache {
  private readonly entries = new Map<string, Entry>();
  /** When a bitmap was last repainted (performance.now), for "rebuilt 41 s ago". */
  rebuiltAt: number | null = null;

  /** Blits `layer` from cache, repainting it first when stale. */
  draw(
    g: CanvasRenderingContext2D,
    doc: Doc,
    layer: Layer,
    v: Viewport,
    pxW: number,
    pxH: number,
    dpr: number,
    paint: (cg: Ctx2D) => void,
    /** Anything else that changes the pixels (the mitre setting). */
    salt = '',
  ): CacheState {
    const key = `${v.panX},${v.panY},${v.zoom},${pxW},${pxH},${dpr},${salt},${layerSignature(doc, layer)}`;
    let e = this.entries.get(layer.id);
    let state: CacheState = 'hit';
    if (!e || e.key !== key) {
      state = 'miss';
      const surface = e && e.surface.width === pxW && e.surface.height === pxH ? e.surface : createSurface(pxW, pxH);
      const cg = surface.getContext('2d') as Ctx2D | null;
      if (!cg) return 'none';
      cg.setTransform(1, 0, 0, 1, 0, 0);
      cg.clearRect(0, 0, pxW, pxH);
      cg.setTransform(dpr, 0, 0, dpr, 0, 0);
      paint(cg);
      e = { surface, key };
      this.entries.set(layer.id, e);
      this.rebuiltAt = performance.now();
    }
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = layer.opacity;
    g.drawImage(e.surface, 0, 0);
    g.restore();
    return state;
  }

  /** The first cached bitmap (the Performance tab previews it). */
  get surface(): Surface | null {
    for (const e of this.entries.values()) return e.surface;
    return null;
  }

  /** Drops bitmaps of layers that are no longer static. */
  retain(ids: ReadonlySet<string>): void {
    for (const id of this.entries.keys()) if (!ids.has(id)) this.entries.delete(id);
  }
}
