import type { EditorStore } from '../core/store';
import { visibleWorldRect } from '../core/viewport';
import { findLayer } from '../core/document';
import { type SceneCounters, drawGrid, drawScene } from './drawScene';
import { drawOverlay, drawSheetMarks } from './overlay';
import { drawRulers } from './rulers';
import { type CanvasTheme, readTheme } from './theme';

const STATS_INTERVAL_MS = 250;

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
    base(() => drawScene(g, store.doc, v, view, theme, this.dpr, this.counters));
    base(() => drawOverlay(g, store, view, theme));
    base(() => drawSheetMarks(g, v, w, h, theme));
    base(() => drawRulers(g, v, w, h, theme));
  }
}
