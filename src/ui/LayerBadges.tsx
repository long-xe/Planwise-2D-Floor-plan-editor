import { contentBounds, layerObjects } from '../core/layerStats';
import { worldToScreen } from '../core/viewport';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import lockWhite from './icons/lock-white.svg';
import eyeOff from './icons/eye-off-badge.svg';

/** Badges sit this far above the plan's top-left corner (design: 222 → 182). */
const ABOVE_PX = 40;

/**
 * Layers manager (08): chips over the plan naming layers that are locked
 * (filled) or hidden (outlined), so their state is visible on the canvas.
 */
export function LayerBadges() {
  const store = useEditor();
  if (!store.activeLayerId) return null;
  const doc = store.doc;
  const anchor = contentBounds(doc, 'walls') ?? contentBounds(doc, 'furniture');
  if (!anchor) return null;
  const p = worldToScreen(store.viewport, { x: anchor.minX, y: anchor.minY });
  const locked = doc.layers.filter((l) => l.locked && l.visible && l.id !== 'grid');
  const hidden = doc.layers.filter((l) => !l.visible && l.id !== 'grid');
  return (
    <div className="pointer-events-none absolute flex gap-[10px]" style={{ left: p.x, top: p.y - ABOVE_PX }}>
      {locked.map((l) => (
        <span key={l.id} className="flex h-[22px] items-center rounded-[3px] bg-tool pr-3 pl-[9px]">
          <Icon src={lockWhite} w={11} h={14} />
          <span className="ml-[6px] font-mono text-10 font-medium text-surface">{l.name} · locked</span>
        </span>
      ))}
      {hidden.map((l) => (
        <span
          key={l.id}
          className="flex h-[22px] items-center rounded-[3px] border border-warning bg-surface pr-3 pl-[6px]"
        >
          <Icon src={eyeOff} w={16} h={14} />
          <span className="ml-1 font-mono text-10 font-medium text-ink">
            {l.name} hidden · {layerObjects(doc, l.id).length}
          </span>
        </span>
      ))}
    </div>
  );
}
