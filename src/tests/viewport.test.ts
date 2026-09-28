import { describe, expect, it } from 'vitest';
import { createViewport, screenToWorld, worldToScreen } from '../core/viewport';

describe('viewport', () => {
  it('round-trips world <-> screen at various zoom/pan', () => {
    for (const zoom of [0.1, 0.5, 1, 2.5, 8]) {
      const v = { ...createViewport(), zoom, panX: 123.4, panY: -56.7 };
      const p = { x: 2.4, y: 6.4 };
      const back = screenToWorld(v, worldToScreen(v, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });
});
