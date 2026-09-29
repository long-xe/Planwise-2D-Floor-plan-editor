import type { Doc, Furniture, FixtureIcon, Layer } from '../core/document';
import { RECT_FOOTPRINT, ellipseFootprint } from '../core/document';
import type { Transform } from '../geometry/transform';
import type { Vec2 } from '../geometry/vec';

// Electrical layer of the demo plan, from the Figma frame (08 · Layers
// Manager): drawing px / 50 = metres, origin at the exterior wall corner.
// The fixture specs here are what the Electrical tool and the Library place.

/** Outlet: a half-disc with its flat side on the wall, bulging into the room (local -y). */
const OUTLET_FOOTPRINT: Vec2[] = Array.from({ length: 9 }, (_, i) => {
  const t = (i / 8) * Math.PI;
  return { x: 0.5 * Math.cos(t), y: 0.5 - Math.sin(t) };
});

export interface FixtureSpec {
  name: string;
  /** Library card label, plural, as the Layers manager counts them. */
  plural: string;
  w: number;
  h: number;
  footprint: Vec2[];
  /** Mounted on a wall face (outlets, switches) or free on the ceiling (lights). */
  onWall: boolean;
  /** Switches and lights are wired into circuits; outlets aren't switched. */
  wired: boolean;
}

export const FIXTURES: Record<FixtureIcon, FixtureSpec> = {
  outlet: {
    name: 'Outlet',
    plural: 'Outlets',
    w: 0.24,
    h: 0.12,
    footprint: OUTLET_FOOTPRINT,
    onWall: true,
    wired: false,
  },
  switch: {
    name: 'Switch',
    plural: 'Switches',
    w: 0.28,
    h: 0.28,
    footprint: RECT_FOOTPRINT,
    onWall: true,
    wired: true,
  },
  light: {
    name: 'Ceiling light',
    plural: 'Ceiling lights',
    w: 0.36,
    h: 0.36,
    footprint: ellipseFootprint(),
    onWall: false,
    wired: true,
  },
};

export const FIXTURE_KINDS: readonly FixtureIcon[] = ['outlet', 'switch', 'light'];

/** The design's Electrical layer (08), for plans that start without one. */
export function electricalLayer(doc: Doc): Layer {
  return {
    id: 'electrical',
    name: 'Electrical',
    color: '#2F5DA8',
    visible: true,
    locked: false,
    opacity: 1,
    order: Math.max(-1, ...doc.layers.map((l) => l.order)) + 1,
    // Design 12: wiring stays off the printed sheet unless ticked.
    includeInPrint: false,
    snapTargets: true,
    cacheAsStatic: false,
  };
}

/** A fixture as a document object on the Electrical layer. */
export function fixtureObject(kind: FixtureIcon, id: string, transform: Transform, circuit?: string | null): Furniture {
  const spec = FIXTURES[kind];
  const f: Furniture = {
    kind: 'furniture',
    id,
    layerId: 'electrical',
    name: spec.name,
    icon: kind,
    transform: { ...transform, w: spec.w, h: spec.h },
    footprint: spec.footprint.map((p) => ({ ...p })),
    // Unused for drawing (fixtures take the layer colour) but keeps the model uniform.
    appearance: { fill: '#FFFFFF', fillOpacity: 1, stroke: '#2F5DA8', strokeWidth: 1.25 },
  };
  if (circuit && spec.wired) f.circuit = circuit;
  return f;
}

const OUTLET = FIXTURES.outlet;

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

const at = (x: number, y: number, rotation: number): Transform => ({ x, y, w: 0, h: 0, rotation, flipX: false });

export function createElectrical(): Furniture[] {
  let n = 1;
  const id = () => `e_${String(n++).padStart(4, '0')}`;
  const out: Furniture[] = [];
  for (const [x, y, facing] of OUTLETS) {
    // The stored centre sits half the symbol's depth off the wall face.
    const r = (facing * Math.PI) / 180;
    const cx = x + Math.sin(r) * (OUTLET.h / 2);
    const cy = y - Math.cos(r) * (OUTLET.h / 2);
    out.push(fixtureObject('outlet', id(), at(cx, cy, facing)));
  }
  for (const [x, y, c] of SWITCHES) out.push(fixtureObject('switch', id(), at(x, y, 0), c));
  for (const [x, y, c] of LIGHTS) out.push(fixtureObject('light', id(), at(x, y, 0), c));
  return out;
}
