import type { Doc, ItemIcon, Layer } from './document';
import { DEFAULT_LAYER_IDS } from './document';
import { aabbOf } from '../geometry/transform';
import { type Rect, boundsOf, unionRect } from '../geometry/vec';

export function layerObjects(doc: Doc, layerId: string) {
  return doc.objects.filter((o) => o.layerId === layerId);
}

export function isCustomLayer(layer: Layer): boolean {
  return !DEFAULT_LAYER_IDS.includes(layer.id);
}

/** Card subtitle state (08): "hidden", "static cache", "custom", "dynamic". */
export function layerStatus(layer: Layer): 'hidden' | 'static cache' | 'custom' | 'dynamic' {
  if (!layer.visible) return 'hidden';
  if (layer.locked || layer.cacheAsStatic) return 'static cache';
  return isCustomLayer(layer) ? 'custom' : 'dynamic';
}

export function contentBounds(doc: Doc, layerId: string): Rect | null {
  let box: Rect | null = null;
  for (const o of layerObjects(doc, layerId)) {
    // Openings sit inside their wall, so they never widen the bounds.
    if (o.kind === 'opening') continue;
    let r: Rect;
    if (o.kind === 'wall') {
      const h = o.thickness / 2;
      r = boundsOf([
        { x: o.a.x - h, y: o.a.y - h },
        { x: o.b.x + h, y: o.b.y + h },
      ]);
    } else r = aabbOf(o.transform);
    box = box ? unionRect(box, r) : r;
  }
  return box;
}

const CONTENT_LABEL: Record<ItemIcon, string> = {
  outlet: 'Outlets',
  switch: 'Switches',
  light: 'Ceiling lights',
  sofa: 'Seating',
  desk: 'Tables & storage',
  bed: 'Beds',
  bath: 'Bath fixtures',
  plant: 'Plants',
};

/** Right panel "Contents": counts by kind, plus circuits for electrical layers. */
export function layerContents(doc: Doc, layerId: string): { label: string; count: number }[] {
  const counts = new Map<string, number>();
  const circuits = new Set<string>();
  let walls = 0;
  let doors = 0;
  let windows = 0;
  for (const o of layerObjects(doc, layerId)) {
    if (o.kind === 'wall') {
      walls++;
      continue;
    }
    if (o.kind === 'opening') {
      if (o.type === 'door') doors++;
      else windows++;
      continue;
    }
    const label = CONTENT_LABEL[o.icon];
    counts.set(label, (counts.get(label) ?? 0) + 1);
    if (o.circuit) circuits.add(o.circuit);
  }
  const rows = [...counts].map(([label, count]) => ({ label, count }));
  if (walls) rows.unshift({ label: 'Wall segments', count: walls });
  if (doors) rows.push({ label: 'Doors', count: doors });
  if (windows) rows.push({ label: 'Windows', count: windows });
  if (circuits.size) rows.push({ label: 'Circuits', count: circuits.size });
  return rows;
}

/**
 * Cheap fingerprint of a layer's geometry and style. Any edit that could
 * change its pixels changes this number, so the cache is "redrawn on edit"
 * without commands having to report which layer they touched.
 */
export function layerSignature(doc: Doc, layer: Layer): number {
  let h = 17;
  const mix = (n: number) => {
    h = (Math.imul(h, 31) + Math.round(n * 1000)) | 0;
  };
  mix(layer.color.length + parseInt(layer.color.slice(1), 16));
  for (const o of doc.objects) {
    if (o.layerId !== layer.id) continue;
    if (o.kind === 'wall') {
      mix(o.a.x);
      mix(o.a.y);
      mix(o.b.x);
      mix(o.b.y);
      mix(o.thickness);
    } else if (o.kind === 'opening') {
      mix(o.offset);
      mix(o.width);
      mix(o.type === 'door' ? (o.swing ?? 1) * (o.hinge === 'end' ? 2 : 1) : 0);
    } else {
      const t = o.transform;
      mix(t.x);
      mix(t.y);
      mix(t.w);
      mix(t.h);
      mix(t.rotation);
      mix(t.flipX ? 1 : 0);
      mix(o.appearance.strokeWidth);
      mix(o.appearance.fillOpacity);
      mix(o.appearance.fill.length + parseInt(o.appearance.fill.slice(1), 16));
    }
  }
  return h;
}
