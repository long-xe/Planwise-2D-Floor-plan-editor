import type { Doc, Furniture, Layer, Opening, Wall } from '../core/document';
import { RECT_FOOTPRINT, ellipseFootprint } from '../core/document';
import type { Vec2 } from '../geometry/vec';
import { createElectrical } from './electrical';
import { roomAt } from './rooms';

// "Harbor St. Residence — Unit 4B", reconstructed from the Figma frames
// (06 Transform & Snap, 07 Multi-select — living room follows 07, 08 adds
// the Electrical layer): drawing px / 50 = metres, origin at the exterior
// wall corner.

const layer = (id: string, name: string, color: string, order: number, locked = false, opacity = 1): Layer => ({
  id,
  name,
  color,
  order,
  locked,
  opacity,
  visible: true,
  includeInPrint: true,
  snapTargets: true,
  cacheAsStatic: locked,
});

// Auto ids start clear of the design's fixed ones (the bed is f_0217).
let seq = 300;
const nextId = () => `f_${String(seq++).padStart(4, '0')}`;

function item(
  name: string,
  icon: Furniture['icon'],
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    rotation?: number;
    round?: boolean;
    id?: string;
    fill?: string;
    footprint?: Vec2[];
    rug?: boolean;
    groupId?: string;
  } = {},
): Furniture {
  const f: Furniture = {
    kind: 'furniture',
    id: opts.id ?? nextId(),
    layerId: 'furniture',
    name,
    icon,
    transform: { x, y, w, h, rotation: opts.rotation ?? 0, flipX: false },
    footprint: opts.footprint ?? (opts.round ? ellipseFootprint() : RECT_FOOTPRINT),
    appearance: opts.rug
      ? { fill: '#E9E1CF', fillOpacity: 0.55, stroke: '#B3ADA3', strokeWidth: 1, dashed: true }
      : { fill: opts.fill ?? '#EDE7DA', fillOpacity: 1, stroke: '#1B2A41', strokeWidth: 1.25 },
  };
  if (opts.groupId) f.groupId = opts.groupId;
  const room = roomAt(f.transform);
  if (room) f.room = room;
  return f;
}

/**
 * Corner sofa from the design (v0…v5): back along the top, seat arm down
 * the left, leaving an empty crook bottom-right. Unit space, 3.2 × 2.4 m.
 */
const L_SOFA: Vec2[] = [
  { x: -0.5, y: -0.5 },
  { x: 0.5, y: -0.5 },
  { x: 0.5, y: -0.28 / 2.4 },
  { x: -0.68 / 3.2, y: -0.28 / 2.4 },
  { x: -0.68 / 3.2, y: 0.5 },
  { x: -0.5, y: 0.5 },
];

function tagRoom(f: Furniture): Furniture {
  const room = roomAt(f.transform);
  return room ? { ...f, room } : f;
}

let wallSeq = 1;
type OpeningSpec = Pick<Opening, 'type' | 'offset' | 'width' | 'hinge' | 'swing'>;

/** Openings are collected as walls are declared, so each sits next to its host below. */
let openings: Opening[] = [];

function wall(
  name: string,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  thickness: number,
  cuts: OpeningSpec[] = [],
): Wall {
  const id = `w_${wallSeq++}`;
  for (const c of cuts) {
    openings.push({
      kind: 'opening',
      id: `o_${String(openings.length + 1).padStart(2, '0')}`,
      layerId: 'walls',
      wallId: id,
      ...c,
    });
  }
  return { kind: 'wall', id, layerId: 'walls', name, a: { x: ax, y: ay }, b: { x: bx, y: by }, thickness, height: 2.7 };
}

const pane = (offset: number, width: number): OpeningSpec => ({ type: 'window', offset, width });
const door = (offset: number, width: number, hinge: 'start' | 'end', swing: 1 | -1): OpeningSpec => ({
  type: 'door',
  offset,
  width,
  hinge,
  swing,
});

