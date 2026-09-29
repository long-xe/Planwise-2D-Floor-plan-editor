import { findLayer } from '../core/document';
import type { ToolId } from '../core/toolState';
import type { GlyphKey } from './itemIcons';
import { ItemGlyph } from './itemIcons';
import type { EditorStore } from '../core/store';
import { useEditor } from './useStore';

/** The drawing tools: what they're called, which layer they add to, and how to use them. */
const HINTS: Partial<Record<ToolId, { name: string; glyph: GlyphKey; layer: string; how: string }>> = {
  wall: { name: 'Wall tool', glyph: 'wall', layer: 'walls', how: 'Click to add point · Shift free angle · Esc finish' },
  door: { name: 'Door', glyph: 'door', layer: 'walls', how: 'Click a wall · swings to your side · Shift flips hinge' },
  window: { name: 'Window', glyph: 'window', layer: 'walls', how: 'Click a wall to cut a window · Esc done' },
  dimension: {
    name: 'Dimension',
    glyph: 'dimension',
    layer: 'annotations',
    how: 'Click · click · pull out · click to place',
  },
  text: { name: 'Text', glyph: 'text', layer: 'annotations', how: 'Click to type a label · Enter to place' },
  note: { name: 'Note', glyph: 'note', layer: 'annotations', how: 'Click to pin a note · Enter to place' },
  electrical: {
    name: 'Electrical',
    glyph: 'outlet',
    layer: 'electrical',
    how: 'Outlets & switches snap to walls · lights go anywhere · 1 2 3',
  },
  revision: {
    name: 'Revision cloud',
    glyph: 'revision',
    layer: 'annotations',
    how: 'Drag a box around the change · Shift square · Esc done',
  },
};

/** Modes that work differently say so. */
function howFor(store: EditorStore, fallback: string): string {
  const { active, place } = store.tools;
  if (active === 'revision' && place.cloudMode === 'points')
    return 'Click each corner · click first point or Enter to close · ⌫ undo point';
  if (active === 'text' && place.textMode === 'room')
    return 'Point inside a room · click to name it · area is automatic';
  if (active === 'note' && place.noteMode === 'callout') return 'Click the point · type title, ⇧Enter, detail · Enter';
  return fallback;
}

/**
 * Tool hint over the canvas while a drawing tool is active (design 04's
 * Wall tool bar, for every tool that adds to the plan). A locked or hidden
 * target layer would silently refuse every click, so the hint says so and
 * offers the (undoable) unlock.
 */
export function ToolHint() {
  const store = useEditor();
  const hint = HINTS[store.tools.active];
  if (!hint) return null;
  const layer = findLayer(store.doc, hint.layer);
  const blocked = !!layer && (layer.locked || !layer.visible);
  return (
    <div className="absolute top-9 left-1/2 flex h-[34px] w-[480px] -translate-x-1/2 items-center rounded-[4px] border border-line bg-surface pr-3 pl-[13px] shadow-hint">
      <ItemGlyph icon={hint.glyph} className="text-tool" />
      <span className="ml-[10px] text-12 font-semibold text-ink">{hint.name}</span>
      {blocked ? (
        <>
          <span className="ml-6 flex-1 font-mono text-10 text-tool">
            {layer.name} layer is {layer.locked ? 'locked' : 'hidden'}
          </span>
          <button
            type="button"
            className="text-11 font-medium text-accent"
            onClick={() =>
              store.setLayer('ToggleLayer', layer.id, layer.locked ? { locked: false } : { visible: true })
            }
          >
            {layer.locked ? 'Unlock' : 'Show'}
          </button>
        </>
      ) : (
        <span className="ml-6 font-mono text-10 text-muted">{howFor(store, hint.how)}</span>
      )}
    </div>
  );
}
