import type { DirtyRegion, PerfSnapshot, ScreenRect } from '../core/perf';
import { frameTotal } from '../core/perf';
import type { EditorStore } from '../core/store';
import { scaleOf, visibleWorldRect } from '../core/viewport';
import type { Transform } from '../geometry/transform';
import type { Rect } from '../geometry/vec';
import { type ContentStats, ContentPainter, emptyContentStats } from './contentPass';
import { CullIndex } from './cullIndex';
import { DirtyTracker } from './dirtyRects';
import { drawOverlay, drawSheetMarks } from './overlay';
import { CULL_MARGIN_PX, drawPerfOverlay } from './perfOverlay';
import { drawRulers } from './rulers';
import { drawTitleBlock } from './titleBlock';
import { findLayer } from '../core/document';
import { type CanvasTheme, readTheme } from './theme';

const STATS_INTERVAL_MS = 250;
/** Stroke, corner dots and anti-aliasing reach a little past a piece's box. */
const DIRTY_PAD_PX = 4;
const EVERYWHERE: Rect = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };

type Heap = Performance & { memory?: { usedJSHeapSize: number } };

/**
 * requestAnimationFrame loop over two stacked canvases (design 11): the
 * content canvas repaints only what changed — nothing, a few dirty
 * regions, or everything when the view moves — and the overlay canvas
 * (selection, guides, rulers, HUD marks) is cheap enough to redraw whole.
 * Every drawn frame is timed per phase for the Perf HUD.
 */
