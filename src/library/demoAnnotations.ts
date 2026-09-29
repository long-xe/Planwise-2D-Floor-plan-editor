import type { Annotation, RoomArea } from '../core/annotations';
import type { SheetInfo } from '../core/document';
import type { Vec2 } from '../geometry/vec';
import { ROOMS } from './rooms';

// The Annotations layer of "Harbor St. Residence — Unit 4B", from design 10
// (drawing px / 50 = metres, origin at the exterior corner). Room areas are
// computed from the net room outlines, so they follow the plan, not the mock.

const P = (x: number, y: number): Vec2 => ({ x, y });

/** Room name and where its label sits (top centre of the name). */
const LABELS: Record<string, { name: string; at: Vec2 }> = {
  living: { name: 'Living Room', at: P(1.8, 0.92) },
  kitchen: { name: 'Kitchen', at: P(9.92, 3.12) },
  study: { name: 'Study', at: P(9.92, 4.0) },
  bedroom: { name: 'Bedroom', at: P(2.2, 7.32) },
  bath: { name: 'Bath', at: P(6.1, 6.12) },
};

const rooms: RoomArea[] = ROOMS.map(({ name, rect: r }) => ({
  name: LABELS[name]!.name,
  label: LABELS[name]!.at,
  polygon: [P(r.minX, r.minY), P(r.maxX, r.minY), P(r.maxX, r.maxY), P(r.minX, r.maxY)],
}));

const base = (id: string, name: string) => ({ kind: 'annotation' as const, id, layerId: 'annotations', name });

export const DEMO_SHEET: SheetInfo = {
  project: 'Floor plan · Level 04',
  scale: '1:50 @ A3',
  drawn: 'M. Rivera',
  rev: 2,
  date: '28.09.2026',
  checked: 'J. Tan',
  revNote: 'bath layout',
  number: 'A-101',
};

export function createDemoAnnotations(): Annotation[] {
  return [
    {
      ...base('a_01', 'Dimension chain · top'),
      type: 'dimension',
      runs: [
        { points: [P(0, 0), P(12, 0)], offset: 1.08, unit: true },
        { points: [P(0, 0), P(8, 0), P(12, 0)], offset: 0.56 },
      ],
    },
    {
      ...base('a_02', 'Dimension chain · left'),
      type: 'dimension',
      runs: [
        { points: [P(0, 0), P(0, 8.4)], offset: -1.08, unit: true },
        { points: [P(0, 0), P(0, 4.6), P(0, 8.4)], offset: -0.56 },
      ],
    },
    {
      ...base('a_03', 'Dimension chain · right'),
      type: 'dimension',
      runs: [{ points: [P(12, 0), P(12, 3.8), P(12, 8.4)], offset: 0.56 }],
    },
    {
      ...base('a_04', 'Bath clear width'),
      type: 'dimension',
      runs: [{ points: [P(5.08, 4.36), P(7.92, 4.36)], offset: 0 }],
    },
    { ...base('a_05', 'Room areas'), type: 'area', rooms },
    {
      ...base('a_06', 'Callout · Island worktop'),
      type: 'callout',
      anchor: P(9.77, 2.25),
      box: P(10.44, -1.88),
      title: 'Island worktop',
      body: 'Quartz · 0.30 m seating overhang',
    },
    {
      ...base('a_07', 'Note · blackout blinds'),
      type: 'note',
      anchor: P(2.4, 8.28),
      box: P(-1.6, 9.2),
      author: 'JT',
      date: '26 Sep',
      text: 'Client wants blackout blinds on the south bedroom window.',
    },
    {
      ...base('a_08', 'Revision cloud Δ2'),
      type: 'revision',
      cloud: [P(4.98, 4.7), P(8.1, 4.7), P(8.1, 8.18), P(4.98, 8.18)],
      rev: 2,
      tag: P(7.88, 8.6),
      text: 'swap tub for 1.20 m walk-in shower',
    },
  ];
}
