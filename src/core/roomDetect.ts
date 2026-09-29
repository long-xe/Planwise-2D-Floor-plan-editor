import type { Wall } from './document';
import { wallQuad } from './structure';
import { pointInPolygon } from '../geometry/hitTest';
import { type Vec2, boundsOf } from '../geometry/vec';

/**
 * 2 cm cells: wall faces drawn on a 1 or 2 cm grid (the demo's 0.24 / 0.16 m
 * walls, anything snapped to the 10 or 20 cm grid) land on cell edges, so
 * a detected room is exact, not a 2 cm staircase. Big plans coarsen.
 */
const CELL_M = 0.02;
const MAX_CELLS = 2_000_000;

export interface DetectedRoom {
  /** Net outline inside the wall faces, counter-clockwise on screen. */
  polygon: Vec2[];
  /** m², from the filled cells (the polygon's shoelace area agrees). */
  area: number;
}

/**
 * The walls rasterised once per wall set: a cell is blocked when its centre
 * is inside a wall body. Door and window cuts don't open the wall here, so
 * a room ends at its walls, not in the next room through a doorway.
 */
export class RoomGrid {
  readonly cell: number;
  readonly x0: number;
  readonly y0: number;
  readonly w: number;
  readonly h: number;
  readonly blocked: Uint8Array;

  constructor(walls: readonly Wall[]) {
    const quads = walls.map((w) => wallQuad(w));
    const box = quads.length ? boundsOf(quads.flat()) : { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const area = (box.maxX - box.minX) * (box.maxY - box.minY);
    this.cell = Math.max(CELL_M, Math.sqrt(area / MAX_CELLS));
    // One free cell of margin all round: a fill that reaches it has escaped.
    this.x0 = Math.floor(box.minX / this.cell) * this.cell - this.cell;
    this.y0 = Math.floor(box.minY / this.cell) * this.cell - this.cell;
    this.w = Math.ceil((box.maxX - this.x0) / this.cell) + 2;
    this.h = Math.ceil((box.maxY - this.y0) / this.cell) + 2;
    this.blocked = new Uint8Array(this.w * this.h);
    for (const q of quads) {
      const b = boundsOf(q);
      const i0 = Math.max(0, Math.floor((b.minX - this.x0) / this.cell));
      const i1 = Math.min(this.w - 1, Math.ceil((b.maxX - this.x0) / this.cell));
      const j0 = Math.max(0, Math.floor((b.minY - this.y0) / this.cell));
      const j1 = Math.min(this.h - 1, Math.ceil((b.maxY - this.y0) / this.cell));
      const c = { x: 0, y: 0 };
      for (let j = j0; j <= j1; j++) {
        c.y = this.y0 + (j + 0.5) * this.cell;
        for (let i = i0; i <= i1; i++) {
          c.x = this.x0 + (i + 0.5) * this.cell;
          if (pointInPolygon(c, q)) this.blocked[j * this.w + i] = 1;
        }
      }
    }
  }

  /** The closed room around `p`, or null when `p` is in a wall or the space leaks outside. */
  roomAt(p: Vec2): DetectedRoom | null {
    const { w, h, cell } = this;
    const i = Math.floor((p.x - this.x0) / cell);
    const j = Math.floor((p.y - this.y0) / cell);
    if (i <= 0 || j <= 0 || i >= w - 1 || j >= h - 1 || this.blocked[j * w + i]) return null;
    const filled = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);
    let head = 0;
    let tail = 0;
    queue[tail++] = j * w + i;
    filled[j * w + i] = 1;
    let count = 0;
    while (head < tail) {
      const k = queue[head++]!;
      count++;
      const ci = k % w;
      const cj = (k - ci) / w;
      // Reaching the margin means the walls don't close around the point.
      if (ci === 0 || cj === 0 || ci === w - 1 || cj === h - 1) return null;
      for (const n of [k - 1, k + 1, k - w, k + w]) {
        if (!filled[n] && !this.blocked[n]) {
          filled[n] = 1;
          queue[tail++] = n;
        }
      }
    }
    return { polygon: this.outline(filled), area: count * cell * cell };
  }

  /**
   * Outline of the filled cells: every cell side facing an empty cell is an
   * edge (walked with the region on its left), chained into loops; the
   * longest loop is the room's outer boundary, with straight runs merged.
   */
  private outline(filled: Uint8Array): Vec2[] {
    const { w, h } = this;
    const at = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && filled[j * w + i] === 1;
    // Lattice point (i, j) → key; edge from → to.
    const next = new Map<number, number[]>();
    const key = (i: number, j: number) => j * (w + 1) + i;
    const add = (a: number, b: number) => {
      const list = next.get(a);
      if (list) list.push(b);
      else next.set(a, [b]);
    };
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        if (!at(i, j)) continue;
        if (!at(i, j - 1)) add(key(i, j), key(i + 1, j));
        if (!at(i + 1, j)) add(key(i + 1, j), key(i + 1, j + 1));
        if (!at(i, j + 1)) add(key(i + 1, j + 1), key(i, j + 1));
        if (!at(i - 1, j)) add(key(i, j + 1), key(i, j));
      }
    }
    let best: number[] = [];
    while (next.size) {
      const start = next.keys().next().value as number;
      const loop: number[] = [];
      let cur = start;
      for (;;) {
        const outs = next.get(cur);
        if (!outs?.length) break;
        loop.push(cur);
        const to = outs.pop()!;
        if (!outs.length) next.delete(cur);
        cur = to;
        if (cur === start) break;
      }
      if (loop.length > best.length) best = loop;
    }
    const pts = best.map((k) => {
      const i = k % (w + 1);
      const j = (k - i) / (w + 1);
      return { x: round(this.x0 + i * this.cell), y: round(this.y0 + j * this.cell) };
    });
    return dropStraight(pts);
  }
}

const round = (v: number) => Math.round(v * 1e4) / 1e4;

/** Removes points that sit on a straight run between their neighbours. */
function dropStraight(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  const n = pts.length;
  for (let k = 0; k < n; k++) {
    const a = pts[(k + n - 1) % n]!;
    const b = pts[k]!;
    const c = pts[(k + 1) % n]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cross) > 1e-9) out.push(b);
  }
  return out;
}
