import type { EditorStore } from '../core/store';
import type { ScreenRect } from '../core/perf';
import { findLayer } from '../core/document';
import type { Rect } from '../geometry/vec';
import { SymbolBatcher } from './batchDraw';
import { type LayerPass, type SceneCounters, drawGrid, drawLayer } from './drawScene';
import { type CacheState, LayerCache } from './layerCache';
import type { CanvasTheme } from './theme';

const GHOST_ALPHA = 0.22;

/** What one content repaint did, for the frame breakdown and counters. */
export interface ContentStats {
  drawStatic: number;
  drawDynamic: number;
  counters: SceneCounters;
  cacheHits: number;
  cacheMisses: number;
  /** Objects a cache blit stood in for ("replaces 212 wall + fixture draws"). */
  replaced: number;
  layerDraws: Record<string, number>;
}

export const emptyContentStats = (): ContentStats => ({
  drawStatic: 0,
  drawDynamic: 0,
  counters: { drawn: 0, culled: 0, calls: 0 },
  cacheHits: 0,
  cacheMisses: 0,
  replaced: 0,
  layerDraws: {},
});

export interface ContentArea {
  /** Screen region to repaint; null repaints the whole canvas. */
  clip: ScreenRect | null;
  /** World rect the region shows (the grid draws exactly this). */
  shown: Rect;
  /** World rect pieces are culled against (unbounded with culling off), and the broadphase candidates in it. */
  view: Rect;
  only: ReadonlySet<string> | null;
  /** The whole view: a cached bitmap is always painted for all of it. */
  fullView: Rect;
  fullOnly: ReadonlySet<string> | null;
}

/**
 * Paints the content canvas — grid, then layers bottom-up — over the whole
 * view or inside one dirty region. Static layers (locked, or "Cache as
 * static bitmap") blit from their off-screen bitmap when caching is on;
 * hidden layers show as a faint ghost only in the Layers manager (08).
 */
export class ContentPainter {
  readonly cache = new LayerCache();
  private readonly batcher = new SymbolBatcher();

  /** The document changed: batch groups re-rank by where their style first appears. */
  documentChanged(doc: EditorStore['doc']): void {
    this.batcher.prepare(doc);
  }

  paint(
    g: CanvasRenderingContext2D,
    store: EditorStore,
    theme: CanvasTheme,
    dpr: number,
    size: { w: number; h: number; pxW: number; pxH: number },
    area: ContentArea,
    out: ContentStats,
  ): void {
    const { doc, viewport: v } = store;
    const opts = store.perf.options;
    const mitre = store.tools.wall.autoJoin;
    const c = out.counters;
    g.save();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = area.clip ?? { x: 0, y: 0, w: size.w, h: size.h };
    if (area.clip) {
      g.beginPath();
      g.rect(r.x, r.y, r.w, r.h);
      g.clip();
    }
    let t = performance.now();
    g.fillStyle = theme.canvas;
    g.fillRect(r.x, r.y, r.w, r.h);
    // Plans without a grid layer (the stress plan) still show the grid.
    if (findLayer(doc, 'grid')?.visible ?? true) drawGrid(g, v, area.shown, theme);
    out.drawStatic += performance.now() - t;

    const pass = (view: Rect, only: ReadonlySet<string> | null): LayerPass => ({
      v,
      view,
      theme,
      dpr,
      out: c,
      mitre,
      only,
      batch: opts.batching ? this.batcher : null,
    });
    const cached = new Set<string>();
    for (const layer of doc.layers.toSorted((a, b) => a.order - b.order)) {
      t = performance.now();
      const isStatic = layer.locked || layer.cacheAsStatic;
      if (!layer.visible) {
        if (store.activeLayerId) {
          g.globalAlpha = GHOST_ALPHA;
          drawLayer(g, doc, layer, { ...pass(area.view, area.only), out: { drawn: 0, culled: 0, calls: 0 } });
          g.globalAlpha = 1;
        }
      } else if (isStatic && opts.staticCache) {
        cached.add(layer.id);
        let n = 0;
        const state: CacheState = this.cache.draw(
          g,
          doc,
          layer,
          v,
          size.pxW,
          size.pxH,
          dpr,
          (cg) => {
            n = drawLayer(cg, doc, layer, pass(area.fullView, area.fullOnly));
          },
          `${mitre ? 'mitre' : 'square'}|${opts.culling}|${opts.batching}`,
        );
        c.calls++;
        if (state === 'hit') {
          out.cacheHits++;
          n = out.layerDraws[layer.id] ?? this.lastDraws[layer.id] ?? 0;
          out.replaced += n;
          // Blitted, but on screen all the same.
          c.drawn += n;
        } else out.cacheMisses++;
        out.layerDraws[layer.id] = n;
      } else {
        g.globalAlpha = layer.opacity;
        out.layerDraws[layer.id] = drawLayer(g, doc, layer, pass(area.view, area.only));
        g.globalAlpha = 1;
      }
      const ms = performance.now() - t;
      if (isStatic) out.drawStatic += ms;
      else out.drawDynamic += ms;
    }
    g.restore();
    if (!area.clip) {
      this.cache.retain(cached);
      this.lastDraws = { ...out.layerDraws };
    }
  }

  private lastDraws: Record<string, number> = {};
}
