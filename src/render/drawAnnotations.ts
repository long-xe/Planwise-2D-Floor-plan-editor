import {
  type Annotation,
  type AnnotationStyle,
  type DimensionRun,
  type Terminator,
  formatArea,
  formatLength,
  polygonArea,
} from '../core/annotations';
import { CALLOUT_H, NOTE_BOX as NOTE, calloutWidth, revisionLabel } from '../core/annotationLayout';
import { type Viewport, scaleOf, worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { canvasMeasure } from './textMeasure';
import type { CanvasTheme } from './theme';

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const TICK_PX = 12;
const SLASH_PX = 3;
const ARROW_PX = 6;
const SCALLOP_PX = 14;
const LEADER_DASH = [3, 2];
const NO_DASH: number[] = [];

/** A dimension end: arch tick (extension tick + 45° slash), arrowhead or dot. `into` points along the run. */
export function drawTerminator(g: Ctx2D, q: Vec2, u: Vec2, n: Vec2, kind: Terminator, into = 1): void {
  if (kind === 'dot') {
    g.beginPath();
    g.arc(q.x, q.y, 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (kind === 'arrow') {
    const b = { x: q.x + u.x * ARROW_PX * into, y: q.y + u.y * ARROW_PX * into };
    g.beginPath();
    g.moveTo(q.x, q.y);
    g.lineTo(b.x + n.x * 2.5, b.y + n.y * 2.5);
    g.lineTo(b.x - n.x * 2.5, b.y - n.y * 2.5);
    g.closePath();
    g.fill();
    return;
  }
  g.lineWidth = 0.75;
  g.beginPath();
  g.moveTo(q.x - (n.x * TICK_PX) / 2, q.y - (n.y * TICK_PX) / 2);
  g.lineTo(q.x + (n.x * TICK_PX) / 2, q.y + (n.y * TICK_PX) / 2);
  g.stroke();
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(q.x - (u.x + n.x) * SLASH_PX, q.y - (u.y + n.y) * SLASH_PX);
  g.lineTo(q.x + (u.x + n.x) * SLASH_PX, q.y + (u.y + n.y) * SLASH_PX);
  g.stroke();
}

/** Text on a knocked-out background, centred on `at`; vertical runs read bottom to top. */
function dimLabel(g: Ctx2D, text: string, at: Vec2, vertical: boolean, theme: CanvasTheme): void {
  g.save();
  g.translate(at.x, at.y);
  if (vertical) g.rotate(-Math.PI / 2);
  g.font = `500 10px ${theme.fontMono}`;
  const w = g.measureText(text).width + 8;
  g.fillStyle = theme.canvas;
  g.fillRect(-w / 2, -7, w, 14);
  g.fillStyle = theme.accent;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 0.5);
  g.restore();
}

function drawRun(g: Ctx2D, run: DimensionRun, v: Viewport, theme: CanvasTheme, style: AnnotationStyle): void {
  const pts = run.points.map((p) => worldToScreen(v, p));
  const a = pts[0]!;
  const b = pts.at(-1)!;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1) return;
  const u = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const n = { x: u.y, y: -u.x };
  const off = run.offset * scaleOf(v);
  const q = pts.map((p) => ({ x: p.x + n.x * off, y: p.y + n.y * off }));
  g.strokeStyle = theme.accent;
  g.fillStyle = theme.accent;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(q[0]!.x, q[0]!.y);
  g.lineTo(q.at(-1)!.x, q.at(-1)!.y);
  g.stroke();
  q.forEach((p, i) => {
    // Arrowheads point into each segment they end: both ways at inner points.
    if (style.terminator === 'arrow' && i > 0 && i < q.length - 1) {
      drawTerminator(g, p, u, n, 'arrow', -1);
      drawTerminator(g, p, u, n, 'arrow', 1);
    } else drawTerminator(g, p, u, n, style.terminator, i === 0 ? 1 : -1);
  });
  const vertical = Math.abs(u.y) > Math.abs(u.x);
  for (let i = 0; i + 1 < run.points.length; i++) {
    const p = run.points[i]!;
    const r = run.points[i + 1]!;
    const text = formatLength(Math.hypot(r.x - p.x, r.y - p.y), style.format, !!run.unit);
    dimLabel(g, text, { x: (q[i]!.x + q[i + 1]!.x) / 2, y: (q[i]!.y + q[i + 1]!.y) / 2 }, vertical, theme);
  }
}

/** Screen box of a callout (its text sets the width; picking uses the same layout). */
function calloutBox(g: Ctx2D, title: string, body: string, theme: CanvasTheme): { w: number; h: number } {
  return { w: calloutWidth(title, body, canvasMeasure(g, theme)), h: CALLOUT_H };
}

function nearestOnRect(p: Vec2, x: number, y: number, w: number, h: number): Vec2 {
  return { x: Math.max(x, Math.min(x + w, p.x)), y: Math.max(y, Math.min(y + h, p.y)) };
}

function wrap(g: Ctx2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

/** Scallops bulging outward along each edge of a clockwise-or-not outline. */
export function cloudPath(g: Ctx2D, pts: Vec2[]): void {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const out = area > 0 ? -1 : 1;
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const k = Math.max(1, Math.round(len / SCALLOP_PX));
    const n = { x: ((b.y - a.y) / len) * out, y: (-(b.x - a.x) / len) * out };
    for (let j = 0; j < k; j++) {
      const s = { x: a.x + ((b.x - a.x) * j) / k, y: a.y + ((b.y - a.y) * j) / k };
      const e = { x: a.x + ((b.x - a.x) * (j + 1)) / k, y: a.y + ((b.y - a.y) * (j + 1)) / k };
      const bulge = (len / k) * 0.45;
      g.quadraticCurveTo((s.x + e.x) / 2 + n.x * bulge, (s.y + e.y) / 2 + n.y * bulge, e.x, e.y);
    }
  }
  g.closePath();
}

/**
 * Draws one annotation (design 10). Returns fill / stroke calls issued.
 * Dimension lines and labels are accent, callouts ink on white, notes and
 * revision clouds the warning yellow of the Annotations layer.
 */
export function drawAnnotation(
  g: Ctx2D,
  a: Annotation,
  v: Viewport,
  theme: CanvasTheme,
  style: AnnotationStyle,
): number {
  if (a.type === 'dimension') {
    for (const run of a.runs) drawRun(g, run, v, theme, style);
    return a.runs.length * 4;
  }
  if (a.type === 'area') {
    if (!style.showAreas) return 0;
    g.textAlign = 'center';
    g.textBaseline = 'top';
    for (const room of a.rooms) {
      const p = worldToScreen(v, room.label);
      g.fillStyle = theme.ink;
      g.font = `600 11px ${theme.fontSans}`;
      g.fillText(room.name, p.x, p.y);
      g.fillStyle = theme.inkMuted;
      g.font = `400 9.5px ${theme.fontMono}`;
      g.fillText(formatArea(polygonArea(room.polygon), style.format), p.x, p.y + 15);
    }
    g.textAlign = 'left';
    return a.rooms.length * 2;
  }
  if (a.type === 'callout') {
    const anchor = worldToScreen(v, a.anchor);
    const box = worldToScreen(v, a.box);
    const { w, h } = calloutBox(g, a.title, a.body, theme);
    const end = nearestOnRect(anchor, box.x, box.y, w, h);
    g.strokeStyle = theme.ink;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(anchor.x, anchor.y);
    g.lineTo(end.x, end.y);
    g.stroke();
    g.fillStyle = theme.ink;
    g.beginPath();
    g.arc(anchor.x, anchor.y, 3.5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = theme.surface;
    g.beginPath();
    g.roundRect(box.x, box.y, w, h, 2);
    g.fill();
    g.stroke();
    g.textBaseline = 'top';
    g.fillStyle = theme.ink;
    g.font = `600 11px ${theme.fontSans}`;
    g.fillText(a.title, box.x + 8, box.y + 7);
    g.fillStyle = theme.inkMuted;
    g.font = `400 10px ${theme.fontSans}`;
    g.fillText(a.body, box.x + 8, box.y + 25);
    return 6;
  }
  if (a.type === 'note') {
    const anchor = worldToScreen(v, a.anchor);
    const box = worldToScreen(v, a.box);
    const end = { x: box.x + NOTE.w / 2, y: box.y };
    g.strokeStyle = theme.warning;
    g.lineWidth = 1;
    g.setLineDash(LEADER_DASH);
    g.beginPath();
    g.moveTo(anchor.x, anchor.y);
    g.lineTo(end.x, end.y);
    g.stroke();
    g.setLineDash(NO_DASH);
    g.fillStyle = theme.warning;
    g.beginPath();
    g.arc(anchor.x, anchor.y, 3, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = theme.note;
    g.beginPath();
    g.roundRect(box.x, box.y, NOTE.w, NOTE.h, 2);
    g.fill();
    g.stroke();
    g.fillStyle = theme.noteFold;
    g.beginPath();
    g.moveTo(box.x + NOTE.w - NOTE.fold, box.y + NOTE.h);
    g.lineTo(box.x + NOTE.w, box.y + NOTE.h - NOTE.fold);
    g.lineTo(box.x + NOTE.w - NOTE.fold, box.y + NOTE.h - NOTE.fold);
    g.closePath();
    g.fill();
    g.textBaseline = 'top';
    g.fillStyle = theme.noteInk;
    g.font = `500 8.5px ${theme.fontMono}`;
    g.fillText(`NOTE · ${a.author} · ${a.date}`.toUpperCase(), box.x + 10, box.y + 8);
    g.fillStyle = theme.ink;
    g.font = `400 11px ${theme.fontSans}`;
    wrap(g, a.text, NOTE.text).forEach((line, i) => g.fillText(line, box.x + 10, box.y + 25 + i * 15));
    return 6;
  }
  if (a.type === 'text') {
    const p = worldToScreen(v, a.at);
    g.fillStyle = theme.ink;
    g.font = `500 ${a.size}px ${theme.fontSans}`;
    g.textBaseline = 'top';
    g.fillText(a.text, p.x, p.y);
    return 1;
  }
  // Revision cloud with its Δ tag.
  const pts = a.cloud.map((p) => worldToScreen(v, p));
  const tag = worldToScreen(v, a.tag);
  g.strokeStyle = theme.warning;
  g.lineWidth = 1.75;
  cloudPath(g, pts);
  g.stroke();
  const corner = pts.reduce((best, p) =>
    Math.hypot(p.x - tag.x, p.y - tag.y) < Math.hypot(best.x - tag.x, best.y - tag.y) ? p : best,
  );
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(corner.x, corner.y);
  g.lineTo(tag.x + 16, tag.y + 2);
  g.stroke();
  g.fillStyle = theme.warning;
  g.beginPath();
  g.moveTo(tag.x + 16, tag.y);
  g.lineTo(tag.x + 32, tag.y + 28);
  g.lineTo(tag.x, tag.y + 28);
  g.closePath();
  g.fill();
  g.fillStyle = theme.surface;
  g.font = `700 10px ${theme.fontSans}`;
  g.textAlign = 'center';
  g.textBaseline = 'alphabetic';
  g.fillText(String(a.rev), tag.x + 16, tag.y + 24);
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillStyle = theme.noteInk;
  g.font = `500 10.5px ${theme.fontSans}`;
  g.fillText(revisionLabel(a.rev, a.text), tag.x + 38, tag.y + 18);
  return 5;
}
