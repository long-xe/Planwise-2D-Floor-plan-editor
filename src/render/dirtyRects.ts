import type { Appearance, Doc, SceneObject } from '../core/document';
import type { DirtyRegion, ScreenRect } from '../core/perf';
import type { Transform } from '../geometry/transform';

export type { DirtyRegion, ScreenRect } from '../core/perf';

export interface DirtyResult {
  /** Repaint everything: the view changed, or something that reaches beyond its own box did. */
  full: boolean;
  regions: DirtyRegion[];
  /** Pieces that changed since the last frame. */
  objects: number;
}

interface Seen {
  obj: SceneObject;
  transform: Transform | null;
  appearance: Appearance | null;
  gen: number;
}

/** More regions than this, or more than this share of the canvas, costs more than one full repaint. */
const MAX_REGIONS = 8;
const MAX_AREA_SHARE = 0.5;

const union = (a: ScreenRect, b: ScreenRect): ScreenRect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

const overlaps = (a: ScreenRect, b: ScreenRect) =>
  a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;

/** Merges overlapping regions until none overlap (labels join with " + "). */
export function mergeRegions(list: DirtyRegion[]): DirtyRegion[] {
  const out = [...list];
  for (let merged = true; merged;) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (!overlaps(out[i]!, out[j]!)) continue;
        const label = out[i]!.label === out[j]!.label ? out[i]!.label : `${out[i]!.label} + ${out[j]!.label}`;
        out[i] = { ...union(out[i]!, out[j]!), label };
        out.splice(j, 1);
        merged = true;
        break;
      }
    }
  }
  return out;
}

/**
 * Finds what the content canvas must repaint (design 11, "Dirty-rect
 * redraw"). Commands replace an object, its transform or its appearance
 * rather than editing them in place, so comparing references against the
 * last frame finds every change in one pass without instrumenting commands.
 * A moved piece dirties its old and new box. Walls, openings and wired
 * fixtures reach past their own box (mitres, door cuts, circuit runs), so
 * changing one repaints everything; so does any change of `viewKey`.
 */
export class DirtyTracker {
  private readonly seen = new Map<string, Seen>();
  private key: string | null = null;
  private gen = 0;

  /**
   * `rectOf` maps a transform to its screen box in the current view. It's
   * only called for pieces that changed — the old box from the transform
   * the last frame drew — so an unchanged frame allocates nothing per object.
   */
  diff(doc: Doc, viewKey: string, rectOf: (t: Transform) => ScreenRect, area: number): DirtyResult {
    const gen = ++this.gen;
    const regions: DirtyRegion[] = [];
    const first = this.seen.size === 0;
    let full = viewKey !== this.key || first;
    let objects = 0;
    this.key = viewKey;
    for (const o of doc.objects) {
      const f = o.kind === 'furniture' ? o : null;
      const prev = this.seen.get(o.id);
      if (!prev) {
        this.seen.set(o.id, { obj: o, transform: f?.transform ?? null, appearance: f?.appearance ?? null, gen });
        if (first) continue;
        objects++;
        if (!f || f.circuit) full = true;
        else if (!full) regions.push({ ...rectOf(f.transform), label: `added ${f.name.toLowerCase()}` });
        continue;
      }
      prev.gen = gen;
      const changed = prev.obj !== o || (f && (prev.transform !== f.transform || prev.appearance !== f.appearance));
      if (changed) {
        objects++;
        if (!f || f.circuit || prev.obj.kind !== 'furniture' || !prev.transform) full = true;
        else if (!full) {
          const verb = prev.transform !== f.transform ? 'moved' : 'restyled';
          regions.push({
            ...union(rectOf(prev.transform), rectOf(f.transform)),
            label: `${verb} ${f.name.toLowerCase()}`,
          });
        }
      }
      prev.obj = o;
      prev.transform = f?.transform ?? null;
      prev.appearance = f?.appearance ?? null;
    }
    for (const [id, s] of this.seen) {
      if (s.gen === gen) continue;
      objects++;
      if (s.obj.kind !== 'furniture' || s.obj.circuit || !s.transform) full = true;
      else if (!full) regions.push({ ...rectOf(s.transform), label: `removed ${s.obj.name.toLowerCase()}` });
      this.seen.delete(id);
    }
    if (full) return { full: true, regions: [], objects };
    const merged = mergeRegions(regions);
    const covered = merged.reduce((sum, r) => sum + r.w * r.h, 0);
    if (merged.length > MAX_REGIONS || covered > area * MAX_AREA_SHARE) return { full: true, regions: [], objects };
    return { full: false, regions: merged, objects };
  }

  /** Forget the last frame: the next diff repaints everything. */
  reset(): void {
    this.key = null;
  }
}
