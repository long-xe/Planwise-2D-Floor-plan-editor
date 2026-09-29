import { TransformCommand } from '../core/commands';
import type { SceneObject } from '../core/document';
import { findFurniture } from '../core/document';
import { entryView } from '../core/historyView';
import type { EditorStore } from '../core/store';
import { objectOutline } from '../core/structure';
import { EditObjectsCommand } from '../core/structureCommands';
import { worldToScreen } from '../core/viewport';
import { footprintToWorld } from '../geometry/transform';
import { type Vec2, boundsOf } from '../geometry/vec';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

const DASH = [4, 3];

/** Outlines of what a command would leave behind, in world units. */
function resultOutlines(store: EditorStore, cmd: unknown): Vec2[][] {
  if (cmd instanceof TransformCommand) {
    return cmd.targets.flatMap((t) => {
      const f = findFurniture(store.doc, t.id);
      return f ? [footprintToWorld(t.to, f.footprint)] : [];
    });
  }
  if (cmd instanceof EditObjectsCommand) {
    return cmd.targets
      .map((t) => objectOutline(store.doc, t.to as SceneObject))
      .filter((p): p is Vec2[] => !!p && p.length > 0);
  }
  return [];
}

function label(cmd: unknown, fallback: string): string {
  if (cmd instanceof TransformCommand && cmd.targets.length === 1) {
    const to = cmd.targets[0]!.to;
    if (cmd.type === 'Rotate') return `Rotate ${+to.rotation.toFixed(1)}°`;
    if (cmd.type === 'Resize') return `Resize ${to.w.toFixed(2)} × ${to.h.toFixed(2)} m`;
  }
  return fallback;
}

/**
 * "Redo preview" (design 09): with the History tab open and an undone entry
 * inspected, draw where redoing it would put things, as a dashed ghost.
 */
export function drawRedoPreview(g: CanvasRenderingContext2D, store: EditorStore, theme: CanvasTheme): void {
  const { history, stack } = store;
  if (history.tab !== 'history') return;
  const index = stack.entries.findIndex((e) => e.seq === history.shownSeq);
  if (index < stack.undoDepth) return;
  const cmd = stack.entries[index]!.cmd;
  const shapes = resultOutlines(store, cmd).map((pts) => pts.map((p) => worldToScreen(store.viewport, p)));
  if (!shapes.length) return;
  g.setLineDash(DASH);
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.25;
  for (const pts of shapes) {
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillStyle = theme.accent;
    g.globalAlpha = 0.06;
    g.fill();
    g.globalAlpha = 1;
    g.stroke();
  }
  g.setLineDash([]);
  const box = boundsOf(shapes.flat());
  pill(
    g,
    `redo preview · ${label(cmd, entryView(cmd, store.doc).title)}`,
    box.maxX - 25,
    box.minY + 21,
    theme.accent,
    theme,
  );
}
