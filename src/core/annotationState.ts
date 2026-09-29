import type { Annotation } from './annotations';
import { type AnnotationPart, samePart } from './annotationLayout';
import { type PartRef, partText, withPartText } from './annotationEdit';
import { findObject } from './document';
import type { EditorStore } from './store';

const sameRef = (a: PartRef | null, b: PartRef | null) =>
  a === b || (!!a && !!b && a.id === b.id && samePart(a.part, b.part));

/**
 * Editing annotations with the Select tool: which piece was clicked last
 * (its room row lights up in Properties; Delete takes just that room),
 * which one the pointer is over, and the inline editor a double-click
 * opens. Document changes still go through commands (EditAnnotation,
 * MoveAnnotation, RenameRoom, DeleteRoom).
 */
export class AnnotationEditState {
  focus: PartRef | null = null;
  hover: PartRef | null = null;
  editing: PartRef | null = null;

  constructor(private readonly store: EditorStore) {}

  annotation(id: string): Annotation | null {
    const o = findObject(this.store.doc, id);
    return o?.kind === 'annotation' ? o : null;
  }

  /** The clicked piece of `id`, while it's still the one selected. */
  focusedPart(id: string): AnnotationPart | null {
    return this.focus?.id === id && this.store.selection.includes(id) ? this.focus.part : null;
  }

  setFocus(ref: PartRef | null): void {
    this.focus = ref;
    this.store.changed();
  }

  /** Canvas-only highlight: repaint, no panel re-render. */
  setHover(ref: PartRef | null): void {
    if (sameRef(this.hover, ref)) return;
    this.hover = ref;
    this.store.dirty = true;
  }

  /** Opens the inline editor on a piece with words of its own; false for dimensions. */
  openEditor(ref: PartRef): boolean {
    const a = this.annotation(ref.id);
    if (!a || partText(a, ref.part) === null) return false;
    this.editing = ref;
    this.focus = ref;
    this.store.changed();
    return true;
  }

  closeEditor(): void {
    if (!this.editing) return;
    this.editing = null;
    this.store.changed();
  }

  /** Enter or blur in the inline editor: one undoable edit if the words changed. */
  commitText(ref: PartRef, raw: string): void {
    if (this.editing === ref) this.editing = null;
    const a = this.annotation(ref.id);
    if (a)
      this.store.editObjects(ref.part.kind === 'room' ? 'RenameRoom' : 'EditAnnotation', [
        withPartText(a, ref.part, raw),
      ]);
    this.store.changed();
  }

  /**
   * Delete with one room label clicked removes that room (its label and
   * its line in the area schedule), not every room. False otherwise, so
   * the whole selection is deleted as usual.
   */
  deleteFocusedRoom(): boolean {
    const sel = this.store.selection;
    const part = sel.length === 1 ? this.focusedPart(sel[0]!) : null;
    const a = part?.kind === 'room' ? this.annotation(sel[0]!) : null;
    if (a?.type !== 'area' || part?.kind !== 'room' || a.rooms.length < 2) return false;
    this.focus = null;
    this.store.editObjects('DeleteRoom', [{ ...a, rooms: a.rooms.filter((_, i) => i !== part.index) }]);
    return true;
  }

  reset(): void {
    this.hover = null;
    this.editing = null;
  }
}
