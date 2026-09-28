import type { Doc, Furniture, Layer, Wall } from '../core/document';
import { RECT_FOOTPRINT, ellipseFootprint } from '../core/document';

// "Harbor St. Residence — Unit 4B", reconstructed from the Figma frame
// (06 · Editor — Transform & Snap): drawing px / 50 = metres, origin at the
// exterior wall corner.

const layer = (
  id: string, name: string, color: string, order: number, locked = false,
): Layer => ({
  id, name, color, order, locked,
  visible: true, opacity: 1, includeInPrint: true, snapTargets: true, cacheAsStatic: locked,
});

let seq = 200;
const nextId = () => `f_${String(seq++).padStart(4, '0')}`;

function item(
  name: string, icon: Furniture['icon'], x: number, y: number, w: number, h: number,
  opts: { rotation?: number; round?: boolean; id?: string; fill?: string } = {},
): Furniture {
  return {
    kind: 'furniture',
    id: opts.id ?? nextId(),
    layerId: 'furniture',
    name,
    icon,
    transform: { x, y, w, h, rotation: opts.rotation ?? 0, flipX: false },
    footprint: opts.round ? ellipseFootprint() : RECT_FOOTPRINT,
    appearance: { fill: opts.fill ?? '#EDE7DA', fillOpacity: 1, stroke: '#1B2A41', strokeWidth: 1.25 },
  };
}

let wallSeq = 1;
function wall(ax: number, ay: number, bx: number, by: number, thickness: number): Wall {
  return { kind: 'wall', id: `w_${wallSeq++}`, layerId: 'walls', a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness };
}

export function createDemoDoc(): Doc {
  seq = 200;
  wallSeq = 1;
  const walls = [
    wall(0, 0.12, 12, 0.12, 0.24),
    wall(0, 8.28, 12, 8.28, 0.24),
    wall(0.12, 0, 0.12, 8.4, 0.24),
    wall(11.88, 0, 11.88, 8.4, 0.24),
    wall(8, 0.24, 8, 0.8, 0.16),
    wall(8, 3.4, 8, 8.16, 0.16),
    wall(5, 4.68, 5, 8.16, 0.16),
    wall(0.24, 4.6, 7.92, 4.6, 0.16),
    wall(8.08, 3.8, 11.76, 3.8, 0.16),
  ];

  const furniture: Furniture[] = [
    item('Sofa — 3 seat', 'sofa', 3.48, 3.76, 3.6, 1.04),
    item('Armchair', 'sofa', 0.92, 2.52, 0.88, 0.88),
    item('Coffee table', 'desk', 3.48, 2.54, 1.6, 0.76, { fill: '#F3EEE3' }),
    item('Dining set · 6', 'desk', 6.86, 2.32, 1.0, 2.08),
    item('Bed — King', 'bed', 2.4, 6.4, 1.8, 2.2, { rotation: 30, id: 'f_0217' }),
    item('Nightstand', 'desk', 0.58, 5.02, 0.44, 0.44),
    item('Nightstand', 'desk', 2.98, 5.02, 0.44, 0.44),
    item('Wardrobe', 'desk', 4.42, 6.92, 0.84, 2.24),
    item('Desk + chair', 'desk', 10.16, 7.68, 2.56, 0.8),
    item('Bookshelf', 'desk', 8.38, 7.0, 0.44, 2.0),
    item('Bathtub', 'bath', 7.48, 7.04, 0.72, 2.08),
    item('Toilet', 'bath', 5.5, 7.7, 0.52, 0.84),
    item('TV console', 'desk', 3.4, 0.46, 2.4, 0.28),
    item('Kitchen counter', 'desk', 9.92, 0.54, 3.68, 0.6),
    item('Kitchen counter', 'desk', 11.46, 1.96, 0.6, 2.24),
    item('Kitchen island', 'desk', 9.76, 2.24, 1.84, 0.8),
    item('Study armchair', 'sofa', 11.12, 4.44, 0.8, 0.8),
    item('Basin', 'bath', 5.42, 5.26, 0.52, 0.76),
    item('Plant', 'desk', 0.72, 0.72, 0.56, 0.56, { round: true }),
    item('Plant', 'desk', 7.48, 4.12, 0.44, 0.44, { round: true }),
    item('Plant', 'desk', 11.32, 5.8, 0.4, 0.4, { round: true }),
    item('Desk chair', 'desk', 10.16, 7.04, 0.36, 0.36, { round: true }),
  ];
  for (const [x, y] of [[6.18, 1.63], [6.18, 2.32], [6.18, 3.01], [7.54, 1.63], [7.54, 2.32], [7.54, 3.01]] as const) {
    furniture.push(item('Dining chair', 'desk', x, y, 0.28, 0.36));
  }

  return {
    name: 'Harbor St. Residence — Unit 4B',
    // Top of the Layers panel first; `order` is paint order (0 paints first).
    layers: [
      layer('annotations', 'Annotations', '#E0A526', 3),
      layer('furniture', 'Furniture', '#D9623B', 2),
      layer('walls', 'Walls', '#1B2A41', 1, true),
      layer('grid', 'Grid & guides', '#C9D5E6', 0),
    ],
    objects: [...walls, ...furniture],
  };
}
