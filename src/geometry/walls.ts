import type { Wall } from '../core/document';
import type { Vec2 } from './vec';

/**
 * Distances of the two faces from a wall's drawn line: `left` along the
 * normal n = (-dy, dx), `right` against it. Center splits the thickness;
 * Inside / Outside put the whole body on one side (design 04 Alignment).
 */
export function wallFaces(w: Wall): { left: number; right: number } {
  const t = w.thickness;
  if (w.align === 'inside') return { left: t, right: 0 };
  if (w.align === 'outside') return { left: 0, right: t };
  return { left: t / 2, right: t / 2 };
}

export type JoinKind = 'corner' | 'T' | 'free' | 'multi';

export interface EndJoin {
  kind: JoinKind;
  /** Corner: the other wall and which of its ends meets here. T: the host wall. */
  other?: Wall;
  otherEnd?: 'a' | 'b';
  /** Graph node for this end (a T end sits on its host's line). */
  node: Vec2;
}

export interface WallGraph {
  /** Keyed `${wallId}:a` / `${wallId}:b`. */
  joins: Map<string, EndJoin>;
  nodes: Vec2[];
  /** Closed faces of the plan (rooms), from Euler's formula on the planar graph. */
  rooms: number;
}

const EPS = 1e-3;
const keyOf = (p: Vec2) => `${Math.round(p.x / EPS)},${Math.round(p.y / EPS)}`;
const endPoint = (w: Wall, e: 'a' | 'b') => (e === 'a' ? w.a : w.b);

function unit(w: Wall) {
  const dx = w.b.x - w.a.x;
  const dy = w.b.y - w.a.y;
  const len = Math.hypot(dx, dy) || 1;
  return { u: { x: dx / len, y: dy / len }, len };
}

/** Where `p` falls on a wall's drawn line, as distance from `a` and offset along n. */
function local(w: Wall, p: Vec2): { along: number; across: number } {
  const { u } = unit(w);
  const rx = p.x - w.a.x;
  const ry = p.y - w.a.y;
  return { along: rx * u.x + ry * u.y, across: -rx * u.y + ry * u.x };
}

/** A wall end that stops inside another wall's body, away from its ends, is a T-junction. */
function tHost(walls: readonly Wall[], w: Wall, p: Vec2): { host: Wall; node: Vec2 } | null {
  for (const h of walls) {
    if (h === w) continue;
    const { len, u } = unit(h);
    const { along, across } = local(h, p);
    const { left, right } = wallFaces(h);
    if (along <= EPS || along >= len - EPS) continue;
    if (across > left + EPS || across < -right - EPS) continue;
    return { host: h, node: { x: h.a.x + u.x * along, y: h.a.y + u.y * along } };
  }
  return null;
}

/**
 * Wall graph (design 04): which wall ends meet (corner), end on another
 * wall (T), or stand alone; the nodes to draw; and how many rooms the
 * walls enclose.
 */
export function buildWallGraph(walls: readonly Wall[]): WallGraph {
  const byNode = new Map<string, { w: Wall; e: 'a' | 'b' }[]>();
  for (const w of walls) {
    for (const e of ['a', 'b'] as const) {
      const k = keyOf(endPoint(w, e));
      const list = byNode.get(k);
      if (list) list.push({ w, e });
      else byNode.set(k, [{ w, e }]);
    }
  }
  const joins = new Map<string, EndJoin>();
  const splits = new Map<Wall, number[]>();
  for (const ends of byNode.values()) {
    for (const { w, e } of ends) {
      const p = endPoint(w, e);
      let join: EndJoin;
      if (ends.length === 2) {
        const o = ends.find((x) => x.w !== w || x.e !== e)!;
        join = { kind: 'corner', other: o.w, otherEnd: o.e, node: p };
      } else if (ends.length > 2) join = { kind: 'multi', node: p };
      else {
        const t = tHost(walls, w, p);
        join = t ? { kind: 'T', other: t.host, node: t.node } : { kind: 'free', node: p };
        if (t) splits.set(t.host, [...(splits.get(t.host) ?? []), local(t.host, p).along]);
      }
      joins.set(`${w.id}:${e}`, join);
    }
  }

  // Euler on the planar graph: faces = E − V + C (hosts split at their T points).
  const nodes = new Map<string, Vec2>();
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const link = (a: Vec2, b: Vec2) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    nodes.set(ka, a);
    nodes.set(kb, b);
    parent.set(find(ka), find(kb));
  };
  let edges = 0;
  for (const w of walls) {
    const { u } = unit(w);
    const stops = [
      joins.get(`${w.id}:a`)!.node,
      ...(splits.get(w) ?? []).toSorted((x, y) => x - y).map((d) => ({ x: w.a.x + u.x * d, y: w.a.y + u.y * d })),
      joins.get(`${w.id}:b`)!.node,
    ];
    for (let i = 1; i < stops.length; i++) {
      link(stops[i - 1]!, stops[i]!);
      edges++;
    }
  }
  const components = new Set([...nodes.keys()].map(find)).size;
  return { joins, nodes: [...nodes.values()], rooms: Math.max(0, edges - nodes.size + components) };
}

