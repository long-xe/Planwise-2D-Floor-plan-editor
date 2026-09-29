import { describe, expect, it } from 'vitest';
import type { Wall } from '../core/document';
import { buildWallGraph, wallFaces, wallPolygon } from '../geometry/walls';
import type { Vec2 } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';

const wall = (id: string, a: Vec2, b: Vec2, t = 0.2, align?: Wall['align']): Wall => ({
  kind: 'wall',
  id,
  layerId: 'walls',
  a,
  b,
  thickness: t,
  ...(align ? { align } : {}),
});

const has = (poly: Vec2[], p: Vec2) => poly.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 1e-9);

describe('wall graph and joins', () => {
  it('an L corner mitres: both faces run on to meet exactly', () => {
    const a = wall('a', { x: 0, y: 0 }, { x: 4, y: 0 });
    const b = wall('b', { x: 4, y: 0 }, { x: 4, y: 3 });
    const g = buildWallGraph([a, b]);
    expect(g.joins.get('a:b')).toMatchObject({ kind: 'corner', other: b, otherEnd: 'a' });
    const pa = wallPolygon(a, g, true);
    const pb = wallPolygon(b, g, true);
    // Outer and inner corner points are shared by both walls: no notch, no overlap.
    for (const p of [
      { x: 4.1, y: -0.1 },
      { x: 3.9, y: 0.1 },
    ]) {
      expect(has(pa, p)).toBe(true);
      expect(has(pb, p)).toBe(true);
    }
    // Auto-join off: square ends.
    expect(has(wallPolygon(a, g, false), { x: 4, y: 0.1 })).toBe(true);
  });

  it('collinear walls keep square ends', () => {
    const a = wall('a', { x: 0, y: 0 }, { x: 2, y: 0 });
    const b = wall('b', { x: 2, y: 0 }, { x: 5, y: 0 });
    const g = buildWallGraph([a, b]);
    expect(has(wallPolygon(a, g, true), { x: 2, y: 0.1 })).toBe(true);
  });

  it('alignment puts the body on one side of the drawn line', () => {
    const w = wall('w', { x: 0, y: 0 }, { x: 3, y: 0 }, 0.2, 'inside');
    expect(wallFaces(w)).toEqual({ left: 0.2, right: 0 });
    expect(has(wallPolygon(w, null, false), { x: 0, y: 0.2 })).toBe(true);
    expect(has(wallPolygon(w, null, false), { x: 0, y: 0 })).toBe(true);
  });

  it('the demo plan: 4 mitred corners, T-junctions, 14 nodes, 4 closed rooms', () => {
    const walls = createDemoDoc().objects.filter((o): o is Wall => o.kind === 'wall');
    const g = buildWallGraph(walls);
    const kinds = [...g.joins.values()].map((j) => j.kind);
    expect(kinds.filter((k) => k === 'corner')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'T')).toHaveLength(8);
    expect(kinds.filter((k) => k === 'free')).toHaveLength(2);
    expect(g.nodes).toHaveLength(14);
    expect(g.rooms).toBe(4); // living + kitchen, study, bedroom, bath
    // The north-west corner closes on the outer (0,0) and inner (0.24,0.24) points.
    const north = walls.find((w) => w.name === 'Exterior · North')!;
    const west = walls.find((w) => w.name === 'Exterior · West')!;
    for (const p of [
      { x: 0, y: 0 },
      { x: 0.24, y: 0.24 },
    ]) {
      expect(has(wallPolygon(north, g, true), p)).toBe(true);
      expect(has(wallPolygon(west, g, true), p)).toBe(true);
    }
  });

  it('a T end sits on its host line as a graph node', () => {
    const host = wall('h', { x: 0, y: 0 }, { x: 6, y: 0 });
    const stem = wall('s', { x: 3, y: 0.1 }, { x: 3, y: 2 });
    const g = buildWallGraph([host, stem]);
    expect(g.joins.get('s:a')).toMatchObject({ kind: 'T', other: host, node: { x: 3, y: 0 } });
  });
});
