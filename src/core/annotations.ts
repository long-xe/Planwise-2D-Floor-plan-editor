import type { Vec2 } from '../geometry/vec';

/**
 * Annotations (design 10) live on the Annotations layer like any object:
 * they list, hide, lock, undo and save with the plan. Positions are in
 * metres; boxes (callout, note) are laid out in screen pixels from a world
 * anchor so their text stays readable at any zoom.
 */
interface AnnotationBase {
  kind: 'annotation';
  id: string;
  layerId: string;
  name: string;
}

/**
 * One row of a dimension chain: collinear measured points, and how far the
 * dimension line sits from them (metres, along n = (u.y, -u.x) for the
 * direction u from first to last point — above a left-to-right run).
 */
export interface DimensionRun {
  points: Vec2[];
  offset: number;
  /** Label with the unit ("12.00 m"): the overall row of a chain. */
  unit?: boolean;
}

export interface DimensionAnnotation extends AnnotationBase {
  type: 'dimension';
  runs: DimensionRun[];
}

export interface RoomArea {
  name: string;
  polygon: Vec2[];
  /** Where the name sits; the area goes under it. */
  label: Vec2;
}

export interface AreaAnnotation extends AnnotationBase {
  type: 'area';
  rooms: RoomArea[];
}

export interface CalloutAnnotation extends AnnotationBase {
  type: 'callout';
  /** The point it's about (leader dot), and the box's top-left corner. */
  anchor: Vec2;
  box: Vec2;
  title: string;
  body: string;
}

export interface NoteAnnotation extends AnnotationBase {
  type: 'note';
  anchor: Vec2;
  box: Vec2;
  author: string;
  date: string;
  text: string;
}

export interface RevisionAnnotation extends AnnotationBase {
  type: 'revision';
  /** Outline the scallops follow. */
  cloud: Vec2[];
  rev: number;
  /** The Δ tag's position, and what changed. */
  tag: Vec2;
  text: string;
}

/** A plain label (Text tool): top-left at `at`, `size` px on screen. */
export interface TextAnnotation extends AnnotationBase {
  type: 'text';
  at: Vec2;
  text: string;
  size: number;
}

export type Annotation =
  DimensionAnnotation | AreaAnnotation | CalloutAnnotation | NoteAnnotation | RevisionAnnotation | TextAnnotation;

/** Shoelace area of a simple polygon, m². */
export function polygonArea(pts: readonly Vec2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

/** How many measurements an annotation holds (the Layers list count), or null. */
export function measureCount(a: Annotation): number | null {
  if (a.type === 'dimension') return a.runs.reduce((n, r) => n + r.points.length - 1, 0);
  if (a.type === 'area') return a.rooms.length;
  return null;
}

export type Units = 'metric' | 'imperial';

/** Units & precision (design 10). Precision is metres for metric, inches for imperial. */
export interface MeasureFormat {
  units: Units;
  precision: number;
}

export const PRECISIONS: Record<Units, number[]> = { metric: [0.1, 0.01, 0.001], imperial: [1, 0.5, 0.25] };

const M_PER_IN = 0.0254;
const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

const decimals = (step: number) => Math.max(0, Math.round(-Math.log10(step)));

/** "2.64 m" / "2.64", or "8′ 8″" / "8′ 7½″" in imperial. */
export function formatLength(m: number, f: MeasureFormat, withUnit = true): string {
  if (f.units === 'metric') {
    const v = (Math.round(m / f.precision) * f.precision).toFixed(decimals(f.precision));
    return withUnit ? `${v} m` : v;
  }
  const inches = Math.round(Math.abs(m) / M_PER_IN / f.precision) * f.precision;
  const ft = Math.floor(inches / 12);
  const rest = inches - ft * 12;
  const whole = Math.floor(rest);
  const frac = FRACTIONS[rest - whole] ?? '';
  return `${m < 0 ? '−' : ''}${ft}′ ${whole}${frac}″`;
}

/** "36.8 m²", or square feet in imperial. */
export function formatArea(m2: number, f: MeasureFormat): string {
  return f.units === 'metric' ? `${m2.toFixed(1)} m²` : `${Math.round(m2 * 10.7639)} ft²`;
}

export type Terminator = 'tick' | 'arrow' | 'dot';

/** How annotations draw (design 10, Units & precision and Dimension style). */
export interface AnnotationStyle {
  format: MeasureFormat;
  terminator: Terminator;
  showAreas: boolean;
}
