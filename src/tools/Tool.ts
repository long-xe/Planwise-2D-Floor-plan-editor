import type { EditorStore } from '../core/store';
import type { Vec2 } from '../geometry/vec';

export interface ToolPointerEvent {
  /** CSS pixels relative to the canvas. */
  screen: Vec2;
  /** Metres. */
  world: Vec2;
  shift: boolean;
  alt: boolean;
  meta: boolean;
  button: number;
}

export interface ToolContext {
  store: EditorStore;
  setCursor(cursor: string): void;
}

export interface Tool {
  id: string;
  cursor: string;
  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void;
  onPointerUp(e: ToolPointerEvent, ctx: ToolContext): void;
  /** The pointer left the canvas (drop previews hide). */
  onPointerLeave?(ctx: ToolContext): void;
  onKey?(e: KeyboardEvent, ctx: ToolContext): void;
  /** Roll back any open transaction (Esc, lost focus, tool switch). */
  cancel(ctx: ToolContext): void;
  renderOverlay?(g: CanvasRenderingContext2D, ctx: ToolContext): void;
}
