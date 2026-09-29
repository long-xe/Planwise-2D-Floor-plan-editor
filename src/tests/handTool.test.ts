import { describe, expect, it } from 'vitest';
import { EditorStore } from '../core/store';
import { createDemoDoc } from '../library/demoScene';
import { HandTool } from '../tools/HandTool';
import type { ToolContext, ToolPointerEvent } from '../tools/Tool';

const at = (x: number, y: number): ToolPointerEvent => ({
  screen: { x, y },
  world: { x: 0, y: 0 },
  shift: false,
  alt: false,
  meta: false,
  button: 0,
});

describe('Hand tool', () => {
  it('drags the view by the pointer delta, without touching the document or history', () => {
    const store = new EditorStore(createDemoDoc());
    const cursors: string[] = [];
    const ctx: ToolContext = { store, setCursor: (c) => cursors.push(c) };
    const hand = new HandTool();
    const { panX, panY } = store.viewport;
    hand.onPointerMove(at(100, 100), ctx); // hovering: no pan
    expect(store.viewport.panX).toBe(panX);
    hand.onPointerDown(at(100, 100), ctx);
    hand.onPointerMove(at(160, 70), ctx);
    hand.onPointerMove(at(130, 140), ctx);
    hand.onPointerUp(at(130, 140), ctx);
    expect(store.viewport).toMatchObject({ panX: panX + 30, panY: panY + 40 });
    expect(store.stack.undoDepth).toBe(0);
    expect(cursors).toEqual(['grab', 'grabbing', 'grab']);
    // After release, moving no longer pans.
    hand.onPointerMove(at(0, 0), ctx);
    expect(store.viewport.panX).toBe(panX + 30);
  });

  it('Esc goes back to Select', () => {
    const store = new EditorStore(createDemoDoc());
    store.tools.setActive('hand');
    // Tests run in Node (no DOM): the tool only reads `key`.
    new HandTool().onKey({ key: 'Escape' } as KeyboardEvent, { store, setCursor: () => {} });
    expect(store.tools.active).toBe('select');
  });
});
