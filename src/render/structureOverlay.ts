import { findObject } from '../core/document';
import type { EditorStore } from '../core/store';
import { objectOutline } from '../core/structure';
import { worldToScreen } from '../core/viewport';
import { structureHandles, structureSizeLabel } from '../tools/StructureTool';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

/** Same radius as the rotate knob on furniture. */
const HANDLE_R = 4.375;

/**
 * Selected walls, doors and windows: accent outline with corner marks and
 * a faint wash (same marks as a unit in a multi-selection, design 07).
 * A single one also gets its drag handles (wall ends / door and window
 * jambs) and a size chip, like the W × H chip on furniture.
 */
export function drawStructureSelection(g: CanvasRenderingContext2D, store: EditorStore, theme: CanvasTheme): void {
  const v = store.viewport;
  for (const id of store.selection) {
    const o = findObject(store.doc, id);
    if (!o || o.kind === 'furniture') continue;
    const pts = objectOutline(store.doc, o)?.map((p) => worldToScreen(v, p));
    if (!pts) continue;
    g.beginPath();
    pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)));
    g.closePath();
    g.fillStyle = theme.accent;
    g.globalAlpha = 0.12;
    g.fill();
    g.globalAlpha = 1;
    g.strokeStyle = theme.accent;
    g.lineWidth = 1.5;
    g.stroke();
    for (const p of pts) g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
  }

  const handles = structureHandles(store);
  if (!handles.length) return;
  g.fillStyle = theme.surface;
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.25;
  for (const h of handles) {
    const p = worldToScreen(v, h.at);
    g.beginPath();
    g.arc(p.x, p.y, HANDLE_R, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  }
  // The live readout follows the pointer while dragging; the chip is for rest.
  const piece = findObject(store.doc, handles[0]!.id);
  const label = piece && !store.stack.pending ? structureSizeLabel(piece) : null;
  if (label) {
    const a = worldToScreen(v, handles[0]!.at);
    const b = worldToScreen(v, handles[1]!.at);
    pill(g, label, (a.x + b.x) / 2, (a.y + b.y) / 2, theme.accent, theme, true);
  }
}
