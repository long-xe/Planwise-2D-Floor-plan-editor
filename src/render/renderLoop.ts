import type { EditorStore } from '../core/store';
import { visibleWorldRect } from '../core/viewport';
import { findLayer } from '../core/document';
import { type SceneCounters, drawGrid, drawLayer } from './drawScene';
import { type CacheState, LayerCache } from './layerCache';
import { drawOverlay, drawSheetMarks } from './overlay';
import { drawRulers } from './rulers';
import { type CanvasTheme, readTheme } from './theme';

const STATS_INTERVAL_MS = 250;
const GHOST_ALPHA = 0.22;

/**
 * requestAnimationFrame loop. Redraws only when the store is dirty or the
 * canvas resized; frame timing is published on the store's stats channel.
 */
export class RenderLoop {
  private raf = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private theme: CanvasTheme;
  private counters: SceneCounters = { drawn: 0, culled: 0 };
  private readonly cache = new LayerCache();
  private cacheState: CacheState = 'none';
  private layerDraws: Record<string, number> = {};
  private frames = 0;
  private lastStatsAt = 0;
  private lastDrawMs = 0;
  private readonly resizeObserver: ResizeObserver;
  cursorWorld = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly store: EditorStore,
  ) {
    this.theme = readTheme();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    // Canvas text must wait for webfonts, or labels render in a fallback face.
    void document.fonts?.ready.then(() => {
      this.store.dirty = true;
    });
  }

  start(): void {
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.frames++;
      if (this.store.dirty) {
        const t0 = performance.now();
        this.draw();
        this.lastDrawMs = performance.now() - t0;
        this.store.dirty = false;
      }
      if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
        const elapsed = now - (this.lastStatsAt || now - STATS_INTERVAL_MS);
        this.store.publishStats({
          fps: Math.round((this.frames * 1000) / elapsed),
          frameMs: this.lastDrawMs,
          cursor: this.cursorWorld,
          cache: this.cacheState,
          layerDraws: this.layerDraws,
        });
        this.frames = 0;
        this.lastStatsAt = now;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = r.width;
    this.height = r.height;
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.store.dirty = true;
  }

  /**
   * Bottom layer first. Static layers blit from their cached bitmap; hidden
   * layers are skipped, except in the Layers manager where they show as a
   * faint ghost (design 08: "Annotations (hidden)" at 22 %).
   */
  private drawLayers(g: CanvasRenderingContext2D, view: ReturnType<typeof visibleWorldRect>): void {
    const { store, theme, dpr } = this;
    const doc = store.doc;
    const v = store.viewport;
    const c = this.counters;
    const mitre = store.tools.wall.autoJoin;
    c.drawn = 0;
    c.culled = 0;
    const draws: Record<string, number> = {};
    const cached = new Set<string>();
    let state: CacheState = 'none';
    for (const layer of doc.layers.toSorted((a, b) => a.order - b.order)) {
      if (!layer.visible) {
        if (store.activeLayerId) {
          g.globalAlpha = GHOST_ALPHA;
          drawLayer(g, doc, layer, v, view, theme, dpr, { drawn: 0, culled: 0 }, mitre);
        }
        continue;
      }
      if (layer.locked || layer.cacheAsStatic) {
        cached.add(layer.id);
        let n = 0;
        const hit = this.cache.draw(
          g,
          doc,
          layer,
          v,
          this.canvas.width,
          this.canvas.height,
          dpr,
          (cg) => {
            n = drawLayer(cg, doc, layer, v, view, theme, dpr, c, mitre);
          },
          mitre ? 'mitre' : 'square',
        );
        if (hit === 'hit') n = draws[layer.id] ?? this.layerDraws[layer.id] ?? 0;
        draws[layer.id] = n;
        state = state === 'miss' || hit === 'miss' ? 'miss' : 'hit';
        continue;
      }
      g.globalAlpha = layer.opacity;
      draws[layer.id] = drawLayer(g, doc, layer, v, view, theme, dpr, c, mitre);
    }
    g.globalAlpha = 1;
    this.cache.retain(cached);
    this.cacheState = state;
    this.layerDraws = draws;
  }

  private draw(): void {
    const g = this.canvas.getContext('2d');
    if (!g) return;
    const { store, theme, width: w, height: h } = this;
    const v = store.viewport;
    // Draw in CSS pixels; the base transform maps them to device pixels.
    g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = theme.canvas;
    g.fillRect(0, 0, w, h);

    const view = visibleWorldRect(v, w, h);
    const base = (fn: () => void) => {
      g.save();
      fn();
      g.restore();
    };
    if (findLayer(store.doc, 'grid')?.visible) base(() => drawGrid(g, v, view, theme));
    base(() => this.drawLayers(g, view));
    base(() => drawOverlay(g, store, view, theme));
    base(() => drawSheetMarks(g, v, w, h, theme));
    base(() => drawRulers(g, v, w, h, theme));
  }
}
