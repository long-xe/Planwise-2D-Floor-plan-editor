import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorStore, FrameStats } from '../core/store';
import type { WallDraft } from '../core/toolState';

export const StoreContext = createContext<EditorStore | null>(null);

/** Re-renders the caller whenever the store changes; returns the store. */
export function useEditor(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  useSyncExternalStore(store.subscribe, store.getVersion);
  return store;
}

/** Frame stats arrive on their own throttled channel (see RenderLoop). */
export function useFrameStats(): FrameStats {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return useSyncExternalStore(store.subscribeStats, store.getStats);
}

/** The store without subscribing, for components that must not re-render on edits. */
export function useEditorStoreRef(): EditorStore {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return store;
}

/** The Wall tool's live segment (04), on its own channel: changes with every pointer move. */
export function useWallDraft(): WallDraft | null {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return useSyncExternalStore(store.tools.subscribeDraft, store.tools.getDraft);
}
