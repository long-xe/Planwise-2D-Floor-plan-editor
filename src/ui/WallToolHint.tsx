import { findLayer } from '../core/document';
import { ItemGlyph } from './itemIcons';
import { useEditor } from './useStore';

/**
 * Tool hint over the canvas while the Wall tool is active (design 04).
 * A locked Walls layer would silently refuse every click, so the hint
 * says so and offers the (undoable) unlock.
 */
export function WallToolHint() {
  const store = useEditor();
  if (store.tools.active !== 'wall') return null;
  const walls = findLayer(store.doc, 'walls');
  const locked = !!walls && (walls.locked || !walls.visible);
  return (
    <div className="absolute top-9 left-1/2 flex h-[34px] w-[480px] -translate-x-1/2 items-center rounded-[4px] border border-line bg-surface pr-3 pl-[13px] shadow-hint">
      <ItemGlyph icon="wall" className="text-tool" />
      <span className="ml-[10px] text-12 font-semibold text-ink">Wall tool</span>
      {locked ? (
        <>
          <span className="ml-6 flex-1 font-mono text-10 text-tool">
            Walls layer is {walls.locked ? 'locked' : 'hidden'}
          </span>
          <button
            type="button"
            className="text-11 font-medium text-accent"
            onClick={() => store.setLayer('ToggleLayer', 'walls', walls.locked ? { locked: false } : { visible: true })}
          >
            {walls.locked ? 'Unlock' : 'Show'}
          </button>
        </>
      ) : (
        <span className="ml-6 font-mono text-10 text-muted">Click to add point · Shift free angle · Esc finish</span>
      )}
    </div>
  );
}
