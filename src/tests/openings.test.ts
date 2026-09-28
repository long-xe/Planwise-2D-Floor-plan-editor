import { describe, expect, it } from 'vitest';
import type { Opening, Wall } from '../core/document';
import { hostWall } from '../core/structure';
import { openingShape } from '../geometry/openings';
import { boundsOf } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';

// Design px → metres: (px - origin) / 50, origin (446, 242) in frame 07.
const px = (x: number, y: number) => ({ x: (x - 446) / 50, y: (y - 242) / 50 });
const close = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 6);
  expect(a.y).toBeCloseTo(b.y, 6);
};

describe('openings', () => {
  const doc = createDemoDoc();
  const walls = doc.objects.filter((o): o is Wall => o.kind === 'wall');
  const openings = doc.objects.filter((o): o is Opening => o.kind === 'opening');
  const doors = openings.filter((o) => o.type === 'door').map((o) => openingShape(hostWall(doc, o)!, o).door!);

  it('the demo plan has the design’s 4 doors and 6 windows', () => {
    expect(openings.filter((o) => o.type === 'door')).toHaveLength(4);
    expect(openings.filter((o) => o.type === 'window')).toHaveLength(6);
    expect(openings.every((o) => hostWall(doc, o))).toBe(true);
  });

  it('entrance door: hinge on the inner face, leaf into the room, arc to the far jamb', () => {
    // Figma 20:820 leaf (458,302)→(498,302); 20:821 arc ends at (458,342).
    const d = doors.find((x) => Math.abs(x.hinge.x - 0.24) < 1e-9)!;
    close(d.hinge, px(458, 302));
    close(d.leafEnd, px(498, 302));
    close(d.closedEnd, px(458, 342));
  });

  it('a door hinged at the far jamb (bath) mirrors correctly', () => {
    // Figma 20:824 leaf (772,476)→(772,512); 20:825 arc ends at (736,476).
    const d = doors.find((x) => Math.abs(x.hinge.x - px(772, 0).x) < 1e-9)!;
    close(d.hinge, px(772, 476));
    close(d.leafEnd, px(772, 512));
    close(d.closedEnd, px(736, 476));
  });

  it('a window cut spans the full wall thickness', () => {
    const top = walls[0]!;
    const box = boundsOf(
      openingShape(
        top,
        openings.find((o) => o.wallId === top.id)!,
      ).cut,
    );
    // Figma 20:808: 516,242 180×12.
    close({ x: box.minX, y: box.minY }, px(516, 242));
    close({ x: box.maxX, y: box.maxY }, px(696, 254));
  });
});
