import type { Announcements, CollisionDetection, UniqueIdentifier } from '@dnd-kit/core';

/**
 * "Insert into the gap" rather than "take that card's slot": the target is
 * how many other cards have their centre above the lifted card's centre.
 * The list doesn't shift while dragging, so this is what the drop line
 * shows. Reported as the card currently at that index, which is exactly
 * what arrayMove / ReorderLayer expect.
 */
export const insertionCollision: CollisionDetection = ({
  active,
  collisionRect,
  droppableRects,
  droppableContainers,
}) => {
  const cards = droppableContainers
    .map((c) => ({ id: c.id, r: droppableRects.get(c.id) }))
    .filter((c): c is { id: UniqueIdentifier; r: NonNullable<typeof c.r> } => !!c.r)
    .toSorted((a, b) => a.r.top - b.r.top);
  const cy = collisionRect.top + collisionRect.height / 2;
  let to = 0;
  for (const c of cards) if (c.id !== active.id && cy > c.r.top + c.r.height / 2) to++;
  const target = cards[to];
  return target ? [{ id: target.id }] : [];
};

/** Screen-reader messages that name layers instead of reading out their ids. */
export function layerAnnouncements(nameOf: (id: string) => string): Announcements {
  const name = (id: UniqueIdentifier) => nameOf(String(id));
  return {
    onDragStart: ({ active }) => `Picked up layer ${name(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `Layer ${name(active.id)} moved to the position of ${name(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over ? `Layer ${name(active.id)} dropped at the position of ${name(over.id)}.` : undefined,
    onDragCancel: ({ active }) => `Reordering of layer ${name(active.id)} cancelled.`,
  };
}
