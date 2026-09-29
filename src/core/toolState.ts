import { AnnotationEditState } from './annotationState';
import type { WallAlign } from './document';
import { ElectricalState } from './electricalState';
import { FurnitureState } from './furnitureState';
import { MeasureState } from './measureState';
import { PlaceState } from './placeState';
import type { EditorStore } from './store';
import type { WallAngleOption, WallSnapKind } from './wallSnap';
import type { Vec2 } from '../geometry/vec';

export type ToolId =
  | 'select'
  | 'hand'
  | 'wall'
  | 'door'
  | 'window'
  | 'furniture'
  | 'text'
  | 'dimension'
  | 'measure'
  | 'note'
  | 'revision'
  | 'electrical';

/** Wall tool settings (right panel, design 04). */
export interface WallSettings {
  thickness: number;
  height: number;
  align: WallAlign;
  angles: WallAngleOption[];
  endpoints: boolean;
  /** Mitred corners (off: square ends everywhere). Affects how all walls draw. */
  autoJoin: boolean;
  /** Keep drawing from the last point after each click. */
  chain: boolean;
  showLengths: boolean;
}

// Design defaults (04): 0.16 m × 2.70 m, centred, 0° / 45° / 90° on, everything else on.
export const DEFAULT_WALL: WallSettings = {
  thickness: 0.16,
  height: 2.7,
  align: 'center',
  angles: [0, 45, 90],
  endpoints: true,
  autoJoin: true,
  chain: true,
  showLengths: true,
};

/** The segment under the pointer, for the canvas preview and the Current segment panel. */
export interface WallDraft {
  /** Chain's last point, or the hovered point before the first click. */
  start: Vec2;
  end: Vec2;
  /** False while hovering before the first point is placed. */
  placing: boolean;
  kind: WallSnapKind;
  angle: number | null;
  snapped: boolean;
  startJoin: 'corner' | 'T-junction' | 'free';
  /** Free space ahead of the pointer along the segment, to the next wall face. */
  ahead: { to: Vec2; dist: number } | null;
}

/** Which tool is active, the Wall tool's settings and chain (04), and the Furniture tool's state (05). */
export class ToolState {
  active: ToolId = 'select';
  wall: WallSettings = { ...DEFAULT_WALL, angles: [...DEFAULT_WALL.angles] };
  /** Points placed in the current chain. */
  chain: Vec2[] = [];
  draft: WallDraft | null = null;
  readonly furniture: FurnitureState;
  /** Measure tool and annotation settings (10). */
  readonly measure: MeasureState;
  /** Door, Window, Dimension, Text and Note tools. */
  readonly place: PlaceState;
  /** Select tool on annotations: clicked piece, hover, inline editor. */
  readonly annotation: AnnotationEditState;
  /** Electrical tool: armed fixture, circuit, preview. */
  readonly electrical: ElectricalState;
  private draftListeners = new Set<() => void>();

  constructor(private readonly store: EditorStore) {
    this.furniture = new FurnitureState(store);
    this.measure = new MeasureState(store);
    this.place = new PlaceState(store);
    this.annotation = new AnnotationEditState(store);
    this.electrical = new ElectricalState(store);
  }

  /** The draft changes on every pointer move: only its readouts listen, not whole panels. */
  subscribeDraft = (fn: () => void): (() => void) => {
    this.draftListeners.add(fn);
    return () => this.draftListeners.delete(fn);
  };

  getDraft = (): WallDraft | null => this.draft;

  setActive(id: ToolId): void {
    this.active = id;
    // Switching tools abandons an unfinished chain (placed segments stay).
    this.chain = [];
    this.setDraft(null);
    this.furniture.setGhost(null);
    if (this.measure.draft.a || this.measure.draft.hover)
      this.measure.setDraft({ a: null, b: null, fixed: false, hover: null });
    this.place.reset();
    this.annotation.reset();
    this.electrical.reset();
    // The Furniture tool works from the Library tab (design 05).
    if (id === 'furniture') this.store.history.setTab('library');
    this.store.changed();
  }

  setWall(patch: Partial<WallSettings>): void {
    this.wall = { ...this.wall, ...patch };
    this.store.changed();
  }

  toggleAngle(a: WallAngleOption): void {
    const has = this.wall.angles.includes(a);
    this.setWall({ angles: has ? this.wall.angles.filter((x) => x !== a) : [...this.wall.angles, a] });
  }

  /** Canvas-only change: repaint without re-rendering React panels on every move. */
  setDraft(d: WallDraft | null): void {
    this.draft = d;
    this.store.dirty = true;
    for (const fn of this.draftListeners) fn();
  }
}
