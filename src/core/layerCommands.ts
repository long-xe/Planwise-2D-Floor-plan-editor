import type { Command } from './commands';
import type { Doc, Layer, SceneObject } from './document';
import { findLayer } from './document';

export type LayerPatch = Partial<Omit<Layer, 'id' | 'order'>>;
export type LayerPropsType = 'ToggleLayer' | 'SetLayerOpacity' | 'RenameLayer' | 'SetLayerColor';

/**
 * Any change to a layer's own settings. Layer commands are exempt from the
 * locked-layer rule: unlocking a locked layer has to be possible.
 */
export class LayerPropsCommand implements Command {
  constructor(
    readonly type: LayerPropsType,
    readonly layerId: string,
    readonly from: LayerPatch,
    public to: LayerPatch,
    public ts: number = Date.now(),
  ) {}

  static of(doc: Doc, type: LayerPropsType, layerId: string, to: LayerPatch): LayerPropsCommand | null {
    const layer = findLayer(doc, layerId);
    if (!layer) return null;
    const from = Object.fromEntries(Object.keys(to).map((k) => [k, layer[k as keyof LayerPatch]])) as LayerPatch;
    return new LayerPropsCommand(type, layerId, from, to);
  }

  describe(): string {
    const [key, value] = Object.entries(this.to)[0] ?? ['', ''];
    const shown = typeof value === 'number' ? `${Math.round(value * 100)}%` : JSON.stringify(value);
    return `${this.type}(${this.layerId}, ${key}: ${shown})`;
  }

  execute(doc: Doc): void {
    const layer = findLayer(doc, this.layerId);
    if (layer) Object.assign(layer, this.to);
  }

  undo(doc: Doc): void {
    const layer = findLayer(doc, this.layerId);
    if (layer) Object.assign(layer, this.from);
  }

  /** An opacity slider drag is one entry, not one per pixel. */
  merge(next: Command): boolean {
    if (!(next instanceof LayerPropsCommand) || next.type !== 'SetLayerOpacity' || this.type !== 'SetLayerOpacity')
      return false;
    if (next.layerId !== this.layerId) return false;
    this.to = { ...next.to };
    this.ts = next.ts;
    return true;
  }
}

export const ordersOf = (doc: Doc): Map<string, number> => new Map(doc.layers.map((l) => [l.id, l.order]));

/**
 * Moves a layer to `to` in the top-down list. Orders are rewritten as a
 * whole so they stay dense; undo restores the exact previous numbers.
 */
export class ReorderLayerCommand implements Command {
  readonly type = 'ReorderLayer';
  private readonly before: Map<string, number>;
  private readonly after: Map<string, number>;

  /**
   * `base` is the order snapshot from drag start: during a drag the
   * document already shows the previous preview, which must not leak into
   * what undo restores.
   */
  constructor(
    doc: Doc,
    readonly layerId: string,
    readonly from: number,
    readonly to: number,
    public ts: number = Date.now(),
    base: ReadonlyMap<string, number> = ordersOf(doc),
  ) {
    this.before = new Map(base);
    const ids = [...base]
      .toSorted((a, b) => b[1] - a[1])
      .map(([id]) => id)
      .filter((id) => id !== layerId);
    ids.splice(to, 0, layerId);
    this.after = new Map(ids.map((id, i) => [id, ids.length - 1 - i]));
  }

  describe(): string {
    return `ReorderLayer(${this.layerId}, from: ${this.from} → to: ${this.to})`;
  }

  execute(doc: Doc): void {
    for (const l of doc.layers) l.order = this.after.get(l.id) ?? l.order;
  }

  undo(doc: Doc): void {
    for (const l of doc.layers) l.order = this.before.get(l.id) ?? l.order;
  }
}

/** New layer on top of the stack ("+ New layer"). */
export class AddLayerCommand implements Command {
  readonly type = 'AddLayer';

  constructor(
    readonly layer: Layer,
    public ts: number = Date.now(),
  ) {}

  describe(): string {
    return `AddLayer(${this.layer.id})`;
  }

  execute(doc: Doc): void {
    doc.layers.push({ ...this.layer });
  }

  undo(doc: Doc): void {
    doc.layers = doc.layers.filter((l) => l.id !== this.layer.id);
  }
}

/** Removes a layer and everything on it; undo brings both back in place. */
export class DeleteLayerCommand implements Command {
  readonly type = 'DeleteLayer';
  private readonly layer: Layer;
  private readonly layerIndex: number;
  private readonly objects: { index: number; obj: SceneObject }[];

  constructor(
    doc: Doc,
    readonly layerId: string,
    public ts: number = Date.now(),
  ) {
    this.layerIndex = doc.layers.findIndex((l) => l.id === layerId);
    this.layer = { ...doc.layers[this.layerIndex]! };
    this.objects = doc.objects
      .map((obj, index) => ({ index, obj: structuredClone(obj) }))
      .filter((r) => r.obj.layerId === layerId);
  }

  describe(): string {
    return `DeleteLayer(${this.layerId}, ${this.objects.length} objects)`;
  }

  canExecute(doc: Doc): boolean {
    return this.layerIndex >= 0 && doc.layers.length > 1;
  }

  execute(doc: Doc): void {
    doc.layers = doc.layers.filter((l) => l.id !== this.layerId);
    doc.objects = doc.objects.filter((o) => o.layerId !== this.layerId);
  }

  undo(doc: Doc): void {
    doc.layers.splice(this.layerIndex, 0, { ...this.layer });
    for (const r of this.objects) doc.objects.splice(r.index, 0, structuredClone(r.obj));
  }
}

/** Design palette for layer colours (Layer · Color swatches, 08). */
export const LAYER_COLORS = ['#2F5DA8', '#D9623B', '#6E9B7B', '#E0A526', '#1B2A41', '#8A6FB0'] as const;

export function newLayer(doc: Doc): Layer {
  let n = doc.layers.length + 1;
  while (doc.layers.some((l) => l.id === `layer_${n}`)) n++;
  const top = Math.max(-1, ...doc.layers.map((l) => l.order));
  return {
    id: `layer_${n}`,
    name: `Layer ${n}`,
    color: LAYER_COLORS[n % LAYER_COLORS.length]!,
    visible: true,
    locked: false,
    opacity: 1,
    order: top + 1,
    includeInPrint: true,
    snapTargets: true,
    cacheAsStatic: false,
  };
}
