import { DEFAULT_RENDER, PerfMonitor, type RenderOptions } from './perf';
import type { EditorStore } from './store';

export type RightTab = 'properties' | 'performance';

/** Off-screen surfaces the Performance tab previews, registered by the render loop. */
export interface PerfBuffers {
  staticCache(): CanvasImageSource | null;
  content: CanvasImageSource;
}

/**
 * Performance screen state (design 11) beside the store: the HUD (F12),
 * the right panel's tab, the renderer switches and the frame monitor.
 */
export class PerfState {
  hud = false;
  rightTab: RightTab = 'properties';
  options: RenderOptions = { ...DEFAULT_RENDER };
  readonly monitor = new PerfMonitor();
  buffers: PerfBuffers | null = null;

  constructor(private readonly store: EditorStore) {}

  /** The HUD opens the Performance tab with it (design 11). */
  setHud(on: boolean): void {
    this.hud = on;
    this.rightTab = on ? 'performance' : 'properties';
    this.store.dirty = true;
    this.store.changed();
  }

  setRightTab(tab: RightTab): void {
    this.rightTab = tab;
    this.store.changed();
  }

  setOption(key: keyof RenderOptions, on: boolean): void {
    this.options = { ...this.options, [key]: on };
    this.store.dirty = true;
    this.store.changed();
  }
}
