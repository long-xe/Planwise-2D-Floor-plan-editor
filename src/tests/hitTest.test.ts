import { describe, expect, it } from 'vitest';
import { findLayer } from '../core/document';
import { HitIndex, marqueePick, pickAt } from '../core/picking';
import { SpatialHash } from '../core/spatialIndex';
import {
  pointInPolygon, polygonInsideRect, polygonIntersectsRect, rayCrossings,
} from '../geometry/hitTest';
import { aabbOf, footprintToWorld } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';

// World outline of the design's L-sofa (v0…v5).
const L: Vec2[] = [
  { x: 0.48, y: 2.0 }, { x: 3.68, y: 2.0 }, { x: 3.68, y: 2.92 },
  { x: 1.4, y: 2.92 }, { x: 1.4, y: 4.4 }, { x: 0.48, y: 4.4 },
];
const square = (x: number, y: number, s = 1): Vec2[] => [
  { x, y }, { x: x + s, y }, { x: x + s, y: y + s }, { x, y: y + s },
];

describe('point in polygon (even-odd)', () => {
  it('the L-sofa crook is inside the bbox but outside the shape: 2 crossings', () => {
    const crook = { x: 2.32, y: 3.68 };
    expect(pointInPolygon(crook, L)).toBe(false);
    expect(rayCrossings(crook, L)).toHaveLength(2);
    // On the seat arm the ray crosses once.
    expect(pointInPolygon({ x: 1.0, y: 3.68 }, L)).toBe(true);
    expect(rayCrossings({ x: 1.0, y: 3.68 }, L)).toHaveLength(1);
  });

  it('a point on a shared edge belongs to exactly one of two neighbours', () => {
    const a = square(0, 0);
    const b = square(1, 0);
    for (const y of [0.25, 0.5, 0.75]) {
      const p = { x: 1, y };
      expect(Number(pointInPolygon(p, a)) + Number(pointInPolygon(p, b))).toBe(1);
    }
  });

  it('a ray through a vertex counts it once', () => {
    const diamond = [{ x: 0, y: -1 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 0 }];
    // The ray from (2, 0) runs through vertices (1,0) and (-1,0).
    expect(pointInPolygon({ x: 2, y: 0 }, diamond)).toBe(false);
    expect(pointInPolygon({ x: 0.5, y: 0 }, diamond)).toBe(true);
  });

  it('rotated shapes: the corner of the AABB is outside the polygon', () => {
    const t = { x: 0, y: 0, w: 2, h: 2, rotation: 45, flipX: false };
    const poly = footprintToWorld(t, square(-0.5, -0.5));
    const box = aabbOf(t);
    expect(pointInPolygon({ x: box.maxX - 0.05, y: box.maxY - 0.05 }, poly)).toBe(false);
    expect(pointInPolygon({ x: 0.9, y: 0 }, poly)).toBe(true);
  });
});

describe('marquee', () => {
  it('intersect vs contain', () => {
    const r = { minX: 0, minY: 0, maxX: 2, maxY: 3 };
    expect(polygonIntersectsRect(L, r)).toBe(true);
    expect(polygonInsideRect(L, r)).toBe(false);
    expect(polygonInsideRect(L, { minX: 0, minY: 1, maxX: 4, maxY: 5 })).toBe(true);
  });

  it('intersect catches a crossing with no vertex inside either shape', () => {
    const thin = [{ x: -5, y: -0.1 }, { x: 5, y: -0.1 }, { x: 5, y: 0.1 }, { x: -5, y: 0.1 }];
    expect(polygonIntersectsRect(thin, { minX: -1, minY: -1, maxX: 1, maxY: 1 })).toBe(true);
    expect(polygonIntersectsRect(thin, { minX: -1, minY: 0.5, maxX: 1, maxY: 1 })).toBe(false);
  });
});

describe('hit pipeline on the demo scene', () => {
  const crook = { x: 1.6, y: 3.05 };

  it('clicking the crook selects the rug underneath, not the sofa', () => {
    const doc = createDemoDoc();
    const r = pickAt(new HitIndex(doc), crook);
    const name = (id: string | null) => doc.objects.find((o) => o.id === id && o.kind === 'furniture');
    expect(name(r.id)).toMatchObject({ name: 'Rug 2.4 × 1.6' });
    expect(r.candidates).toBeGreaterThanOrEqual(2);
    expect(r.polygonTests).toBe(2);
    expect(r.tested[0]).toMatchObject({ inside: false });
    expect(name(r.tested[0]!.id)).toMatchObject({ name: 'L-Sofa — corner' });
  });

  it('bbox mode lets the sofa steal the same click', () => {
    const doc = createDemoDoc();
    const r = pickAt(new HitIndex(doc), crook, 'bbox');
    expect(doc.objects.find((o) => o.id === r.id)).toMatchObject({ name: 'L-Sofa — corner' });
    expect(r.polygonTests).toBe(0);
  });

  it('paint order decides priority: the sofa arm wins over the rug below it', () => {
    const doc = createDemoDoc();
    const r = pickAt(new HitIndex(doc), { x: 1.0, y: 3.0 });
    expect(doc.objects.find((o) => o.id === r.id)).toMatchObject({ name: 'L-Sofa — corner' });
  });

  it('hidden and locked layers are invisible to picking and marquee', () => {
    for (const rule of ['visible', 'locked'] as const) {
      const doc = createDemoDoc();
      const layer = findLayer(doc, 'furniture')!;
      if (rule === 'visible') layer.visible = false;
      else layer.locked = true;
      const index = new HitIndex(doc);
      expect(pickAt(index, crook).id).toBeNull();
      expect(marqueePick(index, { minX: 0, minY: 0, maxX: 12, maxY: 9 }, 'intersect')).toEqual([]);
    }
  });

  it('marquee: contain is a subset of intersect', () => {
    const index = new HitIndex(createDemoDoc());
    const living = { minX: 0.3, minY: 1.5, maxX: 5.2, maxY: 4.5 };
    const inter = marqueePick(index, living, 'intersect');
    const contain = marqueePick(index, living, 'contain');
    expect(contain.length).toBeLessThan(inter.length);
    expect(contain.every((id) => inter.includes(id))).toBe(true);
  });
});

describe('spatial hash', () => {
  it('point queries read one 2 m cell; rect queries de-duplicate', () => {
    const h = new SpatialHash(2);
    h.insert('a', { minX: 0.5, minY: 0.5, maxX: 1, maxY: 1 });
    h.insert('b', { minX: 1.5, minY: 1.5, maxX: 2.5, maxY: 2.5 });
    expect([...h.queryPoint({ x: 0.1, y: 0.1 })].sort()).toEqual(['a', 'b']);
    expect([...h.queryPoint({ x: 3, y: 3 })]).toEqual(['b']);
    expect([...h.queryRect({ minX: 0, minY: 0, maxX: 4, maxY: 4 })].sort()).toEqual(['a', 'b']);
  });
});
