import type { Furniture } from '../core/document';
import { unitsBounds } from '../core/selection';
import type { EditorStore } from '../core/store';
import { screenLengthToWorld } from '../core/viewport';
import { type Handle, type Transform, localToWorld } from '../geometry/transform';
import type { Rect, Vec2 } from '../geometry/vec';

/** Screen distance from the top edge to the rotation knob (design: 29 px). */
export const ROTATE_KNOB_OFFSET_PX = 29;
/** Multi-selection box sits this far outside the union of the pieces (design 07). */
export const GROUP_BOX_PAD_PX = 6;

/** What the handles are attached to: one object's rotated box, or the selection's bounds. */
export type SelectionFrame = { kind: 'single'; f: Furniture } | { kind: 'multi'; box: Rect; padded: Rect };

export function selectionFrame(store: EditorStore): SelectionFrame | null {
  const sel = store.selectedFurniture;
  if (!sel.length) return null;
  if (sel.length === 1) return { kind: 'single', f: sel[0]! };
  const box = unitsBounds(store.units)!;
  const pad = screenLengthToWorld(store.viewport, GROUP_BOX_PAD_PX);
  return {
    kind: 'multi',
    box,
    padded: { minX: box.minX - pad, minY: box.minY - pad, maxX: box.maxX + pad, maxY: box.maxY + pad },
  };
}

export function rectAsTransform(r: Rect): Transform {
  return {
    x: (r.minX + r.maxX) / 2,
    y: (r.minY + r.maxY) / 2,
    w: r.maxX - r.minX,
    h: r.maxY - r.minY,
    rotation: 0,
    flipX: false,
  };
}

/** The transform the handles follow, in world units. */
export function frameTransform(frame: SelectionFrame): Transform {
  return frame.kind === 'single' ? frame.f.transform : rectAsTransform(frame.padded);
}

/** Where the rotation knob sits for a frame transform, in world units. */
export function rotateKnobPosition(store: EditorStore, t: Transform): Vec2 {
  const off = screenLengthToWorld(store.viewport, ROTATE_KNOB_OFFSET_PX);
  return localToWorld({ ...t, flipX: false }, { x: 0, y: -t.h / 2 - off });
}

const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'] as const;

export function handleCursor(h: Handle, rotation: number): string {
  const base: Record<Handle, number> = { e: 0, se: 45, s: 90, sw: 135, w: 180, nw: 225, n: 270, ne: 315 };
  const a = (((base[h] + rotation) % 180) + 180) % 180;
  return CURSORS[Math.round(a / 45) % 4]!;
}
