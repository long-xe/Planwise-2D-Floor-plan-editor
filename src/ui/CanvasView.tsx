import { useEffect, useRef } from 'react';
import { type Viewport, screenToWorld, zoomAt } from '../core/viewport';
import { RenderLoop } from '../render/renderLoop';
import type { ToolId } from '../core/toolState';
import type { Tool, ToolContext, ToolPointerEvent } from '../tools/Tool';
import { useEditorStoreRef } from './useStore';

const TOOL_KEYS: Record<string, ToolId> = { v: 'select', h: 'hand', w: 'wall', f: 'furniture', m: 'measure' };

/**
 * Hosts the canvas and forwards input to the active tool. The render loop
 * owns drawing; this component never re-renders because of document changes.
 */
export function CanvasView({ tools }: { tools: Record<ToolId, Tool> }) {
  const store = useEditorStoreRef();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const loop = new RenderLoop(canvas, overlay, store);
    loop.start();

    const ctx: ToolContext = { store, setCursor: (c) => (canvas.style.cursor = c) };
    // Read at event time, so switching tools needs no new render loop.
    const tool = () => tools[store.tools.active];
    let panning: { x: number; y: number; v: Viewport } | null = null;
    let spaceDown = false;

    const toEvent = (e: PointerEvent | MouseEvent): ToolPointerEvent => {
      const r = canvas.getBoundingClientRect();
      const screen = { x: e.clientX - r.left, y: e.clientY - r.top };
      return {
        screen,
        world: screenToWorld(store.viewport, screen),
        shift: e.shiftKey,
        alt: e.altKey,
        meta: e.metaKey || e.ctrlKey,
        button: e.button,
      };
    };

    // Handler time is the frame breakdown's "input" (hit-testing inside it is split out).
    const timed =
      <E,>(fn: (e: E) => void) =>
      (e: E) => {
        const t = performance.now();
        fn(e);
        store.perf.monitor.addInput(performance.now() - t);
      };

    const down = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      // Middle button or Space+drag pans, independent of the active tool.
      if (e.button === 1 || spaceDown) {
        panning = { x: e.clientX, y: e.clientY, v: store.viewport };
        canvas.style.cursor = 'grabbing';
        return;
      }
      tool().onPointerDown(toEvent(e), ctx);
    };
    const move = (e: PointerEvent) => {
      const ev = toEvent(e);
      loop.cursorWorld = ev.world;
      if (panning) {
        const p = panning;
        store.setViewport({ ...p.v, panX: p.v.panX + e.clientX - p.x, panY: p.v.panY + e.clientY - p.y });
        return;
      }
      tool().onPointerMove(ev, ctx);
    };
    const up = (e: PointerEvent) => {
      if (panning) {
        panning = null;
        canvas.style.cursor = spaceDown ? 'grab' : tool().cursor;
        return;
      }
      tool().onPointerUp(toEvent(e), ctx);
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
      // A dialog (Export, 12) owns the keyboard while it's open.
      if (store.exporter.open) return;
      // F12: Perf HUD (11), even from a text field.
      if (e.key === 'F12') {
        e.preventDefault();
        store.perf.setHud(!store.perf.hud);
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea')) return;
      const mod = e.metaKey || e.ctrlKey;
      // ⌘⌥Z: jump to the entry inspected in History. e.code, since ⌥ turns e.key into "Ω" on macOS.
      if (mod && e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        store.history.jump(store.history.shownSeq);
        return;
      }
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      // ⌘K: search the furniture Library (05).
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        store.tools.setActive('furniture');
        store.tools.furniture.focusSearch();
        return;
      }
      if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        store.group();
        return;
      }
      // The Wall tool owns Enter / Esc / Backspace while drawing (04).
      if (store.tools.active === 'wall' && ['Enter', 'Escape', 'Backspace', 'Delete'].includes(e.key)) {
        e.preventDefault();
        tool().onKey?.(e, ctx);
        return;
      }
      const key = e.key.toLowerCase();
      if (!mod && !e.altKey && key in TOOL_KEYS) {
        store.tools.setActive(TOOL_KEYS[key]!);
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        store.deleteSelection();
        return;
      }
      if (e.code === 'Space' && !spaceDown) {
        spaceDown = true;
        canvas.style.cursor = 'grab';
        e.preventDefault();
        return;
      }
      tool().onKey?.(e, ctx);
    };
    const keyup = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceDown = false;
        canvas.style.cursor = tool().cursor;
      }
    };
    // Losing focus mid-drag must not leave a half-applied edit behind.
    const blur = () => tool().cancel(ctx);
    const leave = () => tool().onPointerLeave?.(ctx);

    const [tDown, tMove, tUp] = [timed(down), timed(move), timed(up)];
    canvas.addEventListener('pointerdown', tDown);
    canvas.addEventListener('pointermove', tMove);
    canvas.addEventListener('pointerup', tUp);
    canvas.addEventListener('pointercancel', blur);
    canvas.addEventListener('pointerleave', leave);
    canvas.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', keydown);
    window.addEventListener('keyup', keyup);
    window.addEventListener('blur', blur);
    return () => {
      loop.stop();
      tool().cancel(ctx);
      canvas.removeEventListener('pointerdown', tDown);
      canvas.removeEventListener('pointermove', tMove);
      canvas.removeEventListener('pointerup', tUp);
      canvas.removeEventListener('pointercancel', blur);
      canvas.removeEventListener('pointerleave', leave);
      canvas.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', blur);
    };
  }, [store, tools]);

  // Content below, overlay (selection, guides, rulers, HUD marks) above: the overlay
  // redraws whole each frame so the content can repaint only its dirty regions.
  return (
    <>
      <canvas ref={canvasRef} className="block size-full touch-none" />
      <canvas ref={overlayRef} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
    </>
  );
}
