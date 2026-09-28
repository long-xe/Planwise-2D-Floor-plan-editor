import { describe, expect, it } from 'vitest';
import { CommandStack } from '../core/commandStack';
import { cloneDoc, findObject, type Opening, type Wall } from '../core/document';
import { editObjectsCommand, wallWithOpenings } from '../core/editActions';
import { openingsOf } from '../core/structure';
import {
  MIN_OPENING_M,
  moveJamb,
  moveWallEnd,
  setWallLength,
  snapAlong,
  slideOpening,
  translateWall,
} from '../core/structureEdit';
import { createDemoDoc } from '../library/demoScene';

const wall: Wall = { kind: 'wall', id: 'w', layerId: 'walls', a: { x: 0, y: 0 }, b: { x: 10, y: 0 }, thickness: 0.2 };
const door: Opening = { kind: 'opening', id: 'd', layerId: 'walls', wallId: 'w', type: 'door', offset: 3, width: 0.8 };

describe('wall and opening edits', () => {
  it('slides an opening but never off its wall', () => {
    expect(slideOpening(door, wall, 5).offset).toBe(5);
    expect(slideOpening(door, wall, -2).offset).toBe(0);
    expect(slideOpening(door, wall, 12).offset).toBeCloseTo(9.2, 9);
  });

  it('drags one jamb; the other stays, with a minimum width', () => {
    const wider = moveJamb(door, wall, 'end', 4.5);
    expect([wider.offset, wider.width]).toEqual([3, 1.5]);
    const fromStart = moveJamb(door, wall, 'start', 2.5);
    expect(fromStart.offset).toBe(2.5);
    expect(fromStart.offset + fromStart.width).toBeCloseTo(3.8, 9);
    expect(moveJamb(door, wall, 'start', 3.7).width).toBeCloseTo(MIN_OPENING_M, 9);
  });

  it('snaps along a wall to the world grid, not to steps from its start', () => {
    const offsetWall: Wall = { ...wall, a: { x: 0.24, y: 0 } };
    expect(0.24 + snapAlong(offsetWall, 4.36, 0.05)).toBeCloseTo(4.6, 9);
    expect(0.24 + snapAlong(offsetWall, 4.34, 0.05)).toBeCloseTo(4.6, 9);
  });

  it('wall ends: length edits keep the direction; too short is refused', () => {
    expect(setWallLength(wall, 4).b).toEqual({ x: 4, y: 0 });
    expect(moveWallEnd(wall, 'b', { x: 0.1, y: 0 })).toBe(wall);
  });

  it('dragging end a keeps doors where they were on the plan', () => {
    const doc = createDemoDoc();
    const left = findObject(doc, 'w_3') as Wall; // (0.12, 0) → (0.12, 8.4), door at 1.2
    const moved = moveWallEnd(left, 'a', { x: 0.12, y: 1 });
    const [, entrance] = wallWithOpenings(doc, left, moved) as [Wall, Opening];
    expect(entrance.type).toBe('door');
    expect(entrance.offset).toBeCloseTo(0.2, 9); // still at y = 1.2 on the plan
  });

  it('moving a wall is one undoable command; its openings move with it', () => {
    const doc = createDemoDoc();
    const stack = new CommandStack(doc, () => {});
    doc.layers.find((l) => l.id === 'walls')!.locked = false;
    const before = cloneDoc(doc);
    const left = findObject(doc, 'w_3') as Wall;
    const openings = openingsOf(doc, 'w_3').map((o) => ({ ...o }));
    expect(stack.execute(editObjectsCommand(doc, 'MoveWall', [translateWall(left, 0.4, 0)])!)).toBe(true);
    expect((findObject(doc, 'w_3') as Wall).a.x).toBeCloseTo(0.52, 9);
    expect(openingsOf(doc, 'w_3')).toEqual(openings); // offsets are relative to the wall
    stack.undo();
    expect(doc).toEqual(before);
  });

  it('locked walls reject edits', () => {
    const doc = createDemoDoc();
    const stack = new CommandStack(doc, () => {});
    const left = findObject(doc, 'w_3') as Wall;
    expect(stack.execute(editObjectsCommand(doc, 'MoveWall', [translateWall(left, 1, 0)])!)).toBe(false);
  });
});
