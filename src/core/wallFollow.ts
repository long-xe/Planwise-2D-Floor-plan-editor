import type { Doc, Furniture, Opening, SceneObject, Wall } from './document';
import { isEditable } from './document';
import { reseatOpenings } from './structureEdit';
import type { Vec2 } from '../geometry/vec';
import { wallFaces } from '../geometry/walls';

/** Same join tolerance as the wall graph (walls.ts). */
const EPS = 1e-3;
/** How far past its face a fixture's centre may sit and still be on that wall. */
const MOUNT_SLACK_M = 0.02;

/** The plan as it was when an edit started: what can follow a wall. */
export interface PlanSnapshot {
  walls: Wall[];
  openings: Opening[];
  /** Outlets and switches (wall-mounted fixtures). */
  fixtures: Furniture[];
}

export interface FollowTarget {
  from: SceneObject;
  to: SceneObject;
}

/** Copies of everything that could follow an edited wall; locked layers stay put. */
export function planSnapshot(doc: Doc): PlanSnapshot {
  const snap: PlanSnapshot = { walls: [], openings: [], fixtures: [] };
  for (const o of doc.objects) {
    if (!isEditable(doc, o)) continue;
    if (o.kind === 'wall') snap.walls.push(structuredClone(o));
    else if (o.kind === 'opening') snap.openings.push(structuredClone(o));
    else if (o.kind === 'furniture' && (o.icon === 'outlet' || o.icon === 'switch'))
      snap.fixtures.push(structuredClone(o));
  }
  return snap;
}

function frame(w: Wall) {
  const len = Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y) || 1;
  const u = { x: (w.b.x - w.a.x) / len, y: (w.b.y - w.a.y) / len };
  // wallFaces' left is along (-u.y, u.x).
  return { len, u, n: { x: -u.y, y: u.x } };
}

/** `p` in a wall's frame: distance along from `a`, and across towards its left face. */
function local(w: Wall, p: Vec2) {
  const { u, n, len } = frame(w);
  const rx = p.x - w.a.x;
  const ry = p.y - w.a.y;
  return { along: rx * u.x + ry * u.y, across: rx * n.x + ry * n.y, len };
}

function place(w: Wall, along: number, across: number): Vec2 {
  const { u, n } = frame(w);
  return { x: w.a.x + u.x * along + n.x * across, y: w.a.y + u.y * along + n.y * across };
}

const near = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y) <= EPS;
const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });

/**
 * Where a neighbour's end goes when `before` became `after`: a shared
 * corner goes with the corner; an end stopping inside the wall's body (a
 * T) stays on the new line where it was, only moving across. Null if
 * this wall doesn't hold it.
 */
function followEnd(p: Vec2, before: Wall, after: Wall): Vec2 | null {
  if (near(p, before.a)) return { ...after.a };
  if (near(p, before.b)) return { ...after.b };
  const { along, across, len } = local(before, p);
  const { left, right } = wallFaces(before);
  if (along <= EPS || along >= len - EPS || across > left + EPS || across < -right - EPS) return null;
  const now = local(after, p);
  return place(after, Math.min(now.len, Math.max(0, now.along)), across);
}

const angleOf = (w: Wall) => (Math.atan2(w.b.y - w.a.y, w.b.x - w.a.x) * 180) / Math.PI;

/**
 * Everything that follows edited walls (`changed`: id → the wall after):
 * walls cornered or T'd onto them stretch their touching end (and re-seat
 * their doors and windows), and outlets and switches mounted on any wall
 * that moved ride along at the same place on it. `skip` holds what the edit
 * already moves itself. Pure: reads only the snapshot taken at the start.
 */
export function followWalls(
  snap: PlanSnapshot,
  changed: ReadonlyMap<string, Wall>,
  skip: ReadonlySet<string> = new Set(),
): FollowTarget[] {
  const out: FollowTarget[] = [];
  const before = new Map(snap.walls.map((w) => [w.id, w]));
  const moved = new Map<string, { from: Wall; to: Wall }>();
  for (const [id, to] of changed) {
    const from = before.get(id);
    if (from) moved.set(id, { from, to });
  }
  const direct = [...moved.values()];
  for (const w of snap.walls) {
    if (changed.has(w.id) || skip.has(w.id)) continue;
    const end = (p: Vec2) => {
      for (const m of direct) {
        const q = followEnd(p, m.from, m.to);
        if (q) return q;
      }
      return p;
    };
    const a = end(w.a);
    const b = end(w.b);
    if (a === w.a && b === w.b) continue;
    const to: Wall = { ...w, a, b };
    out.push({ from: w, to });
    moved.set(w.id, { from: w, to });
    const own = snap.openings.filter((o) => o.wallId === w.id && !skip.has(o.id));
    reseatOpenings(own, w, to).forEach((o, i) => out.push({ from: own[i]!, to: o }));
  }
  for (const f of snap.fixtures) {
    if (skip.has(f.id)) continue;
    const t = f.transform;
    for (const { from, to } of moved.values()) {
      const { along, across, len } = local(from, t);
      const face = across >= 0 ? wallFaces(from).left : wallFaces(from).right;
      const reach = face + Math.max(t.w, t.h) + MOUNT_SLACK_M;
      if (along < -EPS || along > len + EPS || Math.abs(across) < face - EPS || Math.abs(across) > reach) continue;
      // A wall moved whole carries its fixtures with it; a wall stretched or
      // turned (a neighbour, an end dragged) leaves them where they are on
      // the plan, just back on its face.
      const shifted = !near(sub(to.a, from.a), sub(to.b, from.b));
      const now = local(to, t);
      const p = place(to, Math.min(now.len, Math.max(0, shifted ? now.along : along)), across);
      // An outlet keeps facing into the room as its wall turns; a switch stays upright.
      const turn = f.icon === 'outlet' ? angleOf(to) - angleOf(from) : 0;
      const rotation = Math.round(((((t.rotation + turn) % 360) + 360) % 360) * 100) / 100;
      // Mounted here but not actually moved (a neighbour stretched along it): no edit.
      if (!near(p, t) || rotation !== t.rotation)
        out.push({ from: f, to: { ...f, transform: { ...t, x: p.x, y: p.y, rotation } } });
      break;
    }
  }
  return out;
}
