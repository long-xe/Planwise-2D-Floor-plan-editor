import type { SceneObject } from '../core/document';
import { findLayer, findObject, layersTopDown } from '../core/document';
import { Section } from './controls';
import { useEditor } from './useStore';

/**
 * Which layer the selection is on, and a picker to move it to another
 * (one MoveToLayer command). Locked and hidden layers can't take objects;
 * doors and windows stay on their wall's layer.
 */
export function LayerSection({ ids }: { ids: readonly string[] }) {
  const store = useEditor();
  const objects = ids.map((id) => findObject(store.doc, id)).filter((o): o is SceneObject => !!o);
  const on = new Set(objects.map((o) => o.layerId));
  const current = on.size === 1 ? [...on][0]! : null;
  const openingsOnly = objects.length > 0 && objects.every((o) => o.kind === 'opening');
  const color = current ? findLayer(store.doc, current)?.color : undefined;
  // The drafting grid is a background, not a place for objects.
  const layers = layersTopDown(store.doc).filter((l) => l.id !== 'grid');
  return (
    <Section title="Layer" className="pb-[16px]">
      <div className="flex items-center gap-2">
        <span
          className="size-[10px] shrink-0 rounded-[2px] border border-line"
          style={color ? { background: color } : undefined}
        />
        <select
          aria-label="Layer"
          value={current ?? ''}
          disabled={openingsOnly}
          onChange={(e) => store.moveToLayer(e.target.value)}
          className="h-7 min-w-0 flex-1 rounded-[3px] border border-line bg-sunken px-[6px] text-12 text-ink outline-none focus:border-accent disabled:opacity-60"
        >
          {current === null && (
            <option value="" disabled>
              Mixed layers
            </option>
          )}
          {layers.map((l) => (
            <option key={l.id} value={l.id} disabled={l.locked || !l.visible}>
              {l.name}
              {l.locked ? ' · locked' : !l.visible ? ' · hidden' : ''}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-2 text-11 leading-[15px] text-muted">
        {openingsOnly
          ? 'Doors and windows stay on their wall’s layer.'
          : 'Moves the selection onto that layer: it draws, hides, locks and prints with it.'}
      </p>
    </Section>
  );
}