function intersect(p: Vec2, d: Vec2, q: Vec2, e: Vec2): Vec2 | null {
  const den = d.x * e.y - d.y * e.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((q.x - p.x) * e.y - (q.y - p.y) * e.x) / den;
  return { x: p.x + d.x * t, y: p.y + d.y * t };
}

/** Faces of a wall seen from one end, looking into the wall ("outgoing"). */
function outgoing(w: Wall, e: 'a' | 'b') {
  const { u } = unit(w);
  const f = wallFaces(w);
  const d = e === 'a' ? u : { x: -u.x, y: -u.y };
  // Looking from `b`, the wall's +n face is on the right.
  return { d, n: { x: -d.y, y: d.x }, left: e === 'a' ? f.left : f.right, right: e === 'a' ? f.right : f.left };
}

/**
 * Wall body as a polygon. At an L corner with `mitre`, each face runs on
 * to where it meets the neighbour's matching face (left of one with right
 * of the other, both seen outward from the corner), so corners close
 * without notches or overlaps. T ends and free ends stay square.
 */
export function wallPolygon(w: Wall, g: WallGraph | null, mitre: boolean): Vec2[] {
  const { u } = unit(w);
  const n = { x: -u.y, y: u.x };
  const { left, right } = wallFaces(w);
  const pts = {
    aL: { x: w.a.x + n.x * left, y: w.a.y + n.y * left },
    aR: { x: w.a.x - n.x * right, y: w.a.y - n.y * right },
    bL: { x: w.b.x + n.x * left, y: w.b.y + n.y * left },
    bR: { x: w.b.x - n.x * right, y: w.b.y - n.y * right },
  };
  if (mitre && g) {
    for (const e of ['a', 'b'] as const) {
      const j = g.joins.get(`${w.id}:${e}`);
      if (j?.kind !== 'corner' || !j.other || !j.otherEnd) continue;
      const p = endPoint(w, e);
      const me = outgoing(w, e);
      const it = outgoing(j.other, j.otherEnd);
      const along = (o: typeof me, side: 1 | -1) => {
        const k = side > 0 ? o.left : -o.right;
        return { x: p.x + o.n.x * k, y: p.y + o.n.y * k };
      };
      const xl = intersect(along(me, 1), me.d, along(it, -1), it.d);
      const xr = intersect(along(me, -1), me.d, along(it, 1), it.d);
      if (!xl || !xr) continue; // collinear: square ends already meet
      const limit = 4 * Math.max(w.thickness, j.other.thickness);
      if (Math.hypot(xl.x - p.x, xl.y - p.y) > limit || Math.hypot(xr.x - p.x, xr.y - p.y) > limit) continue;
      // Outgoing-left is the +n face at `a` and the −n face at `b`.
      if (e === 'a') [pts.aL, pts.aR] = [xl, xr];
      else [pts.bR, pts.bL] = [xl, xr];
    }
  }
  return [pts.aL, pts.bL, pts.bR, pts.aR];
}
