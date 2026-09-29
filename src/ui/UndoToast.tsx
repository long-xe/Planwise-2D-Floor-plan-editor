import { useEffect } from 'react';
import { Icon } from './Icon';
import { useEditor } from './useStore';
import undoWhite from './icons/undo-white.svg';
import closeWhite from './icons/close-white.svg';

const SHOW_MS = 5000;

/**
 * Toast after an undo or redo (design 09): what just happened, the way
 * back, and a countdown bar. Lives over the canvas, bottom centre.
 */
export function UndoToast() {
  const store = useEditor();
  const toast = store.history.toast;
  const id = toast?.id;
  useEffect(() => {
    if (id === undefined) return;
    const t = setTimeout(() => store.history.dismissToast(), SHOW_MS);
    return () => clearTimeout(t);
  }, [id, store]);
  if (!toast) return null;
  const undo = toast.kind === 'undo';
  return (
    <div
      role="status"
      className="absolute bottom-[106px] left-1/2 flex h-11 w-[460px] -translate-x-1/2 items-center overflow-hidden rounded-[4px] bg-ink pr-[18px] pl-[17px] shadow-toast"
    >
      <Icon src={undoWhite} w={16} h={14} className={undo ? undefined : '-scale-x-100'} />
      <span className="ml-[11px] text-13 font-semibold text-surface">{undo ? 'Undo' : 'Redo'}</span>
      <span className="mx-2 size-1 rounded-[2px] bg-faint" />
      <span className="min-w-0 flex-1 truncate text-13 text-surface">{toast.text}</span>
      <span className="mx-4 h-6 w-px bg-surface/20" />
      <button
        type="button"
        onClick={() => (undo ? store.redo() : store.undo())}
        className="flex items-baseline gap-2 text-on-ink-accent"
      >
        <span className="text-13 font-semibold">{undo ? 'Redo' : 'Undo'}</span>
        <span className="font-mono text-11">{undo ? '⌘⇧Z' : '⌘Z'}</span>
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => store.history.dismissToast()}
        className="ml-auto flex pl-4"
      >
        <Icon src={closeWhite} w={11} h={11} />
      </button>
      <span className="absolute inset-x-0 bottom-0 h-[3px] bg-surface/10" />
      <span
        key={toast.id}
        className="absolute bottom-0 left-0 h-[3px] bg-tool"
        style={{ animation: `pw-countdown ${SHOW_MS}ms linear forwards` }}
      />
    </div>
  );
}
