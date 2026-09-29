import { useEffect, useMemo } from 'react';
import { pickAt } from './core/picking';
import { browserStorage } from './core/persistence';
import { EditorStore } from './core/store';
import { createDemoDoc } from './library/demoScene';
import { createOfficeDoc } from './library/officeScene';
import { RULER_PX } from './render/rulers';
import { SelectTool } from './tools/SelectTool';
import { WallTool } from './tools/WallTool';
import { FurnitureTool } from './tools/FurnitureTool';
import { HandTool } from './tools/HandTool';
import { CanvasView } from './ui/CanvasView';
import { HitDebugPanel } from './ui/HitDebugPanel';
import { LayerBadges } from './ui/LayerBadges';
import { UndoToast } from './ui/UndoToast';
import { WallToolHint } from './ui/WallToolHint';
import { PerfHud } from './ui/PerfHud';
import { LeftPanel } from './ui/LeftPanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { StatusBar } from './ui/StatusBar';
import { ToolRail } from './ui/ToolRail';
import { TopBar } from './ui/TopBar';
import { StoreContext } from './ui/useStore';

// World origin sits at the plan's exterior corner, placed where the design
// puts it: 118 × 170 px into the drawing area, which starts after the rulers.
const INITIAL_PAN = { x: RULER_PX + 118, y: RULER_PX + 170 };
// Design 11 at 40 %: the rulers' 0 m sits 51 × 57 px into the canvas.
const STRESS_PAN = { x: 51, y: 57 };

/** Canvas centre in canvas pixels, the anchor for toolbar zoom. */
function canvasCenter() {
  const el = document.querySelector('main');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
}

export function App() {
  const store = useMemo(() => {
    // ?plan=northgate opens the Performance screen's 842-object stress plan (11),
    // with the HUD up; it isn't autosaved, so it never replaces the Unit 4B project.
    if (new URLSearchParams(location.search).get('plan') === 'northgate') {
      const s = new EditorStore(createOfficeDoc(), null);
      s.viewport = { ...s.viewport, zoom: 0.4, panX: STRESS_PAN.x, panY: STRESS_PAN.y };
      s.perf.setHud(true);
      return s;
    }
    const s = new EditorStore(createDemoDoc(), browserStorage());
    s.viewport = { ...s.viewport, panX: INITIAL_PAN.x, panY: INITIAL_PAN.y };
    // Open on the design's state: the king bed selected, as if just clicked.
    s.selection = ['f_0217'];
    s.lastHit = pickAt(s.hitIndex, { x: 2.4, y: 6.4 });
    return s;
  }, []);
  // Dev only: lets browser tests drive and inspect the store (the one React kept, not a StrictMode double).
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { planwise: store });
  }, [store]);
  const tools = useMemo(
    () => ({ select: new SelectTool(), hand: new HandTool(), wall: new WallTool(), furniture: new FurnitureTool() }),
    [],
  );

  return (
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
            <WallToolHint />
            <PerfHud />
          </main>
          <PropertiesPanel />
        </div>
        <StatusBar />
      </div>
    </StoreContext.Provider>
  );
}
