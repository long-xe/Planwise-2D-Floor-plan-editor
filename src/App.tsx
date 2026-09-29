import { useMemo } from 'react';
import { pickAt } from './core/picking';
import { browserStorage } from './core/persistence';
import { EditorStore } from './core/store';
import { createDemoDoc } from './library/demoScene';
import { RULER_PX } from './render/rulers';
import { SelectTool } from './tools/SelectTool';
import { WallTool } from './tools/WallTool';
import { FurnitureTool } from './tools/FurnitureTool';
import { CanvasView } from './ui/CanvasView';
import { HitDebugPanel } from './ui/HitDebugPanel';
import { LayerBadges } from './ui/LayerBadges';
import { UndoToast } from './ui/UndoToast';
import { WallToolHint } from './ui/WallToolHint';
import { LeftPanel } from './ui/LeftPanel';
import { PropertiesPanel } from './ui/PropertiesPanel';
import { StatusBar } from './ui/StatusBar';
import { ToolRail } from './ui/ToolRail';
import { TopBar } from './ui/TopBar';
import { StoreContext } from './ui/useStore';

// World origin sits at the plan's exterior corner, placed where the design
// puts it: 118 × 170 px into the drawing area, which starts after the rulers.
const INITIAL_PAN = { x: RULER_PX + 118, y: RULER_PX + 170 };

/** Canvas centre in canvas pixels, the anchor for toolbar zoom. */
function canvasCenter() {
  const el = document.querySelector('main');
  const r = el?.getBoundingClientRect();
  return r ? { x: r.width / 2, y: r.height / 2 } : { x: 0, y: 0 };
}

export function App() {
  const store = useMemo(() => {
    const s = new EditorStore(createDemoDoc(), browserStorage());
    s.viewport = { ...s.viewport, panX: INITIAL_PAN.x, panY: INITIAL_PAN.y };
    // Open on the design's state: the king bed selected, as if just clicked.
    s.selection = ['f_0217'];
    s.lastHit = pickAt(s.hitIndex, { x: 2.4, y: 6.4 });
    return s;
  }, []);
  const tools = useMemo(() => ({ select: new SelectTool(), wall: new WallTool(), furniture: new FurnitureTool() }), []);

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
          </main>
          <PropertiesPanel />
        </div>
        <StatusBar />
      </div>
    </StoreContext.Provider>
  );
}
