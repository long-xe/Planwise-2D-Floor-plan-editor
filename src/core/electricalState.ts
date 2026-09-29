import { nextCircuitId } from './circuits';
import type { FixtureIcon, Furniture } from './document';
import type { FixturePlacement } from './fixturePlace';
import type { EditorStore } from './store';
import { fixtureObject } from '../library/electrical';
import { roomOf } from './rooms';

export interface FixturePreview {
  kind: FixtureIcon;
  at: FixturePlacement;
}

/**
 * Electrical tool and Library state: which fixture is armed, the circuit
 * new switches and lights are wired into (null = none), the canvas
 * preview, and a Library card being dragged onto the plan.
 */
export class ElectricalState {
  kind: FixtureIcon = 'outlet';
  circuit: string | null = null;
  preview: FixturePreview | null = null;
  /** A Library card is being dragged out: releasing over the canvas drops it. */
  dragging = false;

  constructor(private readonly store: EditorStore) {}

  setKind(kind: FixtureIcon): void {
    this.kind = kind;
    this.store.changed();
  }

  setCircuit(id: string | null): void {
    this.circuit = id;
    this.store.changed();
  }

  /** Arms a fresh circuit: the next switch or light placed starts it. */
  newCircuit(): string {
    const id = nextCircuitId(this.store.doc, [this.circuit]);
    this.setCircuit(id);
    return id;
  }

  /** Library card pressed: arm the fixture and hand the drop to the Electrical tool. */
  startDrag(kind: FixtureIcon): void {
    this.store.tools.setActive('electrical');
    this.kind = kind;
    this.dragging = true;
    this.store.changed();
  }

  endDrag(): void {
    if (!this.dragging) return;
    this.dragging = false;
    this.store.changed();
  }

  /** Canvas-only: repaint, no panel re-render. */
  setPreview(p: FixturePreview | null): void {
    this.preview = p;
    this.store.dirty = true;
  }

  reset(): void {
    this.preview = null;
    this.dragging = false;
  }

  /** The previewed fixture as a document object, on the armed circuit when it's wired. */
  toFixture(p: FixturePreview, id: string): Furniture {
    const f = fixtureObject(p.kind, id, p.at.transform, this.circuit);
    const room = roomOf(this.store.doc, p.at.transform);
    if (room) f.room = room;
    return f;
  }
}
