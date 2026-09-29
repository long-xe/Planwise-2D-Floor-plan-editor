import { type Spec, ellipse, line, rect } from './catalogShapes';

// Pieces the plan uses that the Library grid doesn't list, drawn the way
// the design 05 canvas draws them (nodes 19:93–19:124, 50 px = 1 m). Each
// is laid out with its back (the side against a wall, or a chair's
// backrest) at the top, like every other symbol.

/** Kitchen and dining, bedroom and office extras. */
export const EXTRAS: Spec[] = [
  {
    id: 'dining-table',
    name: 'Dining table',
    category: 'kitchen',
    w: 1.0,
    d: 2.08,
    icon: 'desk',
    box: [764, 306, 50, 104],
    parts: [rect(764, 306, 50, 104, { r: 3 })],
    fill: '#F3EEE3',
  },
  {
    // Design: 14 × 18 seat, 2.5 px backrest 2 px in from the outer edge.
    id: 'dining-chair',
    name: 'Dining chair',
    category: 'kitchen',
    w: 0.36,
    d: 0.28,
    icon: 'desk',
    box: [0, 0, 18, 14],
    parts: [rect(0, 0, 18, 14, { r: 3 }), line(2, 2, 16, 2, 2.5)],
    fill: '#F3EEE3',
  },
  {
    id: 'kitchen-island',
    name: 'Island',
    title: 'Kitchen island',
    category: 'kitchen',
    w: 1.84,
    d: 0.8,
    icon: 'desk',
    box: [888, 334, 92, 40],
    parts: [rect(888, 334, 92, 40, { r: 1 })],
    fill: '#E5DFD2',
  },
  {
    id: 'counter-sink',
    name: 'Sink counter',
    title: 'Kitchen counter · sink',
    category: 'kitchen',
    w: 3.68,
    d: 0.6,
    icon: 'desk',
    box: [850, 254, 184, 30],
    parts: [
      rect(850, 254, 184, 30, { r: 1 }),
      rect(908, 258, 44, 22, { r: 2, fill: 'white', line: 1 }),
      rect(911, 261, 38, 16, { r: 4, fill: 'none', line: 0.75 }),
      ellipse(928, 267, 4, 4, { fill: 'ink', line: 0 }),
    ],
    fill: '#E5DFD2',
    wall: true,
  },
  {
    // The design's counter runs down the east wall; laid flat here, its top edge is that wall.
    id: 'counter-cooktop',
    name: 'Hob counter',
    title: 'Kitchen counter · cooktop',
    category: 'kitchen',
    w: 2.24,
    d: 0.6,
    icon: 'desk',
    box: [0, 0, 112, 30],
    parts: [
      rect(0, 0, 112, 30, { r: 1 }),
      rect(28, 3, 24, 24, { fill: 'white', line: 1 }),
      ...[
        [30, 5],
        [30, 17],
        [42, 5],
        [42, 17],
      ].map(([x, y]) => ellipse(x!, y!, 8, 8, { fill: 'none', line: 1 })),
    ],
    fill: '#E5DFD2',
    wall: true,
  },
  {
    id: 'nightstand',
    name: 'Nightstand',
    category: 'bedroom',
    w: 0.44,
    d: 0.44,
    icon: 'desk',
    box: [464, 482, 22, 22],
    parts: [rect(464, 482, 22, 22, { r: 2 })],
    fill: '#F1EBDD',
    wall: true,
  },
  {
    // Monitor bar along the back edge (the design draws it against the south wall).
    id: 'desk',
    name: 'Desk',
    category: 'office',
    w: 2.56,
    d: 0.8,
    icon: 'desk',
    box: [0, 0, 128, 40],
    parts: [rect(0, 0, 128, 40, { r: 2 }), rect(46, 7, 36, 3, { r: 1, fill: 'ink', line: 0 })],
    fill: '#F1EBDD',
    wall: true,
  },
  {
    id: 'office-chair',
    name: 'Desk chair',
    category: 'office',
    w: 0.36,
    d: 0.36,
    icon: 'desk',
    box: [945, 585, 18, 18],
    parts: [ellipse(945, 585, 18, 18), rect(946, 585, 16, 4, { r: 2, fill: 'ink', line: 0 })],
    round: true,
  },
];
