import type { NoteAnnotation, RevisionAnnotation, TextAnnotation } from './annotations';
import { newObjectId } from './editActions';
import type { MeasurePoint } from './measureSnap';
import type { OpeningPlacement } from './openingPlace';
import type { EditorStore } from './store';
import { AddObjectsCommand } from './structureCommands';
import type { Vec2 } from '../geometry/vec';
import { scaleOf } from './viewport';
import type { DetectedRoom } from './roomDetect';
import { type RoomRef, RoomGridCache, addRoomCommand, calloutAt } from './roomLabels';

/** Door / Window tool settings (right panel). */
export interface OpeningSettings {
  door: { width: number; hinge: 'start' | 'end' };
  window: { width: number };
}

/** Revision cloud tool: drag a rectangle, or click the outline point by point. */
export type CloudMode = 'rect' | 'points';

/**
 * What the placing tools show on the canvas before a click commits it.
 * A cloud being drawn lives here too (not in the tool), so switching tools
 * drops it along with every other preview.
 */
export type PlacePreview =
  | { kind: 'opening'; at: OpeningPlacement }
  | {
      kind: 'dimension';
      a: MeasurePoint;
      b: MeasurePoint;
      offset: number;
      fixed: boolean;
      /** Extending a placed chain: all its points, the new one included. */
      chain?: Vec2[];
    }
  | { kind: 'cloud'; mode: 'rect'; a: Vec2; b: Vec2 }
  | { kind: 'cloud'; mode: 'points'; points: Vec2[]; hover: Vec2 | null; closing: boolean }
  /** Room mode hovering: the room it would label, one already labelled, or an open space (null). */
  | { kind: 'room'; at: Vec2; room: DetectedRoom | null; labelled: RoomRef | null };

/**
 * An annotation waiting for its words: an input sits on the canvas at `at`.
 * A finished revision cloud waits here for "what changed", with its tag at `at`.
 */
export type TextEntry =
  | { kind: 'text' | 'note' | 'callout'; at: Vec2 }
  | { kind: 'revision'; at: Vec2; cloud: Vec2[]; rev: number }
  /** A room found around the click, waiting for its name (label at the click). */
  | { kind: 'room'; at: Vec2; polygon: Vec2[]; area: number };

/** Text tool: a free label, or a room's name (with its area worked out from the walls). */
export type TextMode = 'label' | 'room';
/** Note tool: a sticky note, or a callout (title + line of detail on a leader). */
export type NoteMode = 'note' | 'callout';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "29 Sep", like the design's note header (Intl's en-GB now says "Sept"). */
const noteDate = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

/**
 * State of the placing tools beside the store: Door, Window, Dimension,
 * Text and Note. Previews are canvas-only (they only mark the frame dirty);
 * everything that lands in the plan goes through one Add… command.
 */
export class PlaceState {
  opening: OpeningSettings = { door: { width: 0.8, hinge: 'start' }, window: { width: 1.2 } };
  textSize = 13;
  cloudMode: CloudMode = 'rect';
  textMode: TextMode = 'label';
  noteMode: NoteMode = 'note';
  /** Dimension tool: after placing one, further clicks extend it as a chain. */
  dimChain = true;
  readonly rooms = new RoomGridCache();
  preview: PlacePreview | null = null;
  entry: TextEntry | null = null;
  /** The open entry's words so far, so a click elsewhere on the canvas can commit them. */
  draft = '';

  constructor(private readonly store: EditorStore) {}

  setPreview(p: PlacePreview | null): void {
    this.preview = p;
    this.store.dirty = true;
  }

  setDoor(patch: Partial<OpeningSettings['door']>): void {
    this.opening = { ...this.opening, door: { ...this.opening.door, ...patch } };
    this.store.changed();
  }

  setWindowWidth(width: number): void {
    this.opening = { ...this.opening, window: { width } };
    this.store.changed();
  }

  setTextSize(size: number): void {
    this.textSize = size;
    this.store.changed();
  }

  setEntry(e: TextEntry | null): void {
    this.entry = e;
    this.draft = '';
    this.store.dirty = true;
    this.store.changed();
  }

  /** Mirrors the input's text; nothing on the canvas depends on it, so no notify. */
  setDraft(text: string): void {
    this.draft = text;
  }

  setTextMode(mode: TextMode): void {
    this.textMode = mode;
    this.preview = null;
    this.store.changed();
  }

  setDimChain(on: boolean): void {
    this.dimChain = on;
    this.store.changed();
  }

  setNoteMode(mode: NoteMode): void {
    this.noteMode = mode;
    this.store.changed();
  }

  /** Switching mode drops a cloud half drawn in the other one. */
  setCloudMode(mode: CloudMode): void {
    this.cloudMode = mode;
    this.preview = null;
    this.store.changed();
  }

  /** The next revision's Δ number: one past the highest on the plan. */
  nextRev(): number {
    let rev = 0;
    for (const o of this.store.doc.objects)
      if (o.kind === 'annotation' && o.type === 'revision') rev = Math.max(rev, o.rev);
    return rev + 1;
  }

  reset(): void {
    this.preview = null;
    this.entry = null;
    this.draft = '';
    this.store.dirty = true;
  }

  /**
   * Turns the open entry's words into a Text label, a Note or a revision
   * cloud (one AddAnnotation). A blank label or note is dropped; a cloud is
   * kept without words ("Rev 3"), since its outline is the point. Only the
   * open entry commits, and only once — a late blur can't add a copy.
   */
  commit(entry: TextEntry, raw: string): boolean {
    if (this.entry !== entry) return false;
    this.setEntry(null);
    const text = raw.trim();
    const id = newObjectId(this.store.doc, 'a_');
    if (entry.kind === 'revision') {
      const cloud: RevisionAnnotation = {
        kind: 'annotation',
        type: 'revision',
        id,
        layerId: 'annotations',
        name: `Revision cloud Δ${entry.rev}`,
        cloud: entry.cloud,
        rev: entry.rev,
        tag: entry.at,
        text,
      };
      return this.store.stack.execute(new AddObjectsCommand('AddAnnotation', [cloud], []));
    }
    if (!text) return false;
    if (entry.kind === 'room') {
      const room = { name: text, polygon: entry.polygon, label: entry.at };
      const cmd = addRoomCommand(this.store.doc, room);
      return !!cmd && this.store.stack.execute(cmd);
    }
    if (entry.kind === 'callout') {
      const c = calloutAt(this.store.doc, entry.at, raw.trim(), 1 / scaleOf(this.store.viewport));
      return this.store.stack.execute(new AddObjectsCommand('AddAnnotation', [c], []));
    }
    const short = text.length > 24 ? `${text.slice(0, 24)}…` : text;
    const px = 1 / scaleOf(this.store.viewport);
    const a: TextAnnotation | NoteAnnotation =
      entry.kind === 'text'
        ? {
            kind: 'annotation',
            type: 'text',
            id,
            layerId: 'annotations',
            name: `Text · ${short}`,
            at: entry.at,
            text,
            size: this.textSize,
          }
        : {
            kind: 'annotation',
            type: 'note',
            id,
            layerId: 'annotations',
            name: `Note · ${short.toLowerCase()}`,
            anchor: entry.at,
            // The box sits below-right of the pin, 24 × 40 px away at any zoom.
            box: { x: entry.at.x + 24 * px, y: entry.at.y + 40 * px },
            author: 'MR',
            date: noteDate(new Date()),
            text,
          };
    return this.store.stack.execute(new AddObjectsCommand('AddAnnotation', [a], []));
  }
}
