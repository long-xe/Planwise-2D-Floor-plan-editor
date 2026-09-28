import type { SelectionUnit } from './selection';
import { unitsBounds } from './selection';

export type AlignKind = 'AlignLeft' | 'AlignCenter' | 'AlignRight' | 'AlignTop' | 'AlignMiddle' | 'AlignBottom';
export type DistributeKind = 'DistributeH' | 'DistributeV' | 'DistributeBoth';

export interface UnitOffset {
  unit: SelectionUnit;
  dx: number;
  dy: number;
}

/** Aligns each unit's bounds to the selection bounds (Figma-style: groups move as one). */
export function alignOffsets(units: readonly SelectionUnit[], kind: AlignKind): UnitOffset[] {
  const box = unitsBounds(units);
  if (!box || units.length < 2) return [];
  const cx = (box.minX + box.maxX) / 2;
  const cy = (box.minY + box.maxY) / 2;
  return units.map((unit) => {
    const b = unit.bounds;
    let dx = 0;
    let dy = 0;
    if (kind === 'AlignLeft') dx = box.minX - b.minX;
    if (kind === 'AlignRight') dx = box.maxX - b.maxX;
    if (kind === 'AlignCenter') dx = cx - (b.minX + b.maxX) / 2;
    if (kind === 'AlignTop') dy = box.minY - b.minY;
    if (kind === 'AlignBottom') dy = box.maxY - b.maxY;
    if (kind === 'AlignMiddle') dy = cy - (b.minY + b.maxY) / 2;
    return { unit, dx, dy };
  });
}

/**
 * Equal gaps between neighbouring bounds along an axis; the outermost
 * units stay put. Needs three or more units to mean anything.
 */
function distributeAxis(units: readonly SelectionUnit[], axis: 'x' | 'y'): Map<SelectionUnit, number> {
  const out = new Map<SelectionUnit, number>();
  if (units.length < 3) return out;
  const min = (u: SelectionUnit) => (axis === 'x' ? u.bounds.minX : u.bounds.minY);
  const size = (u: SelectionUnit) => (axis === 'x' ? u.bounds.maxX - u.bounds.minX : u.bounds.maxY - u.bounds.minY);
  const sorted = [...units].sort((a, b) => min(a) + size(a) / 2 - (min(b) + size(b) / 2));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = min(last) + size(last) - min(first);
  const gap = (span - sorted.reduce((s, u) => s + size(u), 0)) / (sorted.length - 1);
  let cursor = min(first);
  for (const u of sorted) {
    out.set(u, cursor - min(u));
    cursor += size(u) + gap;
  }
  return out;
}

export function distributeOffsets(units: readonly SelectionUnit[], kind: DistributeKind): UnitOffset[] {
  const h = kind !== 'DistributeV' ? distributeAxis(units, 'x') : new Map<SelectionUnit, number>();
  const v = kind !== 'DistributeH' ? distributeAxis(units, 'y') : new Map<SelectionUnit, number>();
  if (!h.size && !v.size) return [];
  return units.map((unit) => ({ unit, dx: h.get(unit) ?? 0, dy: v.get(unit) ?? 0 }));
}
