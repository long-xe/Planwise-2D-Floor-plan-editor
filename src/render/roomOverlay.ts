import { formatArea } from '../core/annotations';
import type { EditorStore } from '../core/store';
import { worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

const DASH = [4, 3];
const NO_DASH: number[] = [];

function room(g: G, store: EditorStore, polygon: readonly Vec2[], color: string, fill: boolean): void {
  const v = store.viewport;
  g.beginPath();
  polygon.forEach((p, i) => {
    const s = worldToScreen(v, p);
    if (i) g.lineTo(s.x, s.y);
    else g.moveTo(s.x, s.y);
  });
  g.closePath();
  if (fill) {
    g.globalAlpha = 0.08;
    g.fillStyle = color;
    g.fill();
    g.globalAlpha = 1;
  }
  g.strokeStyle = color;
  g.lineWidth = 1.5;
  g.setLineDash(DASH);
  g.stroke();
  g.setLineDash(NO_DASH);
}

/**
 * Text tool, Room mode: the room the walls close around the pointer (tinted,
 * with its net area), a room that already has a label (click renames it),
 * or a note that the space isn't closed. While the name is typed the room
 * stays tinted. Note tool, Callout mode: the pin and where its box will go.
 */
export function drawRoomOverlay(g: G, store: EditorStore, theme: CanvasTheme): void {
  const place = store.tools.place;
  const v = store.viewport;
  const format = store.tools.measure.style.format;
  g.save();
  const entry = place.entry;
  if (entry?.kind === 'room') {
    room(g, store, entry.polygon, theme.accent, true);
  } else if (entry?.kind === 'callout') {
    const a = worldToScreen(v, entry.at);
    g.strokeStyle = theme.ink;
    g.lineWidth = 1;
    g.setLineDash(DASH);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(a.x + 28, a.y - 28);
    g.stroke();
    g.setLineDash(NO_DASH);
    g.fillStyle = theme.ink;
    g.beginPath();
    g.arc(a.x, a.y, 3.5, 0, Math.PI * 2);
    g.fill();
  }
  const pv = place.preview;
  if (pv?.kind === 'room' && !entry) {
    const p = worldToScreen(v, pv.at);
    if (pv.labelled) {
      room(g, store, pv.labelled.room.polygon, theme.inkMuted, false);
      pill(g, `${pv.labelled.room.name} · click to rename`, p.x + 14, p.y + 12, theme.ink, theme);
    } else if (pv.room) {
      room(g, store, pv.room.polygon, theme.accent, true);
      pill(g, `Room · ${formatArea(pv.room.area, format)}`, p.x + 14, p.y + 12, theme.accent, theme);
    } else {
      pill(g, 'Not inside a closed room', p.x + 14, p.y + 12, theme.inkFaint, theme);
    }
  }
  g.restore();
}
