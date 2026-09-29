import {
  type AnnotationStyle,
  type DimensionAnnotation,
  type NoteAnnotation,
  PRECISIONS,
  type Terminator,
  type Units,
  formatLength,
} from './annotations';
import { newObjectId } from './editActions';
import type { MeasurePoint } from './measureSnap';
import type { EditorStore } from './store';
import { AddObjectsCommand } from './structureCommands';
import type { Vec2 } from '../geometry/vec';
import { scaleOf } from './viewport';

/** Measure tool and annotation display settings (design 10, right panel). */
export interface MeasureSettings {
  units: Units;
  /** Metres (metric) or inches (imperial), one of PRECISIONS[units]. */
  precision: number;
  terminator: Terminator;
  snapWalls: boolean;
  snapFurniture: boolean;
  showAreas: boolean;
}

export const DEFAULT_MEASURE: MeasureSettings = {
  units: 'metric',
  precision: 0.01,
  terminator: 'tick',
  snapWalls: true,
  snapFurniture: true,
  showAreas: true,
};

/** The measurement in progress: first click, the live (or second-click) end, and the hover snap. */
export interface MeasureDraft {
  a: MeasurePoint | null;
  b: MeasurePoint | null;
  /** Second click placed: the measurement waits for Enter (keep) or a new click. */
  fixed: boolean;
  hover: MeasurePoint | null;
}

const EMPTY: MeasureDraft = { a: null, b: null, fixed: false, hover: null };

/** "29 Sep", like the design's note header. */
const noteDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/**
 * Annotations screen state (design 10): the Measure tool's draft on its
 * own channel (it changes with every pointer move), the display settings,
 * and the two things a measurement can become — a kept dimension or a
 * note — each a single AddAnnotation command.
 */
export class MeasureState {
  settings: MeasureSettings = { ...DEFAULT_MEASURE };
  draft: MeasureDraft = EMPTY;
  private listeners = new Set<() => void>();

  constructor(private readonly store: EditorStore) {}

  subscribeDraft = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getDraft = (): MeasureDraft => this.draft;

  get style(): AnnotationStyle {
    const s = this.settings;
    return { format: { units: s.units, precision: s.precision }, terminator: s.terminator, showAreas: s.showAreas };
  }

  /** Switching units picks that system's equivalent precision (0.01 m ↔ ½″). */
  set(patch: Partial<MeasureSettings>): void {
    const next = { ...this.settings, ...patch };
    if (patch.units && patch.units !== this.settings.units && patch.precision === undefined) {
      const i = PRECISIONS[this.settings.units].indexOf(this.settings.precision);
      next.precision = PRECISIONS[patch.units][Math.max(0, i)]!;
    }
    this.settings = next;
    this.store.dirty = true;
    this.store.changed();
  }

  setDraft(d: MeasureDraft): void {
    this.draft = d;
    this.store.dirty = true;
    for (const fn of this.listeners) fn();
  }

  clear(): void {
    this.setDraft(EMPTY);
    this.store.changed();
  }

  /** Both ends placed (or the live end following the pointer). */
  get segment(): { a: Vec2; b: Vec2; len: number } | null {
    const { a, b } = this.draft;
    if (!a || !b) return null;
    return { a: a.point, b: b.point, len: Math.hypot(b.point.x - a.point.x, b.point.y - a.point.y) };
  }

  /** Enter / "Keep as dimension": one AddAnnotation, then a fresh measure. False if refused (layer locked). */
  keep(): boolean {
    const seg = this.segment;
    if (!seg || seg.len < 0.01) return false;
    const dim: DimensionAnnotation = {
      kind: 'annotation',
      type: 'dimension',
      id: newObjectId(this.store.doc, 'a_'),
      layerId: 'annotations',
      name: `Dimension · ${formatLength(seg.len, this.style.format)}`,
      runs: [{ points: [seg.a, seg.b], offset: 0 }],
    };
    if (!this.store.stack.execute(new AddObjectsCommand('AddAnnotation', [dim], []))) return false;
    this.clear();
    return true;
  }

  /** "Add note here": a note pinned to the measurement's middle (or the hovered point). */
  addNote(text = 'New note'): boolean {
    const seg = this.segment;
    const at = seg ? { x: (seg.a.x + seg.b.x) / 2, y: (seg.a.y + seg.b.y) / 2 } : this.draft.hover?.point;
    if (!at) return false;
    const px = 1 / scaleOf(this.store.viewport);
    const note: NoteAnnotation = {
      kind: 'annotation',
      type: 'note',
      id: newObjectId(this.store.doc, 'a_'),
      layerId: 'annotations',
      name: `Note · ${text.toLowerCase()}`,
      // The box sits below-right of the pin, 24 × 40 px away at any zoom.
      anchor: at,
      box: { x: at.x + 24 * px, y: at.y + 40 * px },
      author: 'MR',
      date: noteDate(new Date()),
      text,
    };
    if (!this.store.stack.execute(new AddObjectsCommand('AddAnnotation', [note], []))) return false;
    this.clear();
    return true;
  }
}
