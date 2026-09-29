import { createContext, useContext, useSyncExternalStore } from 'react';
import type { EditorStore, FrameStats } from '../core/store';
import type { Ghost } from '../core/furnitureState';
import type { MeasureDraft } from '../core/measureState';
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

/** The Furniture tool's ghost (05), on its own channel like the wall draft. */
export function useGhost(): Ghost | null {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return useSyncExternalStore(store.tools.furniture.subscribeGhost, store.tools.furniture.getGhost);
}

/** The Measure tool's live measurement (10), on its own channel. */
export function useMeasureDraft(): MeasureDraft {
  const store = useContext(StoreContext);
  if (!store) throw new Error('StoreContext missing');
  return useSyncExternalStore(store.tools.measure.subscribeDraft, store.tools.measure.getDraft);
}
