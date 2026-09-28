import type { Furniture, FixtureIcon } from '../core/document';
import { RECT_FOOTPRINT, ellipseFootprint } from '../core/document';
import type { Vec2 } from '../geometry/vec';

// Electrical layer of the demo plan, from the Figma frame (08 · Layers
// Manager): drawing px / 50 = metres, origin at the exterior wall corner.

/** Outlet: a half-disc with its flat side on the wall, bulging into the room (local -y). */
const OUTLET_FOOTPRINT: Vec2[] = Array.from({ length: 9 }, (_, i) => {
  const t = (i / 8) * Math.PI;
  return { x: 0.5 * Math.cos(t), y: 0.5 - Math.sin(t) };
});

const OUTLET = { w: 0.24, h: 0.12 };
const SWITCH = 0.28;
const LIGHT = 0.36;

/** Wall point + facing (0 = into the room above, 90 = right, …). */
const OUTLETS: [number, number, number][] = [
  [1.2, 4.52, 0],
  [6.0, 4.52, 0],
  [0.24, 4.0, 90],
  [7.92, 2.2, 270],
  [10.0, 3.72, 0],
  [8.4, 8.16, 0],
  [10.8, 8.16, 0],
  [4.56, 4.68, 180],
  [0.24, 6.0, 90],
  [8.08, 4.4, 90],
  [11.76, 2.4, 270],
  [9.6, 0.24, 180],
];
const SWITCHES: [number, number, string][] = [
  [0.52, 1.64, 'c1'],
  [3.68, 4.96, 'c2'],
  [6.8, 4.96, 'c3'],
  [8.36, 4.72, 'c4'],
];
const LIGHTS: [number, number, string | undefined][] = [
  [3.8, 2.4, 'c1'],
  [10.0, 2.0, undefined],
  [2.2, 6.0, 'c2'],
  [6.4, 6.0, 'c3'],
  [9.92, 6.0, 'c4'],
];

export function createElectrical(): Furniture[] {
  let n = 1;
  const fixture = (
    name: string,
    icon: FixtureIcon,
    x: number,
    y: number,
    w: number,
    h: number,
    rotation: number,
    footprint: Vec2[],
    circuit?: string,
  ): Furniture => {
    const f: Furniture = {
      kind: 'furniture',
      id: `e_${String(n++).padStart(4, '0')}`,
      layerId: 'electrical',
      name,
      icon,
      transform: { x, y, w, h, rotation, flipX: false },
      footprint,
      // Unused for drawing (fixtures take the layer colour) but keeps the model uniform.
      appearance: { fill: '#FFFFFF', fillOpacity: 1, stroke: '#2F5DA8', strokeWidth: 1.25 },
    };
    if (circuit) f.circuit = circuit;
    return f;
  };
  const out: Furniture[] = [];
  for (const [x, y, facing] of OUTLETS) {
    // The stored centre sits half the symbol's depth off the wall face.
    const r = (facing * Math.PI) / 180;
    const cx = x + Math.sin(r) * (OUTLET.h / 2);
    const cy = y - Math.cos(r) * (OUTLET.h / 2);
    out.push(fixture('Outlet', 'outlet', cx, cy, OUTLET.w, OUTLET.h, facing, OUTLET_FOOTPRINT));
  }
  for (const [x, y, c] of SWITCHES) out.push(fixture('Switch', 'switch', x, y, SWITCH, SWITCH, 0, RECT_FOOTPRINT, c));
  for (const [x, y, c] of LIGHTS)
    out.push(fixture('Ceiling light', 'light', x, y, LIGHT, LIGHT, 0, ellipseFootprint(), c));
  return out;
}
