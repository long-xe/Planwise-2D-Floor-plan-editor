import { zoomAt } from '../core/viewport';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import logoMark from './icons/logo-mark.svg';
import logoDot from './icons/logo-dot.svg';
import chev from './icons/chev.svg';
import savedDot from './icons/saved-dot.svg';
import undoIcon from './icons/undo.svg';
import redoIcon from './icons/redo.svg';
import minus from './icons/minus.svg';
import plus from './icons/plus.svg';
import avatarMr from './icons/avatar-mr.svg';
import avatarJt from './icons/avatar-jt.svg';
import gear from './icons/gear.svg';

const ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8];

export function TopBar({ canvasCenter }: { canvasCenter(): { x: number; y: number } }) {
  const store = useEditor();
  const { stack, viewport } = store;

  const stepZoom = (dir: 1 | -1) => {
    const z = viewport.zoom;
    const next = dir > 0 ? ZOOM_STEPS.find((s) => s > z + 1e-6) : [...ZOOM_STEPS].reverse().find((s) => s < z - 1e-6);
    if (next) store.setViewport(zoomAt(viewport, next, canvasCenter()));
  };

  return (
    <header className="relative flex h-topbar items-center border-b border-line bg-surface pr-[13px] pl-4">
      <span className="relative size-6 rounded-[3px] bg-accent">
        <Icon src={logoMark} w={12} h={12} className="absolute top-[6px] left-[6px]" />
        <Icon src={logoDot} w={3} h={3} className="absolute top-[13.5px] left-[13.5px]" />
      </span>
      <span className="ml-2 text-16 font-bold text-ink">Planwise</span>
      <span className="mx-4 h-5 w-px bg-line" />
      <nav className="flex items-center text-13 whitespace-pre">
        <span className="text-muted">{'Plans  /'}</span>
        <span className="ml-1.5 font-semibold text-ink">{store.doc.name}</span>
        <Icon src={chev} w={6} h={3} className="mr-[17px] ml-[9px]" />
      </nav>
      <Icon src={savedDot} w={6} h={6} />
      <span className="ml-1 font-mono text-10 text-muted">Saved</span>

      <div className="absolute left-[628px] flex items-center gap-2">
        <div className="flex h-[30px] w-[72px] items-center gap-4 rounded-[4px] border border-line bg-sunken px-[10px]">
          <button type="button" title="Undo (⌘Z)" disabled={!stack.canUndo} onClick={() => store.undo()} className="flex disabled:opacity-40">
            <Icon src={undoIcon} w={14} h={12} />
          </button>
          <button type="button" title="Redo (⌘⇧Z)" disabled={!stack.canRedo} onClick={() => store.redo()} className="flex disabled:opacity-40">
            <Icon src={redoIcon} w={14} h={12} />
          </button>
        </div>
        <div className="flex h-[30px] w-[118px] items-center justify-between rounded-[4px] border border-line bg-sunken px-[9px]">
          <button type="button" title="Zoom out" className="flex" onClick={() => stepZoom(-1)}>
            <Icon src={minus} w={12} h={12} />
          </button>
          <span className="w-[50px] text-center font-mono text-12 font-medium text-ink">
            {Math.round(viewport.zoom * 100)}%
          </span>
          <button type="button" title="Zoom in" className="flex" onClick={() => stepZoom(1)}>
            <Icon src={plus} w={12} h={12} />
          </button>
        </div>
      </div>

      <div className="ml-auto flex items-center">
        <span className="relative h-6 w-[42px] text-9 font-bold text-surface">
          <Icon src={avatarMr} w={24} h={24} className="absolute left-0" />
          <span className="absolute top-[6px] left-1">MR</span>
          <Icon src={avatarJt} w={24} h={24} className="absolute left-[18px]" />
          <span className="absolute top-[6px] left-6">JT</span>
        </span>
        <button type="button" className="ml-4 rounded-[4px] border border-line bg-surface px-[14px] py-[7px] text-12 font-medium text-ink">
          Share
        </button>
        <button type="button" className="ml-4 rounded-[4px] bg-accent px-4 py-[7px] text-12 font-semibold text-surface">
          Export
        </button>
        <Icon src={gear} w={18} h={18} className="ml-[14px]" />
      </div>
    </header>
  );
}
