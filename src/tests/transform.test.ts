import { describe, expect, it } from 'vitest';
import {
  type Transform, aabbOf, handlePosition, localToWorld, resizeFromHandle, rotateTransform, worldToLocal,
} from '../geometry/transform';

const bed: Transform = { x: 2.4, y: 6.4, w: 1.8, h: 2.2, rotation: 30, flipX: false };

describe('transform geometry', () => {
  it('local <-> world round trips, including flip', () => {
    for (const t of [bed, { ...bed, flipX: true }, { ...bed, rotation: 137 }]) {
      const p = { x: 0.3, y: -0.7 };
      const back = worldToLocal(t, localToWorld(t, p));
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('matches the design bbox for the rotated bed (2.66 × 2.81 m)', () => {
    const r = aabbOf(bed);
    expect(r.maxX - r.minX).toBeCloseTo(2.66, 2);
    expect(r.maxY - r.minY).toBeCloseTo(2.81, 2);
  });

  it('resize keeps the opposite corner fixed at any rotation', () => {
    const anchor = handlePosition(bed, 'nw');
    const dragTo = localToWorld(bed, { x: 1.4, y: 1.6 });
    const out = resizeFromHandle(bed, 'se', dragTo, false);
    const after = handlePosition(out, 'nw');
    expect(after.x).toBeCloseTo(anchor.x, 9);
    expect(after.y).toBeCloseTo(anchor.y, 9);
    expect(out.w).toBeCloseTo(2.3, 9);
    expect(out.h).toBeCloseTo(2.7, 9);
  });

  it('edge handle changes one dimension only', () => {
    const out = resizeFromHandle(bed, 'e', localToWorld(bed, { x: 1.5, y: 0.4 }), false);
    expect(out.w).toBeCloseTo(2.4, 9);
    expect(out.h).toBe(bed.h);
  });

  it('lock aspect scales both sides by the same factor', () => {
    const out = resizeFromHandle(bed, 'e', localToWorld(bed, { x: 1.8, y: 0 }), true);
    expect(out.w / out.h).toBeCloseTo(bed.w / bed.h, 9);
    expect(out.w).toBeCloseTo(2.7, 9);
  });

  it('never inverts past the anchor', () => {
    const out = resizeFromHandle(bed, 'se', localToWorld(bed, { x: -5, y: -5 }), false);
    expect(out.w).toBeGreaterThan(0);
    expect(out.h).toBeGreaterThan(0);
  });

  it('rotating about the own centre keeps X/Y and wraps rotation', () => {
    const out = rotateTransform(bed, { x: bed.x, y: bed.y }, 345);
    expect(out.x).toBeCloseTo(bed.x, 9);
    expect(out.y).toBeCloseTo(bed.y, 9);
    expect(out.rotation).toBeCloseTo(15, 9);
  });
});
