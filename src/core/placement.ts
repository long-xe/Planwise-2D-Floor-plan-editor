import type { Furniture, Wall } from './document';
import { snapToGrid } from './snapping';
import { wallQuad } from './structure';
import { type Gap, polygonGap, polygonsOverlap } from '../geometry/clearance';
import { type Transform, aabbOf, footprintToWorld } from '../geometry/transform';
import { type Rect, type Vec2, rotate } from '../geometry/vec';
import { wallFaces } from '../geometry/walls';

/** Placement rules (design 05, right panel). */
export interface PlacementRules {
  snapToWall: boolean;
  /** Warn when the drop leaves less than WALKWAY_M to a wall or another piece. */
  walkway: boolean;
  autoRotate: boolean;
}

export const DEFAULT_RULES: PlacementRules = { snapToWall: true, walkway: true, autoRotate: false };

/** "Keep 0.60 m walkway". */
export const WALKWAY_M = 0.6;

/** A wall pulls a piece back (and turns it) once its back is this close to the face. */
export const WALL_REACH_M = 0.4;

export interface PlacementItem {
  w: number;
  d: number;
  footprint: readonly Vec2[];
  againstWall: boolean;
  backDown?: boolean;
}

export interface PlacementInput {
  item: PlacementItem;
  /** Where the ghost's centre is under the pointer, in metres. */
  pointer: Vec2;
  /** Rotation to use when auto-rotate doesn't pick one. */
  rotation: number;
  walls: readonly Wall[];
  /** Pieces to align with and collide against (visible layers). */
  objects: readonly Furniture[];
  /** Grid step in metres; 0 = off. */
  grid: number;
  /** Alignment capture distance in metres (the snap tolerance on screen). */
  tolerance: number;
  rules: PlacementRules;
}

export interface Alignment {
  id: string;
  kind: 'center' | 'edge';
  axis: 'x' | 'y';
  /** The guide: from the other piece's near edge to the drop's. */
  from: Vec2;
  to: Vec2;
}

export interface Placement {
  transform: Transform;
  /** The wall the piece was pushed back against. */
  wall: Wall | null;
  onGrid: boolean;
  aligned: Alignment | null;
  /** Pieces and walls the drop overlaps. */
  collisions: string[];
  /** Tightest clearance under the walkway, if any. */
  gap: (Gap & { id: string }) | null;
}

const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

/** Closest point on a wall's line within its length, and the unit normal towards `p`. */
function wallNear(w: Wall, p: Vec2): { foot: Vec2; n: Vec2; side: 'left' | 'right'; d: number } | null {
  const len = dist(w.a, w.b);
  if (len < 1e-9) return null;
  const u = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  const t = (p.x - w.a.x) * u.x + (p.y - w.a.y) * u.y;
  if (t < 0 || t > len) return null;
  const foot = { x: w.a.x + u.x * t, y: w.a.y + u.y * t };
  // wallFaces' left is along (-u.y, u.x).
  const left = { x: -u.y, y: u.x };
  const s = (p.x - foot.x) * left.x + (p.y - foot.y) * left.y;
  const side = s >= 0 ? 'left' : 'right';
  const n = side === 'left' ? left : { x: -left.x, y: -left.y };
  return { foot, n, side, d: Math.abs(s) };
}

/** Rotation that turns the piece's back towards the wall (normal `n` points away from it). */
function facingAway(n: Vec2, backDown: boolean): number {
  const deg = backDown ? Math.atan2(n.x, -n.y) : Math.atan2(-n.x, n.y);
  return Math.round((((deg * 180) / Math.PI + 360) % 360) * 100) / 100;
}

function halfExtents(w: number, d: number, rotation: number): Vec2 {
  const r = (rotation * Math.PI) / 180;
  const c = Math.abs(Math.cos(r));
  const s = Math.abs(Math.sin(r));
  return { x: (w * c + d * s) / 2, y: (w * s + d * c) / 2 };
}

function align(box: Rect, others: readonly Furniture[], axis: 'x' | 'y', tol: number) {
  const [lo, hi] = axis === 'x' ? (['minX', 'maxX'] as const) : (['minY', 'maxY'] as const);
  let best: { delta: number; value: number; kind: 'center' | 'edge'; o: Furniture; r: Rect } | null = null;
  const mid = (box[lo] + box[hi]) / 2;
  for (const o of others) {
    const r = aabbOf(o.transform);
    const cands: [number, number, 'center' | 'edge'][] = [
      [mid, (r[lo] + r[hi]) / 2, 'center'],
      [box[lo], r[lo], 'edge'],
      [box[hi], r[hi], 'edge'],
    ];
    for (const [from, to, kind] of cands) {
      const delta = to - from;
      if (Math.abs(delta) <= tol && (!best || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, value: to, kind, o, r };
      }
    }
  }
  return best;
}

