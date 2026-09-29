import type { Transaction } from '../core/commandStack';
import type { Annotation } from '../core/annotations';
import { type PartRef, moveAnnotationPart, pickAnnotation } from '../core/annotationEdit';
import type { AnnotationPart } from '../core/annotationLayout';
import { findLayer, findObject } from '../core/document';
import type { HitReport } from '../core/picking';
import type { EditorStore } from '../core/store';
import { EditObjectsCommand } from '../core/structureCommands';
import type { Vec2 } from '../geometry/vec';
import { measureText } from '../render/textMeasure';

/**
 * The annotation piece under the pointer, if it paints over whatever the
 * object pick found: annotations live on their own layer, so layer order
 * decides, the same rule that makes a higher layer win for furniture.
 */
export function annotationUnder(store: EditorStore, screen: Vec2, report: HitReport | null): PartRef | null {
  const hit = pickAnnotation(store.doc, store.viewport, screen, store.tools.measure.style, measureText);
  if (!hit) return null;
  const under = report?.id ? findObject(store.doc, report.id) : undefined;
  const order = under ? (findLayer(store.doc, under.layerId)?.order ?? -1) : -1;
  return hit.layerOrder >= order ? { id: hit.id, part: hit.part } : null;
}

/**
 * Dragging one annotation piece (a note's box, its pin, a room label, a
 * dimension line…): one transaction, previewed live and committed as a
 * single MoveAnnotation on pointer up — or dropped if it never moved.
 */
export class AnnotationDrag {
  private state: { origin: Vec2; start: Annotation; part: AnnotationPart; tx: Transaction } | null = null;

  get active(): boolean {
    return !!this.state;
  }

  begin(store: EditorStore, ref: PartRef, origin: Vec2): void {
    const a = store.tools.annotation.annotation(ref.id);
    if (a) this.state = { origin, start: structuredClone(a), part: ref.part, tx: store.stack.begin() };
  }

  move(world: Vec2): void {
    const s = this.state;
    if (!s) return;
    const d = { x: world.x - s.origin.x, y: world.y - s.origin.y };
    s.tx.update(
      new EditObjectsCommand('MoveAnnotation', [{ from: s.start, to: moveAnnotationPart(s.start, s.part, d) }]),
    );
  }

  end(): void {
    this.state?.tx.commit();
    this.state = null;
  }

  cancel(): void {
    this.state?.tx.rollback();
    this.state = null;
  }
}
