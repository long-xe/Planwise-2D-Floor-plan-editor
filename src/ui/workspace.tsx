import { createContext, useContext } from 'react';
import type { StackSnapshot } from '../core/commandStack';
import type { Doc } from '../core/document';
import { printedBounds } from '../core/exportOptions';
import { pickAt } from '../core/picking';
import { browserStorage, parseProject } from '../core/persistence';
import { EditorStore } from '../core/store';
import type { Rect } from '../geometry/vec';
import { createDemoDoc } from '../library/demoScene';
import { createOfficeDoc } from '../library/officeScene';
import { RULER_PX } from '../render/rulers';

// World origin sits at the plan's exterior corner, placed where the design
// puts it: 118 × 170 px into the drawing area, which starts after the rulers.
const INITIAL_PAN = { x: RULER_PX + 118, y: RULER_PX + 170 };
// Design 11 at 40 %: the rulers' 0 m sits 51 × 57 px into the canvas.
const STRESS_PAN = { x: 51, y: 57 };

export const isStressPlan = () => new URLSearchParams(location.search).get('plan') === 'northgate';

/** The demo as the designs open it: Harbor St., the king bed selected as if just clicked. */
function demoStore(open: 'restore' | 'replace'): EditorStore {
  const s = new EditorStore(createDemoDoc(), browserStorage(), open);
  s.viewport = { ...s.viewport, panX: INITIAL_PAN.x, panY: INITIAL_PAN.y };
  s.selection = ['f_0217'];
  s.lastHit = pickAt(s.hitIndex, { x: 2.4, y: 6.4 });
  return s;
}

/**
 * The store the app starts with. ?plan=northgate opens the 842-object
 * stress plan (11) with the HUD up; it isn't autosaved, so it never
 * replaces the saved project. Otherwise the autosaved project, or the demo.
 */
export function startStore(): EditorStore {
  if (isStressPlan()) {
    const s = new EditorStore(createOfficeDoc(), null);
    s.viewport = { ...s.viewport, zoom: 0.4, panX: STRESS_PAN.x, panY: STRESS_PAN.y };
    s.perf.setHud(true);
    return s;
  }
  return demoStore('restore');
}

/** Frames `area` (default: the plan's walls and furniture) in the canvas, at most 100 %. */
export function fitView(s: EditorStore, area?: Rect): void {
  const box = area ?? printedBounds(s.doc, Object.fromEntries(s.doc.layers.map((l) => [l.id, true])));
  const r = document.querySelector('main')?.getBoundingClientRect() ?? { width: 856, height: 820 };
  const pad = { x: 120 + RULER_PX, y: 170 + RULER_PX };
  const w = Math.max(1, box.maxX - box.minX);
  const h = Math.max(1, box.maxY - box.minY);
  const zoom = Math.max(0.1, Math.min(1, (r.width - pad.x) / (w * 50), (r.height - pad.y) / (h * 50)));
  const k = 50 * zoom;
  s.viewport = {
    ...s.viewport,
    zoom,
    panX: RULER_PX + (r.width - RULER_PX) / 2 - ((box.minX + box.maxX) / 2) * k,
    panY: RULER_PX + (r.height - RULER_PX) / 2 - ((box.minY + box.maxY) / 2) * k,
  };
}

export interface Workspace {
  /** Opens a document as the current plan (it replaces the autosaved project). */
  open(doc: Doc, setup?: (s: EditorStore) => void, history?: StackSnapshot): void;
  /** Back to Harbor St. as the designs show it. */
  openDemo(): void;
  newPlanOpen: boolean;
  showNewPlan(on: boolean): void;
  /** A short message at the top of the editor ("Not a Planwise project file"). */
  notify(message: string): void;
}

export const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace(): Workspace {
  const w = useContext(WorkspaceContext);
  if (!w) throw new Error('WorkspaceContext missing');
  return w;
}

/** A fresh store for `doc`, saved as the current project, framed in the canvas. */
export function openStore(doc: Doc, setup?: (s: EditorStore) => void, history?: StackSnapshot): EditorStore {
  // Leaving the stress plan: the page goes back to the saved, autosaving project.
  if (isStressPlan()) leaveStressUrl();
  const s = new EditorStore(doc, browserStorage(), 'replace');
  if (history) {
    s.stack.load(history);
    s.history.saveNow();
  }
  setup?.(s);
  if (s.viewport.zoom === 1 && s.viewport.panX === 0) fitView(s);
  return s;
}

export function openDemoStore(): EditorStore {
  if (isStressPlan()) leaveStressUrl();
  return demoStore('replace');
}

function leaveStressUrl(): void {
  window.history.replaceState(null, '', location.pathname);
}

/** Opens a .planwise.json project file (JSON export, 12) as the current plan, history included. */
export async function importProject(file: File, ws: Workspace): Promise<boolean> {
  const parsed = parseProject(await file.text());
  if (!parsed) {
    ws.notify(`${file.name} isn't a Planwise project file`);
    return false;
  }
  ws.open(parsed.doc, undefined, parsed.history);
  ws.notify(`Opened ${parsed.doc.name}`);
  return true;
}
