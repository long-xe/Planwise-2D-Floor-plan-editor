import type { Doc, Furniture, Layer, Opening, Wall } from '../core/document';
import { ellipseFootprint } from '../core/document';
import { catalogItem } from './catalog';

// "Northgate Offices — Level 3", the Performance screen's stress plan
// (design 11): 842 objects — walls & core 64, workstations 640, meeting
// rooms 42, ceiling lights 96 — on a 40 × 36.5 m floor. Workstation
// clusters fill it past the bottom of the view, so culling has work to do.

const layer = (id: string, name: string, color: string, order: number, locked = false): Layer => ({
  id,
  name,
  color,
  order,
  locked,
  opacity: 1,
  visible: true,
  includeInPrint: true,
  snapTargets: true,
  cacheAsStatic: locked,
});

const TOP = 11.5;
const BOTTOM = 48;
const RIGHT = 40;
const STRIP = 16.2;
const ROOM_W = 6.1;

/** Cluster grid: 8 columns × 10 rows of 4 desks + 4 chairs. */
const COL_X = (c: number) => 0.8 + c * 4.9;
const ROW_Y = (r: number) => 18.2 + r * 3;
/** The core stands where two clusters would be. */
const isCore = (c: number, r: number) => c === 3 && (r === 2 || r === 3);