export function createDemoDoc(): Doc {
  seq = 300;
  wallSeq = 1;
  openings = [];
  const walls = [
    // Exterior walls meet at shared centreline corners so they mitre (04).
    // Doors and windows from the design (openings 20:804–827), offsets along each wall from `a`.
    wall('Exterior · North', 0.12, 0.12, 11.88, 0.12, 0.24, [pane(1.28, 3.6), pane(8.68, 2.4)]),
    wall('Exterior · South', 0.12, 8.28, 11.88, 8.28, 0.24, [pane(1.08, 2.6), pane(5.68, 1.0)]),
    wall('Exterior · West', 0.12, 0.12, 0.12, 8.28, 0.24, [door(1.08, 0.8, 'start', -1), pane(2.28, 1.4)]),
    wall('Exterior · East', 11.88, 0.12, 11.88, 8.28, 0.24, [pane(4.88, 2.4)]),
    wall('Living / Kitchen', 8, 0.24, 8, 0.8, 0.16),
    wall('Living / Study', 8, 3.4, 8, 8.16, 0.16, [door(1.6, 0.8, 'start', -1)]),
    wall('Bedroom / Bath', 5, 4.68, 5, 8.16, 0.16),
    wall('Living / Bedroom', 0.24, 4.6, 7.92, 4.6, 0.16, [door(3.16, 0.8, 'start', 1), door(5.56, 0.72, 'end', 1)]),
    wall('Kitchen / Study', 8.08, 3.8, 11.76, 3.8, 0.16),
  ];

  // Listed top-down as in the Layers panel (07): the first entry paints last,
  // so the L-sofa sits above the rug that shows through its crook.
  const dining = { groupId: 'g_0001' };
  const furniture: Furniture[] = [
    item('L-Sofa — corner', 'sofa', 2.08, 3.2, 3.2, 2.4, { footprint: L_SOFA }),
    item('Coffee table', 'desk', 2.62, 3.56, 1.4, 0.72, { fill: '#F3EEE3' }),
    item('Armchair', 'sofa', 4.68, 3.44, 0.88, 0.88),
    item('Dining table', 'desk', 6.86, 2.32, 1.0, 2.08, { fill: '#F3EEE3', ...dining }),
    ...(
      [
        [6.18, 1.63],
        [6.18, 2.32],
        [6.18, 3.01],
        [7.54, 1.63],
        [7.54, 2.32],
        [7.54, 3.01],
      ] as const
    ).map(([x, y]) => item('Dining chair', 'desk', x, y, 0.28, 0.36, { fill: '#F3EEE3', ...dining })),
    item('TV unit', 'desk', 3.4, 0.46, 2.4, 0.28),
    item('Rug 2.4 × 1.6', 'desk', 3.5, 2.76, 4.6, 2.16, { rug: true }),
    item('Plant · fiddle leaf', 'plant', 0.72, 0.72, 0.56, 0.56, { round: true }),
    item('Kitchen island', 'desk', 9.76, 2.24, 1.84, 0.8),
    item('Bed — King', 'bed', 2.4, 6.4, 1.8, 2.2, { rotation: 30, id: 'f_0217' }),
    item('Wardrobe', 'desk', 4.42, 6.92, 0.84, 2.24),
    item('Desk + chair', 'desk', 10.16, 7.68, 2.56, 0.8),
    item('Nightstand', 'desk', 0.58, 5.02, 0.44, 0.44),
    item('Nightstand', 'desk', 2.98, 5.02, 0.44, 0.44),
    item('Bookshelf', 'desk', 8.38, 7.0, 0.44, 2.0),
    item('Bathtub', 'bath', 7.48, 7.04, 0.72, 2.08),
    item('Toilet', 'bath', 5.5, 7.7, 0.52, 0.84),
    item('Basin', 'bath', 5.42, 5.26, 0.52, 0.76),
    item('Kitchen counter', 'desk', 9.92, 0.54, 3.68, 0.6),
    item('Kitchen counter', 'desk', 11.46, 1.96, 0.6, 2.24),
    item('Study armchair', 'sofa', 11.12, 4.44, 0.8, 0.8),
    item('Plant', 'plant', 7.48, 4.12, 0.44, 0.44, { round: true }),
    item('Plant', 'plant', 11.32, 5.8, 0.4, 0.4, { round: true }),
    item('Desk chair', 'desk', 10.16, 7.04, 0.36, 0.36, { round: true }),
  ];

  return {
    name: 'Harbor St. Residence — Unit 4B',
    // Top of the Layers panel first; `order` is paint order (0 paints first).
    layers: [
      layer('annotations', 'Annotations', '#E0A526', 4),
      // Custom layer from the design (08), drawn at 80 %.
      layer('electrical', 'Electrical', '#2F5DA8', 3, false, 0.8),
      layer('furniture', 'Furniture', '#D9623B', 2),
      layer('walls', 'Walls', '#1B2A41', 1, true),
      layer('grid', 'Grid & guides', '#C9D5E6', 0),
    ],
    groups: [{ id: 'g_0001', name: 'Dining set · 6' }],
    objects: [...walls, ...openings, ...furniture.toReversed(), ...createElectrical().map(tagRoom)],
  };
}
