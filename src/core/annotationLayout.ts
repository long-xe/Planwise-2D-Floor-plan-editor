import { type Annotation, type AnnotationStyle, formatArea, polygonArea } from './annotations';
import { type Viewport, scaleOf, worldToScreen } from './viewport';
import { distance, distanceToSegment, pointInRect } from '../geometry/hitTest';
import type { Rect, Vec2 } from '../geometry/vec';

// Where each piece of an annotation sits on screen. The renderer draws
// from these numbers and picking, the selection chrome and the inline
// editor hit-test against them, so they can't drift apart. Boxes are laid
// out in screen pixels (text stays readable at any zoom), which is why
// annotations are picked here and not through the world-space HitIndex.

export const NOTE_BOX = { w: 210, h: 74, fold: 20, text: 176 };
export const CALLOUT_H = 48;
/** How far from a leader dot, a dimension line or a cloud's edge still counts as on it. */
const LINE_HIT_PX = 6;
const PAD_PX = 3;

export interface FontSpec {
  weight: number;
  px: number;
  mono?: boolean;
}

/** Text width in px; the canvas measures it, tests pass an estimate. */
export type Measure = (text: string, font: FontSpec) => number;

export const CALLOUT_TITLE: FontSpec = { weight: 600, px: 11 };
export const CALLOUT_BODY: FontSpec = { weight: 400, px: 10 };
export const ROOM_NAME: FontSpec = { weight: 600, px: 11 };
export const ROOM_AREA: FontSpec = { weight: 400, px: 9.5, mono: true };
export const REV_TEXT: FontSpec = { weight: 500, px: 10.5 };
export const textFont = (size: number): FontSpec => ({ weight: 500, px: size });

/**
 * The piece of an annotation under the pointer: a note's or callout's box
 * or its leader dot, a room's label, one run of a dimension chain, a
 * revision cloud's outline, or the label of a Text / revision tag.
 */
export type AnnotationPart =
  | { kind: 'box' }
  | { kind: 'anchor' }
  | { kind: 'label' }
  | { kind: 'cloud' }
  | { kind: 'room'; index: number }
  | { kind: 'run'; index: number };

export type PartShape =
  { kind: 'rect'; rect: Rect } | { kind: 'dot'; at: Vec2 } | { kind: 'line'; points: Vec2[]; closed: boolean };

export interface LaidOutPart {
  part: AnnotationPart;
  shape: PartShape;
}

/** "Rev 2 · swap tub…", or just "Rev 3" for a cloud placed without words. */
export const revisionLabel = (rev: number, text: string): string => (text ? `Rev ${rev} · ${text}` : `Rev ${rev}`);

export function calloutWidth(title: string, body: string, measure: Measure): number {
  return Math.ceil(Math.max(measure(title, CALLOUT_TITLE), measure(body, CALLOUT_BODY))) + 20;
}

const rectAt = (x: number, y: number, w: number, h: number): Rect => ({ minX: x, minY: y, maxX: x + w, maxY: y + h });

/** A dimension run's line on screen: its points pushed out by the offset. */
export function runLine(points: readonly Vec2[], offset: number, v: Viewport): Vec2[] {
  const pts = points.map((p) => worldToScreen(v, p));
  const a = pts[0]!;
  const b = pts.at(-1)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const off = offset * scaleOf(v);
  const n = { x: (b.y - a.y) / len, y: -(b.x - a.x) / len };
  return pts.map((p) => ({ x: p.x + n.x * off, y: p.y + n.y * off }));
}

/** The pickable pieces of one annotation, topmost first (a leader dot wins over its box). */
export function layoutAnnotation(a: Annotation, v: Viewport, style: AnnotationStyle, measure: Measure): LaidOutPart[] {
  switch (a.type) {
    case 'note':
    case 'callout': {
      const box = worldToScreen(v, a.box);
      const w = a.type === 'note' ? NOTE_BOX.w : calloutWidth(a.title, a.body, measure);
      const h = a.type === 'note' ? NOTE_BOX.h : CALLOUT_H;
      return [
        { part: { kind: 'anchor' }, shape: { kind: 'dot', at: worldToScreen(v, a.anchor) } },
        { part: { kind: 'box' }, shape: { kind: 'rect', rect: rectAt(box.x, box.y, w, h) } },
      ];
    }
    case 'text': {
      const p = worldToScreen(v, a.at);
      const w = measure(a.text, textFont(a.size));
      return [{ part: { kind: 'label' }, shape: { kind: 'rect', rect: rectAt(p.x, p.y, w, a.size * 1.25) } }];
    }
    case 'area': {
      if (!style.showAreas) return [];
      return a.rooms.map((room, index) => {
        const p = worldToScreen(v, room.label);
        const area = formatArea(polygonArea(room.polygon), style.format);
        const w = Math.max(measure(room.name, ROOM_NAME), measure(area, ROOM_AREA));
        return { part: { kind: 'room', index }, shape: { kind: 'rect', rect: rectAt(p.x - w / 2, p.y, w, 27) } };
      });
    }
    case 'revision': {
      const tag = worldToScreen(v, a.tag);
      const w = 38 + measure(revisionLabel(a.rev, a.text), REV_TEXT);
      return [
        { part: { kind: 'label' }, shape: { kind: 'rect', rect: rectAt(tag.x, tag.y, w, 28) } },
        {
          part: { kind: 'cloud' },
          shape: { kind: 'line', points: a.cloud.map((p) => worldToScreen(v, p)), closed: true },
        },
      ];
    }
    case 'dimension':
      return a.runs.map((run, index) => ({
        part: { kind: 'run', index },
        shape: { kind: 'line', points: runLine(run.points, run.offset, v), closed: false },
      }));
  }
}

export function hitShape(s: PartShape, p: Vec2): boolean {
  if (s.kind === 'dot') return distance(s.at, p) <= LINE_HIT_PX;
  if (s.kind === 'rect') return pointInRect(p, s.rect, PAD_PX);
  const n = s.points.length;
  for (let i = 0; i < (s.closed ? n : n - 1); i++) {
    if (distanceToSegment(p, s.points[i]!, s.points[(i + 1) % n]!) <= LINE_HIT_PX) return true;
  }
  return false;
}

export const samePart = (a: AnnotationPart, b: AnnotationPart): boolean =>
  a.kind === b.kind && ('index' in a ? a.index : -1) === ('index' in b ? b.index : -1);
