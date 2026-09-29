import type { PerfSnapshot } from './perf';
import type { HitMode, MarqueeMode } from './picking';
import type { Guide } from './snapping';
import type { Rect, Vec2 } from '../geometry/vec';

/** Transient, non-document state a tool shows on canvas (guides, live labels). */
export interface ToolFeedback {
  guides: Guide[];
  /** "↻ 30.0°  ·  snap 15°" while rotating, anchored at a world point. */
  rotateLabel: { text: string; at: Vec2 } | null;
  resizing: boolean;
  /** Live marquee rectangle (world) while dragging on empty canvas. */
  marquee: { rect: Rect; mode: MarqueeMode } | null;
}

/** Right panel "Hit detection" section. */
export interface HitSettings {
  mode: HitMode;
  marquee: MarqueeMode;
  showRegions: boolean;
  showBroadphase: boolean;
  logTimings: boolean;
}

// Design shows hit regions on, but that is a debugging state; the editor
// opens with them off so screen 06 stays clean (toggle in Hit detection).
export const DEFAULT_HIT: HitSettings = {
  mode: 'polygon',
  marquee: 'intersect',
  showRegions: false,
  showBroadphase: false,
  logTimings: true,
};

export interface FrameStats {
  fps: number;
  frameMs: number;
  cursor: Vec2;
  /** Static layer cache on the last drawn frame ("hit" = blitted, no repaint). */
  cache: 'hit' | 'miss' | 'none';
  /** Objects drawn per layer on the last drawn frame. */
  layerDraws: Readonly<Record<string, number>>;
  /** Perf HUD readouts (11), only while the HUD is open. */
  perf: PerfSnapshot | null;
}
