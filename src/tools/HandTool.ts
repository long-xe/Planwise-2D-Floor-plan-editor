import type { Tool, ToolContext, ToolPointerEvent } from './Tool';

/**
 * Hand tool (H): drag to pan the view. Panning is navigation, not an edit,
 * so it goes straight to the viewport — no command, nothing in History.
 * Esc returns to Select.
 */
export class HandTool implements Tool {
  readonly id = 'hand';
  readonly cursor = 'grab';
  /** Pointer and pan when the drag started; null while not dragging. */
  private from: { x: number; y: number; panX: number; panY: number } | null = null;

  onPointerDown(e: ToolPointerEvent, ctx: ToolContext): void {
    if (e.button !== 0) return;
    const v = ctx.store.viewport;
    this.from = { x: e.screen.x, y: e.screen.y, panX: v.panX, panY: v.panY };
    ctx.setCursor('grabbing');
  }

  onPointerMove(e: ToolPointerEvent, ctx: ToolContext): void {
    const f = this.from;
    if (!f) {
      ctx.setCursor(this.cursor);
      return;
    }
    const v = ctx.store.viewport;
    ctx.store.setViewport({ ...v, panX: f.panX + e.screen.x - f.x, panY: f.panY + e.screen.y - f.y });
  }

  onPointerUp(_e: ToolPointerEvent, ctx: ToolContext): void {
    this.from = null;
    ctx.setCursor(this.cursor);
  }

  onKey(e: KeyboardEvent, ctx: ToolContext): void {
    if (e.key === 'Escape') ctx.store.tools.setActive('select');
  }

  cancel(): void {
    this.from = null;
  }
}
