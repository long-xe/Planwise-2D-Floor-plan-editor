import type { Opening, Wall } from '../core/document';
import { findObject } from '../core/document';
import type { EditorStore } from '../core/store';
import { hostWall, wallLength, wallQuad } from '../core/structure';
import { EditObjectsCommand } from '../core/structureCommands';
import { slideOpening, snapAlong, translateWall } from '../core/structureEdit';
import { type Rect, boundsOf, unionRect } from '../geometry/vec';

/** Openings slide in 5 cm steps unless Alt (fine placement), like the furniture grid snap. */
const OPENING_STEP_M = 0.05;

/** Walls and openings in a move drag, as they were when it started. */
export interface StructureStarts {
  walls: Wall[];
  /** Openings whose wall isn't moving too (those ride along with it). */
  openings: { o: Opening; host: Wall }[];
}

export function structureStarts(store: EditorStore): StructureStarts {
  const walls: Wall[] = [];
  const openings: Opening[] = [];
  for (const id of store.selection) {
    const o = findObject(store.doc, id);
    if (o?.kind === 'wall') walls.push(structuredClone(o));
    if (o?.kind === 'opening') openings.push(structuredClone(o));
  }
  const moving = new Set(walls.map((w) => w.id));
  return {
    walls,
    openings: openings.flatMap((o) => {
      const host = hostWall(store.doc, o);
      return host && !moving.has(host.id) ? [{ o, host }] : [];
    }),
  };
}

/** Bounds of the moving walls, for snapping alongside furniture. */
export function movedWallBounds(s: StructureStarts, dx: number, dy: number): Rect | null {
  if (!s.walls.length) return null;
  return s.walls.map((w) => boundsOf(wallQuad(translateWall(w, dx, dy)))).reduce(unionRect);
}

/**
 * Walls translate; a lone opening slides along its wall by the drag's
 * component in the wall's direction, clamped inside it. `from` is the
 * drag-start snapshot, so undo returns exactly there.
 */
export function structureMoveCommand(
  s: StructureStarts,
  dx: number,
  dy: number,
  fine: boolean,
): EditObjectsCommand | null {
  const targets = [
    ...s.walls.map((w) => ({ from: w, to: translateWall(w, dx, dy) })),
    ...s.openings.map(({ o, host }) => {
      const len = wallLength(host) || 1;
      const along = (dx * (host.b.x - host.a.x) + dy * (host.b.y - host.a.y)) / len;
      const raw = o.offset + along;
      const offset = fine ? raw : snapAlong(host, raw, OPENING_STEP_M);
      return { from: o, to: slideOpening(o, host, offset) };
    }),
  ];
  return targets.length ? new EditObjectsCommand('Move', targets) : null;
}
