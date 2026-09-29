import { describe, expect, it } from 'vitest';
import type { Wall } from '../core/document';
import { allowedAngles, snapWallPoint } from '../core/wallSnap';

const host: Wall = { kind: 'wall', id: 'h', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thickness: 0.16 };
const base = { walls: [host], tolerance: 0.24, grid: 0.2, options: [0, 45, 90] as const, free: false };

describe('wall snapping (04)', () => {
  it('angle options become directions', () => {
    expect(allowedAngles([0, 90])).toEqual([0, 90, 180, 270]);
    expect(allowedAngles([45])).toEqual([0, 45, 90, 135, 180, 225, 270, 315]);
    expect(allowedAngles([15])).toHaveLength(24);
  });

  it('snaps a near-horizontal drag to 0° and its end to the grid', () => {
    const r = snapWallPoint({ ...base, from: { x: 8, y: 3.8 }, pointer: { x: 10.63, y: 3.71 } });
    expect(r.kind).toBe('grid');
    expect(r.snapped).toBe(true);
    expect(r.angle).toBe(0);
    expect(r.point.x).toBeCloseTo(10.6, 9);
    expect(r.point.y).toBeCloseTo(3.8, 9);
  });

  it('Shift keeps the free angle (still on the grid)', () => {
    const r = snapWallPoint({ ...base, free: true, from: { x: 1, y: 1 }, pointer: { x: 3.13, y: 2.31 } });
    expect(r.snapped).toBe(false);
    expect(r.point).toEqual({ x: 3.2, y: 2.4 });
  });

  it('existing endpoints win within the tolerance', () => {
    const r = snapWallPoint({ ...base, from: { x: 3, y: 3 }, pointer: { x: 9.9, y: 0.1 } });
    expect(r).toMatchObject({ kind: 'endpoint', point: { x: 10, y: 0 } });
  });

  it('a segment ending near a wall lands on its line (T-junction)', () => {
    const r = snapWallPoint({ ...base, from: { x: 4, y: 3 }, pointer: { x: 4.02, y: 0.15 } });
    expect(r.kind).toBe('wall');
    expect(r.point.x).toBeCloseTo(4, 9);
    expect(r.point.y).toBeCloseTo(0, 9);
  });

  it('the first point snaps to the grid, or onto a wall', () => {
    expect(snapWallPoint({ ...base, from: null, pointer: { x: 2.33, y: 5.07 } }).point).toEqual({ x: 2.4, y: 5 });
    expect(snapWallPoint({ ...base, from: null, pointer: { x: 2.33, y: 0.1 } })).toMatchObject({ kind: 'wall' });
  });
});