/**
 * Where a dragged catalog piece lands (design 05). In order: turn its back
 * to the nearest wall (auto-rotate), push it back against that wall, then
 * on each free axis align it with another piece (centres or edges) or put
 * its edge on the grid; finally report overlaps and walkway clearance.
 */
export function placeItem(i: PlacementInput): Placement {
  const { item, rules } = i;
  let wall: Wall | null = null;
  let near: ReturnType<typeof wallNear> = null;
  if (item.againstWall && (rules.autoRotate || rules.snapToWall)) {
    for (const w of i.walls) {
      const h = wallNear(w, i.pointer);
      const gap = h ? h.d - wallFaces(w)[h.side] - item.d / 2 : Infinity;
      if (h && gap <= WALL_REACH_M && (!near || h.d < near.d)) {
        near = h;
        wall = w;
      }
    }
  }

  let rotation = i.rotation;
  if (near && rules.autoRotate) rotation = facingAway(near.n, !!item.backDown);

  let c = { ...i.pointer };
  let fixed: 'x' | 'y' | 'both' | null = null;
  // Snap back only when the back really faces that wall.
  const back = rotate({ x: 0, y: item.backDown ? 1 : -1 }, rotation);
  if (near && wall && rules.snapToWall && back.x * -near.n.x + back.y * -near.n.y > 0.999) {
    // The foot keeps the pointer's position along the wall; only depth is fixed.
    const face = wallFaces(wall)[near.side];
    c = { x: near.foot.x + near.n.x * (face + item.d / 2), y: near.foot.y + near.n.y * (face + item.d / 2) };
    fixed = Math.abs(near.n.y) > 0.999 ? 'y' : Math.abs(near.n.x) > 0.999 ? 'x' : 'both';
  } else wall = null;

  const he = halfExtents(item.w, item.d, rotation);
  let aligned: Alignment | null = null;
  let onGrid = false;
  for (const axis of ['x', 'y'] as const) {
    if (fixed === axis || fixed === 'both') continue;
    const box = { minX: c.x - he.x, maxX: c.x + he.x, minY: c.y - he.y, maxY: c.y + he.y };
    const a = align(box, i.objects, axis, i.tolerance);
    if (a) {
      c = { ...c, [axis]: c[axis] + a.delta };
      if (!aligned) aligned = guide(a, c, he, axis);
    } else if (i.grid > 0) {
      c = { ...c, [axis]: snapToGrid(c[axis] - he[axis], i.grid) + he[axis] };
      onGrid = true;
    }
  }

  const transform: Transform = { x: c.x, y: c.y, w: item.w, h: item.d, rotation, flipX: false };
  const { collisions, gap } = clearance(transform, item, i, wall);
  return { transform, wall, onGrid, aligned, collisions, gap };
}

function guide(
  a: { value: number; kind: 'center' | 'edge'; o: Furniture; r: Rect },
  c: Vec2,
  he: Vec2,
  axis: 'x' | 'y',
): Alignment {
  const other = axis === 'x' ? 'y' : 'x';
  const [lo, hi] = other === 'y' ? (['minY', 'maxY'] as const) : (['minX', 'maxX'] as const);
  const above = (a.r[lo] + a.r[hi]) / 2 < c[other];
  const fromO = above ? a.r[hi] : a.r[lo];
  const toO = above ? c[other] - he[other] : c[other] + he[other];
  const at = (o: number): Vec2 => (axis === 'x' ? { x: a.value, y: o } : { x: o, y: a.value });
  return { id: a.o.id, kind: a.kind, axis, from: at(fromO), to: at(toO) };
}

// Touching isn't colliding: a piece pushed flush against a wall shares its face.
const SHRINK = 0.002;

function clearance(t: Transform, item: PlacementItem, i: PlacementInput, backed: Wall | null) {
  const poly = footprintToWorld(t, item.footprint);
  const inner = footprintToWorld({ ...t, w: t.w - SHRINK, h: t.h - SHRINK }, item.footprint);
  const collisions: string[] = [];
  let gap: Placement['gap'] = null;
  const test = (id: string, other: Vec2[]) => {
    if (polygonsOverlap(inner, other)) return collisions.push(id);
    if (!i.rules.walkway || id === backed?.id) return;
    const g = polygonGap(poly, other);
    if (g.dist > 0.01 && g.dist < WALKWAY_M && (!gap || g.dist < gap.dist)) gap = { ...g, id };
  };
  for (const w of i.walls) test(w.id, wallQuad(w));
  // Rugs lie under furniture: neither collide nor block the walkway.
  for (const o of i.objects) if (!o.appearance.dashed) test(o.id, footprintToWorld(o.transform, o.footprint));
  return { collisions, gap: gap as Placement['gap'] };
}