export function createOfficeDoc(): Doc {
  const objects: (Wall | Opening | Furniture)[] = [];
  let n = 0;
  const id = (p: string) => `${p}${String(++n).padStart(4, '0')}`;

  const wall = (ax: number, ay: number, bx: number, by: number, thickness: number, name?: string): Wall => {
    const w: Wall = {
      kind: 'wall',
      id: id('w_'),
      layerId: 'walls',
      a: { x: ax, y: ay },
      b: { x: bx, y: by },
      thickness,
    };
    if (name) w.name = name;
    objects.push(w);
    return w;
  };
  const cut = (w: Wall, type: Opening['type'], offset: number, width: number) =>
    objects.push({
      kind: 'opening',
      id: id('o_'),
      layerId: 'walls',
      wallId: w.id,
      type,
      offset,
      width,
      ...(type === 'door' ? { hinge: 'start' as const, swing: 1 as const } : {}),
    });
  const piece = (
    layerId: string,
    catalogId: string,
    name: string,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation = 0,
  ) => {
    const item = catalogItem(catalogId)!;
    objects.push({
      kind: 'furniture',
      id: id('f_'),
      layerId,
      name,
      icon: item.icon,
      transform: { x, y, w, h, rotation, flipX: false },
      footprint: item.footprint,
      appearance: { ...item.appearance },
      catalogId,
    });
  };

  // Walls & core (64): shell with windows, meeting-room fronts with doors, core, columns.
  const north = wall(0, TOP, RIGHT, TOP, 0.3, 'Exterior · North');
  const south = wall(0, BOTTOM, RIGHT, BOTTOM, 0.3, 'Exterior · South');
  const west = wall(0, TOP, 0, BOTTOM, 0.3, 'Exterior · West');
  const east = wall(RIGHT, TOP, RIGHT, BOTTOM, 0.3, 'Exterior · East');
  for (let i = 0; i < 5; i++) cut(north, 'window', 1.3 + i * ROOM_W, 3.6);
  for (let i = 0; i < 8; i++) cut(south, 'window', 1.2 + i * 4.9, 2.4);
  for (let i = 0; i < 6; i++) cut(west, 'window', 7.5 + i * 4.8, 2.0);
  for (let i = 0; i < 6; i++) cut(east, 'window', 7.5 + i * 4.8, 2.0);
  const front = wall(0.15, STRIP, 5 * ROOM_W, STRIP, 0.16, 'Meeting rooms · front');
  for (let i = 1; i <= 5; i++) wall(i * ROOM_W, TOP + 0.15, i * ROOM_W, STRIP, 0.16);
  for (let i = 0; i < 5; i++) cut(front, 'door', i * ROOM_W + 4.6, 0.9);
  wall(15.3, 23.2, 19.3, 23.2, 0.3, 'Core');
  wall(19.3, 23.2, 19.3, 29.0, 0.3, 'Core');
  wall(19.3, 29.0, 15.3, 29.0, 0.3, 'Core');
  wall(15.3, 29.0, 15.3, 23.2, 0.3, 'Core');
  for (const x of [5.05, 14.85, 24.65, 34.45]) {
    for (let r = 0; r < 10; r += 2) wall(x - 0.25, ROW_Y(r) + 1.85, x + 0.25, ROW_Y(r) + 1.85, 0.5, 'Column');
  }

  // Meeting rooms (42): table, six chairs and a screen per room, and two plants.
  for (let i = 0; i < 5; i++) {
    const cx = i * ROOM_W + ROOM_W / 2;
    piece('meeting', 'dining-table', 'Meeting table', cx, 13.9, 2.08, 1.0, 90);
    for (const dx of [-0.7, 0, 0.7]) {
      piece('meeting', 'office-chair', 'Meeting chair', cx + dx, 13.0, 0.45, 0.45);
      piece('meeting', 'office-chair', 'Meeting chair', cx + dx, 14.8, 0.45, 0.45, 180);
    }
    piece('meeting', 'tv-unit', 'Screen', cx, TOP + 0.4, 1.6, 0.3);
  }
  piece('meeting', 'plant', 'Plant', 31.4, 12.4, 0.5, 0.5);
  piece('meeting', 'plant', 'Plant', 39.3, 12.4, 0.5, 0.5);

  // Workstations (640): 78 clusters of 4 desks and 4 chairs, and 16 plants along the east wall.
  for (let r = 0; r < 10; r++) {
    for (let c = 0; c < 8; c++) {
      if (isCore(c, r)) continue;
      for (let i = 0; i < 4; i++) {
        const x = COL_X(c) + 0.45 + i * 0.9;
        const up = i % 2 === 0;
        piece('furniture', 'desk', 'Desk', x, ROW_Y(r) + 0.35, 0.9, 0.7, up ? 180 : 0);
        piece('furniture', 'office-chair', 'Desk chair', x, ROW_Y(r) + (up ? -0.25 : 0.95), 0.45, 0.45, up ? 0 : 180);
      }
    }
  }
  for (let i = 0; i < 16; i++) piece('furniture', 'plant', 'Plant', 39.3, 17.6 + i * 1.9, 0.5, 0.5);

  // Ceiling lights (96): over every cluster aisle, the meeting rooms and the corridor.
  const light = (x: number, y: number) =>
    objects.push({
      kind: 'furniture',
      id: id('f_'),
      layerId: 'electrical',
      name: 'Ceiling light',
      icon: 'light',
      transform: { x, y, w: 0.36, h: 0.36, rotation: 0, flipX: false },
      footprint: ellipseFootprint(),
      appearance: { fill: '#FFFFFF', fillOpacity: 1, stroke: '#E0A526', strokeWidth: 1.5 },
    });
  for (let r = 0; r < 9; r++) for (let c = 0; c < 8; c++) light(COL_X(c) + 1.8, ROW_Y(r) + 1.85);
  for (let i = 0; i < 5; i++) for (const dx of [-1.8, -0.6, 0.6, 1.8]) light(i * ROOM_W + ROOM_W / 2 + dx, 12.6);
  for (const x of [32.5, 34.5, 36.5, 38.5]) light(x, 17.0);

  return {
    name: 'Northgate Offices — Level 3',
    layers: [
      layer('walls', 'Walls & core', '#1B2A41', 3, true),
      layer('furniture', 'Workstations', '#D9623B', 2),
      layer('meeting', 'Meeting rooms', '#2F5DA8', 1),
      layer('electrical', 'Lighting', '#E0A526', 0),
    ],
    groups: [],
    objects,
  };
}
