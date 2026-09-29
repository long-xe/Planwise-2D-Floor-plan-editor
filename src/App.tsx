import { useEffect, useMemo, useRef, useState } from 'react';
import { SelectTool } from './tools/SelectTool';
import { WallTool } from './tools/WallTool';
import { FurnitureTool } from './tools/FurnitureTool';
import { HandTool } from './tools/HandTool';
import { MeasureTool } from './tools/MeasureTool';
import { OpeningTool } from './tools/OpeningTool';
import { DimensionTool } from './tools/DimensionTool';
import { ElectricalTool } from './tools/ElectricalTool';
import { RevisionTool } from './tools/RevisionTool';
import { TextTool } from './tools/TextTool';
import { CanvasView } from './ui/CanvasView';
import { HitDebugPanel } from './ui/HitDebugPanel';
import { LayerBadges } from './ui/LayerBadges';
import { UndoToast } from './ui/UndoToast';
import { ToolHint } from './ui/ToolHint';
import { AnnotationEditor } from './ui/AnnotationEditor';
import { AnnotationEntry } from './ui/AnnotationEntry';
import { PerfHud } from './ui/PerfHud';
import { ExportModal } from './ui/ExportModal';
import { NewPlanModal } from './ui/NewPlanModal';
import { type Workspace, WorkspaceContext, openDemoStore, openStore, startStore } from './ui/workspace';
import { LeftPanel } from './ui/LeftPanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { StatusBar } from './ui/StatusBar';
import { ToolRail } from './ui/ToolRail';
import { TopBar } from './ui/TopBar';
import { StoreContext } from './ui/useStore';

/** Canvas centre in canvas pixels, the anchor for toolbar zoom. */
function canvasCenter() {
  const el = document.querySelector('main');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
}

export function App() {
  const [store, setStore] = useState(startStore);
  const [newPlanOpen, showNewPlan] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Opening a plan swaps the whole store: canvas, panels and history all follow it.
  const workspace = useMemo<Workspace>(
    () => ({
      open: (doc, setup, history) => setStore(openStore(doc, setup, history)),
      openDemo: () => setStore(openDemoStore()),
      newPlanOpen,
      showNewPlan,
      notify: (message) => {
        setNotice(message);
        if (noticeTimer.current) clearTimeout(noticeTimer.current);
        noticeTimer.current = setTimeout(() => setNotice(null), 3200);
      },
    }),
    [newPlanOpen],
  );
  // Dev only: lets browser tests drive and inspect the store (the one React kept, not a StrictMode double).
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { planwise: store });
  }, [store]);
  const tools = useMemo(
    () => ({
      select: new SelectTool(),
      hand: new HandTool(),
      wall: new WallTool(),
      furniture: new FurnitureTool(),
      measure: new MeasureTool(),
      door: new OpeningTool('door'),
      window: new OpeningTool('window'),
      dimension: new DimensionTool(),
      text: new TextTool('text'),
      note: new TextTool('note'),
      revision: new RevisionTool(),
      electrical: new ElectricalTool(),
    }),
    [],
  );

  return (
    <WorkspaceContext.Provider value={workspace}>
      <StoreContext.Provider value={store}>
        <div className="grid h-full min-w-[1200px] grid-rows-[var(--spacing-topbar)_1fr_var(--spacing-statusbar)] text-ink">
          <TopBar canvasCenter={canvasCenter} />
          <div className="grid min-h-0 grid-cols-[var(--spacing-rail)_auto_1fr_var(--spacing-right)]">
            <ToolRail />
            <LeftPanel />
            <main className="relative min-w-0 overflow-hidden bg-canvas">
              <CanvasView tools={tools} />
              <HitDebugPanel />
              <LayerBadges />
              <UndoToast />
              <ToolHint />
              <AnnotationEntry />
              <AnnotationEditor />
              <PerfHud />
            </main>
            <PropertiesPanel />
          </div>
          <StatusBar />
          <ExportModal />
          {newPlanOpen && <NewPlanModal />}
          {notice && (
            <p
              role="status"
              className="fixed top-[64px] left-1/2 z-50 -translate-x-1/2 rounded-[4px] bg-ink px-3 py-2 text-12 text-surface shadow-toast"
            >
              {notice}
            </p>
          )}
        </div>
      </StoreContext.Provider>
    </WorkspaceContext.Provider>
  );
}