export class RenderLoop {
  private raf = 0;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private readonly theme: CanvasTheme;
  private readonly painter = new ContentPainter();
  private readonly tracker = new DirtyTracker();
  private readonly cull = new CullIndex();
  private frames = 0;
  private lastStatsAt = 0;
  private lastFrameMs = 0;
  private full: ContentStats = emptyContentStats();
  private lastCalls = 0;
  /** The cull index and batch order have been built for the current document. */
  private indexed = false;
  private dirty: { regions: DirtyRegion[]; redrawn: number } = { regions: [], redrawn: 0 };
  private readonly resizeObserver: ResizeObserver;
  cursorWorld = { x: 0, y: 0 };

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly overlay: HTMLCanvasElement,
    private readonly store: EditorStore,
  ) {
    this.theme = readTheme();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
    store.perf.buffers = { staticCache: () => this.painter.cache.surface, content: canvas };
    // Canvas text must wait for webfonts, or labels render in a fallback face.
    void document.fonts?.ready.then(() => {
      this.tracker.reset();
      this.store.dirty = true;
    });
  }

  start(): void {
    const tick = (now: number) => {
      this.raf = requestAnimationFrame(tick);
      this.frames++;
      this.store.perf.monitor.tick(now);
      if (this.store.dirty) {
        this.store.dirty = false;
        this.draw();
      }
      if (now - this.lastStatsAt >= STATS_INTERVAL_MS) {
        const elapsed = now - (this.lastStatsAt || now - STATS_INTERVAL_MS);
        this.publish(Math.round((this.frames * 1000) / elapsed));
        this.frames = 0;
        this.lastStatsAt = now;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    this.store.perf.buffers = null;
  }

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.width = r.width;
    this.height = r.height;
    for (const c of [this.canvas, this.overlay]) {
      c.width = Math.round(r.width * this.dpr);
      c.height = Math.round(r.height * this.dpr);
    }
    // Setting a canvas's size clears it, even to the same size: repaint all of it.
    this.tracker.reset();
    this.store.dirty = true;
  }

  /** Everything that changes every pixel: when it differs from last frame, nothing is reusable. */
  private viewKey(): string {
    const { store } = this;
    const v = store.viewport;
    const layers = store.doc.layers.map((l) => `${l.id}:${l.order}:${+l.visible}:${+l.locked}:${l.opacity}`).join();
    const o = store.perf.options;
    const m = store.tools.measure.settings;
    return `${v.panX},${v.panY},${v.zoom},${this.width},${this.height},${this.dpr},${store.tools.wall.autoJoin},${layers},${store.activeLayerId},${o.staticCache}${o.culling}${o.batching},${m.units}${m.precision}${m.terminator}${m.showAreas}`;
  }

  private rectOf = (t: Transform): ScreenRect => {
    const v = this.store.viewport;
    const s = scaleOf(v);
    const r = (t.rotation * Math.PI) / 180;
    const c = Math.abs(Math.cos(r));
    const sn = Math.abs(Math.sin(r));
    const hw = ((t.w * c + t.h * sn) / 2) * s + DIRTY_PAD_PX;
    const hh = ((t.w * sn + t.h * c) / 2) * s + DIRTY_PAD_PX;
    const x = Math.floor(t.x * s + v.panX - hw);
    const y = Math.floor(t.y * s + v.panY - hh);
    return { x, y, w: Math.ceil(2 * hw) + 1, h: Math.ceil(2 * hh) + 1 };
  };

  private draw(): void {
    const g = this.canvas.getContext('2d');
    const og = this.overlay.getContext('2d');
    if (!g || !og) return;
    const { store, theme, width: w, height: h, dpr } = this;
    const v = store.viewport;
    const opts = store.perf.options;

    // Update: what changed, and what's in view.
    let t = performance.now();
    const diff = this.tracker.diff(store.doc, this.viewKey(), this.rectOf, w * h);
    if (diff.objects || !this.indexed) {
      this.indexed = true;
      this.cull.invalidate();
      this.painter.documentChanged(store.doc);
    }
    const margin = CULL_MARGIN_PX / scaleOf(v);
    const inView = visibleWorldRect(v, w, h);
    const fullView = opts.culling
      ? {
          minX: inView.minX - margin,
          minY: inView.minY - margin,
          maxX: inView.maxX + margin,
          maxY: inView.maxY + margin,
        }
      : EVERYWHERE;
    const fullOnly = opts.culling ? this.cull.query(store.doc, fullView) : null;
    const update = performance.now() - t;

    // Content: all of it, the dirty regions, or nothing at all.
    const size = { w, h, pxW: this.canvas.width, pxH: this.canvas.height };
    const stats = emptyContentStats();
    if (!opts.dirtyRects || diff.full) {
      const area = { clip: null, shown: inView, view: fullView, only: fullOnly, fullView, fullOnly };
      this.painter.paint(g, store, theme, dpr, size, area, stats);
      this.full = stats;
      this.dirty = { regions: [], redrawn: 0 };
    } else if (diff.regions.length) {
      for (const clip of diff.regions) {
        const a = { x: (clip.x - v.panX) / scaleOf(v), y: (clip.y - v.panY) / scaleOf(v) };
        const shown = { minX: a.x, minY: a.y, maxX: a.x + clip.w / scaleOf(v), maxY: a.y + clip.h / scaleOf(v) };
        const only = opts.culling ? this.cull.query(store.doc, shown) : null;
        const view = opts.culling ? shown : EVERYWHERE;
        this.painter.paint(g, store, theme, dpr, size, { clip, shown, view, only, fullView, fullOnly }, stats);
      }
      this.dirty = { regions: diff.regions, redrawn: stats.counters.drawn };
    }
    this.store.perf.monitor.recordCache(stats.cacheHits, stats.cacheMisses);
    if (stats.counters.calls) this.lastCalls = stats.counters.calls;

    // Composite: the overlay canvas, redrawn whole.
    t = performance.now();
    og.setTransform(dpr, 0, 0, dpr, 0, 0);
    og.clearRect(0, 0, w, h);
    const base = (fn: () => void) => {
      og.save();
      fn();
      og.restore();
    };
    base(() => drawOverlay(og, store, inView, theme));
    // With the HUD up its cards and the cull-bounds label take those corners (design 11).
    if (!store.perf.hud) {
      // The title block shows with the Annotations layer (design 10), and moves the other marks aside.
      const sheet = store.doc.sheet && findLayer(store.doc, 'annotations')?.visible ? store.doc.sheet : null;
      base(() => drawSheetMarks(og, v, w, h, theme, !!sheet));
      if (sheet) base(() => drawTitleBlock(og, w, h, theme, store.doc.name, sheet));
    }
    if (store.perf.hud) {
      const regions = opts.showDirty && opts.dirtyRects ? this.dirty.regions : null;
      base(() => drawPerfOverlay(og, theme, w, h, regions, opts.culling));
    }
    base(() => drawRulers(og, v, w, h, theme));
    const composite = performance.now() - t;

    const phases = store.perf.monitor.record({
      update,
      drawStatic: stats.drawStatic,
      drawDynamic: stats.drawDynamic,
      composite,
    });
    this.lastFrameMs = frameTotal(phases);
  }

  private publish(fps: number): void {
    const { store } = this;
    store.publishStats({
      fps,
      frameMs: this.lastFrameMs,
      cursor: this.cursorWorld,
      cache: this.full.cacheHits ? 'hit' : this.full.cacheMisses ? 'miss' : 'none',
      layerDraws: this.full.layerDraws,
      perf: store.perf.hud ? this.snapshot() : null,
    });
  }

  private snapshot(): PerfSnapshot {
    const { store } = this;
    const m = store.perf.monitor;
    const phases = m.takeAverage();
    const surface = this.painter.cache.surface;
    const rebuilt = this.painter.cache.rebuiltAt;
    const heap = (performance as Heap).memory?.usedJSHeapSize;
    const inView = visibleWorldRect(store.viewport, this.width, this.height);
    return {
      frame: m.frame,
      phases,
      frameMs: frameTotal(phases),
      history: m.history(),
      p95: m.p95,
      longFrames: m.longFrames,
      gcPauses: m.gcPauses,
      objects: store.doc.objects.length,
      visible: this.full.counters.drawn,
      culled: this.full.counters.culled,
      drawCalls: this.lastCalls,
      dirty: this.dirty,
      cacheHitRate: m.cacheHitRate,
      staticCache:
        surface && rebuilt !== null
          ? {
              w: surface.width,
              h: surface.height,
              rebuiltAgoS: (performance.now() - rebuilt) / 1000,
              replaced: this.full.replaced,
            }
          : null,
      heapMB: heap === undefined ? null : heap / 1048576,
      dpr: this.dpr,
      canvas: { w: this.canvas.width, h: this.canvas.height },
      cull: this.cull.snapshot(store.doc, inView),
    };
  }
}
