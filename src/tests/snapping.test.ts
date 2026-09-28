import { describe, expect, it } from 'vitest';
import { DEFAULT_SNAP, snapAngle, snapBox } from '../core/snapping';
import type { Rect } from '../geometry/vec';

const box = (minX: number, minY: number, w: number, h: number): Rect => ({ minX, minY, maxX: minX + w, maxY: minY + h });
const none = { objects: [], walls: [] };

describe('snapping', () => {
  it('snaps angles to each step', () => {
    expect(snapAngle(37, 15)).toBe(30);
    expect(snapAngle(38, 15)).toBe(45);
    expect(snapAngle(37, 5)).toBe(35);
    expect(snapAngle(50, 90)).toBe(90);
  });

  it('grid snaps the centre to 20 cm', () => {
    const r = snapBox(box(1.03, 2.11, 1, 1), none, DEFAULT_SNAP, 0.16);
    expect(1.53 + r.dx).toBeCloseTo(1.6, 9);
    expect(2.61 + r.dy).toBeCloseTo(2.6, 9);
    expect(r.guides).toHaveLength(0);
  });

  it('smart guides beat the grid and report a guide line', () => {
    const other = box(3.05, 0, 1, 1);
    const r = snapBox(box(3.0, 5, 1, 1), { objects: [other], walls: [] }, DEFAULT_SNAP, 0.16);
    expect(r.dx).toBeCloseTo(0.05, 9);
    expect(r.guides[0]).toMatchObject({ axis: 'x', kind: 'edge' });
  });

  it('walls: object face butts against the wall face', () => {
    const wall = box(0, 0, 0.24, 8);
    const r = snapBox(box(0.3, 3, 1, 1), { objects: [], walls: [wall] }, DEFAULT_SNAP, 0.16);
    expect(0.3 + r.dx).toBeCloseTo(0.24, 9);
    expect(r.guides[0]?.kind).toBe('wall');
  });

  it('ignores targets outside tolerance and respects toggles', () => {
    const other = box(3.5, 0, 1, 1);
    const off = { ...DEFAULT_SNAP, grid: false };
    expect(snapBox(box(3.0, 5, 1, 1), { objects: [other], walls: [] }, off, 0.16).dx).toBe(0);
    const noGuides = { ...off, smartGuides: false };
    expect(snapBox(box(3.45, 5, 1, 1), { objects: [other], walls: [] }, noGuides, 0.16).dx).toBe(0);
  });
});
