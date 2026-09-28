import { useEffect, useRef } from 'react';
import { type Viewport, screenToWorld, zoomAt } from '../core/viewport';
import { RenderLoop } from '../render/renderLoop';
import type { Tool, ToolContext, ToolPointerEvent } from '../tools/Tool';
import { useEditorStoreRef } from './useStore';

/**
 * Hosts the canvas and forwards input to the active tool. The render loop
 * owns drawing; this component never re-renders because of document changes.
 */
export function CanvasView({ tool }: { tool: Tool }) {
  const store = useEditorStoreRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const loop = new RenderLoop(canvas, store);
    loop.start();

    const ctx: ToolContext = { store, setCursor: (c) => (canvas.style.cursor = c) };
    let panning: { x: number; y: number; v: Viewport } | null = null;
    let spaceDown = false;

    const toEvent = (e: PointerEvent | MouseEvent): ToolPointerEvent => {
      const r = canvas.getBoundingClientRect();
      const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
      return {
        screen, world: screenToWorld(store.viewport, screen),
        shift: e.shiftKey, alt: e.altKey, meta: e.metaKey || e.ctrlKey, button: e.button,
      };
    };

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      // Middle button or Space+drag pans, independent of the active tool.
      if (e.button === 1 || spaceDown) {
        panning = { x: e.clientX, y: e.clientY, v: store.viewport };
        canvas.style.cursor = 'grabbing';
        return;
      }
      tool.onPointerDown(toEvent(e), ctx);
    };
    const move = (e: PointerEvent) => {
      const ev = toEvent(e);
      loop.cursorWorld = ev.world;
      if (panning) {
        const p = panning;
        store.setViewport({ ...p.v, panX: p.v.panX + e.clientX - p.x, panY: p.v.panY + e.clientY - p.y });
        return;
      }
      tool.onPointerMove(ev, ctx);
    };
    const up = (e: PointerEvent) => {
      if (panning) {
        panning = null;
        canvas.style.cursor = spaceDown ? 'grab' : tool.cursor;
        return;
      }
      tool.onPointerUp(toEvent(e), ctx);
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const ev = toEvent(e);
      if (e.ctrlKey || e.metaKey) {
        // Pinch / ⌘+wheel zooms around the cursor.
        store.setViewport(zoomAt(store.viewport, store.viewport.zoom * Math.exp(-e.deltaY * 0.01), ev.screen));
      } else {
        const v = store.viewport;
        store.setViewport({ ...v, panX: v.panX - e.deltaX, panY: v.panY - e.deltaY });
      }
    };
    const keydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (e.code === 'Space' && !spaceDown) {
        spaceDown = true;
        canvas.style.cursor = 'grab';
        e.preventDefault();
        return;
      }
      tool.onKey?.(e, ctx);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false;
        canvas.style.cursor = tool.cursor;
      }
    };
    // Losing focus mid-drag must not leave a half-applied edit behind.
    const blur = () => tool.cancel(ctx);

    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', blur);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      loop.stop();
      tool.cancel(ctx);
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', blur);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [store, tool]);

  return <canvas ref={canvasRef} className="block size-full touch-none" />;
}
