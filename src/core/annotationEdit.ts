import type { Annotation, AnnotationStyle } from './annotations';
import { type AnnotationPart, type Measure, hitShape, layoutAnnotation } from './annotationLayout';
import type { Doc } from './document';
import { layersTopDown } from './document';
import type { Viewport } from './viewport';
import type { Vec2 } from '../geometry/vec';

export interface PartRef {
  id: string;
  part: AnnotationPart;
}

const add = (p: Vec2, d: Vec2): Vec2 => ({ x: p.x + d.x, y: p.y + d.y });

/**
 * The annotation after dragging one of its pieces by `d` metres. A box
 * moves without its leader dot (and the other way round), a room label
 * moves inside its room, and a dimension run only slides out or in along
 * its normal — its ends stay on what it measures.
 */
export function moveAnnotationPart(a: Annotation, part: AnnotationPart, d: Vec2): Annotation {
  switch (a.type) {
    case 'note':
    case 'callout':
      return part.kind === 'anchor' ? { ...a, anchor: add(a.anchor, d) } : { ...a, box: add(a.box, d) };
    case 'text':
      return { ...a, at: add(a.at, d) };
    case 'area':
      if (part.kind !== 'room') return a;
      return { ...a, rooms: a.rooms.map((r, i) => (i === part.index ? { ...r, label: add(r.label, d) } : r)) };
    case 'revision':
      // The tag alone, or the whole cloud with its tag.
      return part.kind === 'cloud'
        ? { ...a, cloud: a.cloud.map((p) => add(p, d)), tag: add(a.tag, d) }
        : { ...a, tag: add(a.tag, d) };
    case 'dimension': {
      if (part.kind !== 'run') return a;
      return {
        ...a,
        runs: a.runs.map((run, i) => {
          if (i !== part.index) return run;
          const p = run.points[0]!;
          const q = run.points.at(-1)!;
          const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
          const along = (d.x * (q.y - p.y) - d.y * (q.x - p.x)) / len;
          return { ...run, offset: Math.round((run.offset + along) * 1000) / 1000 };
        }),
      };
    }
  }
}

/** The words a double-click edits, or null (dimensions have none of their own). */
export function partText(a: Annotation, part: AnnotationPart): string | null {
  switch (a.type) {
    case 'note':
      return a.text;
    // Title on the first line, body on the second.
    case 'callout':
      return `${a.title}\n${a.body}`;
    case 'text':
      return a.text;
    case 'area':
      return part.kind === 'room' ? (a.rooms[part.index]?.name ?? null) : null;
    case 'revision':
      return a.text;
    case 'dimension':
      return null;
  }
}

const short = (t: string) => (t.length > 24 ? `${t.slice(0, 24)}…` : t);

/** The annotation with new words; blank text leaves it as it was. Names follow, as the Layers list shows them. */
export function withPartText(a: Annotation, part: AnnotationPart, raw: string): Annotation {
  const text = raw.trim();
  // Untouched words keep the annotation as is (and its name: the demo's are hand-written).
  if (!text || text === partText(a, part)?.trim()) return a;
  switch (a.type) {
    case 'note':
      return { ...a, text, name: `Note · ${short(text).toLowerCase()}` };
    case 'callout': {
      const [title = '', ...rest] = text.split('\n');
      return { ...a, title: title.trim(), body: rest.join(' ').trim(), name: `Callout · ${short(title.trim())}` };
    }
    case 'text':
      return { ...a, text, name: `Text · ${short(text)}` };
    case 'area':
      if (part.kind !== 'room') return a;
      return { ...a, rooms: a.rooms.map((r, i) => (i === part.index ? { ...r, name: text } : r)) };
    case 'revision':
      return { ...a, text };
    case 'dimension':
      return a;
  }
}

/**
 * The annotation piece under a screen point: layers top-down (hidden and
 * locked ones can't be picked), and within a layer the last-drawn first.
 */
export function pickAnnotation(
  doc: Doc,
  v: Viewport,
  screen: Vec2,
  style: AnnotationStyle,
  measure: Measure,
): (PartRef & { layerOrder: number }) | null {
  for (const layer of layersTopDown(doc)) {
    if (!layer.visible || layer.locked) continue;
    for (let i = doc.objects.length - 1; i >= 0; i--) {
      const o = doc.objects[i]!;
      if (o.kind !== 'annotation' || o.layerId !== layer.id) continue;
      const hit = layoutAnnotation(o, v, style, measure).find((p) => hitShape(p.shape, screen));
      if (hit) return { id: o.id, part: hit.part, layerOrder: layer.order };
    }
  }
  return null;
}
