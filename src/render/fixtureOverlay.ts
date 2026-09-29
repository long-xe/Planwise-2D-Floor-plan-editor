import { circuitLabel, circuitMates, circuitSummary, circuitsOf } from '../core/circuits';
import type { Furniture } from '../core/document';
import { findFurniture, findLayer, isFixture } from '../core/document';
import type { EditorStore } from '../core/store';
import { displayName } from '../core/structure';
import { scaleOf, worldToScreen } from '../core/viewport';
import type { Vec2 } from '../geometry/vec';
import { FIXTURES, electricalLayer, fixtureObject } from '../library/electrical';
import { drawFixture } from './drawFurniture';
import { pill } from './pill';
import type { CanvasTheme } from './theme';

type G = CanvasRenderingContext2D;

const WIRE_DASH = [4, 3];
const NO_DASH: number[] = [];

/** Same bowed home-run as the content pass draws between a switch and its lights. */
function wire(g: G, a: Vec2, b: Vec2): void {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  g.moveTo(a.x, a.y);
  g.quadraticCurveTo((a.x + b.x) / 2, Math.min(a.y, b.y) - len * 0.25, b.x, b.y);
}

/** What a switch or light would wire to on `circuit`: lights for a switch, switches for a light. */
function partners(store: EditorStore, kind: Furniture['icon'], circuit: string, self?: string): Furniture[] {
  const want = kind === 'switch' ? 'light' : 'switch';
  return circuitMates(store.doc, circuit, self).filter((m) => m.icon === want);
}

/**
 * Electrical tool on the overlay: the fixture that would land, drawn by the
 * content renderer at ghost strength (faint, with the reason, where it
 * can't go), a pill naming it and its wall or circuit, and the wires it
 * would join on the armed circuit.
 */
export function drawFixturePreview(g: G, store: EditorStore, theme: CanvasTheme): void {
  if (store.tools.active !== 'electrical') return;
  const es = store.tools.electrical;
  const pv = es.preview;
  if (!pv) return;
  const v = store.viewport;
  const dpr = g.getTransform().a || 1;
  const spec = FIXTURES[pv.kind];
  const color = (findLayer(store.doc, 'electrical') ?? electricalLayer(store.doc)).color;
  const t = pv.at.transform;
  const c = worldToScreen(v, t);
  const circuit = spec.wired ? es.circuit : null;
  g.save();
  if (pv.at.fits && circuit) {
    g.beginPath();
    for (const m of partners(store, pv.kind, circuit)) wire(g, c, worldToScreen(v, m.transform));
    g.setLineDash(WIRE_DASH);
    g.globalAlpha = 0.7;
    g.strokeStyle = color;
    g.lineWidth = 1;
    g.stroke();
    g.setLineDash(NO_DASH);
  }
  g.globalAlpha = pv.at.fits ? 0.75 : 0.4;
  drawFixture(g, fixtureObject(pv.kind, '_preview', t), v, dpr, pv.at.fits ? color : theme.inkFaint, theme);
  g.restore();
  const where = pv.at.wall ? displayName(pv.at.wall) : null;
  const text = !pv.at.fits
    ? `${spec.name} · ${pv.at.reason}`
    : [spec.name, circuit ? circuitLabel(circuit) : null, where].filter(Boolean).join(' · ');
  const r = (Math.max(t.w, t.h) * scaleOf(v)) / 2;
  pill(g, text, c.x + r + 10, c.y + r + 4, pv.at.fits ? theme.ink : theme.tool, theme);
}

/**
 * A selected switch or light shows its circuit: a ring on every fixture
 * wired with it, the wires between them drawn over, and a pill with the
 * circuit's name and what's on it.
 */
export function drawCircuitHighlight(g: G, store: EditorStore, theme: CanvasTheme): void {
  if (store.selection.length !== 1) return;
  const f = findFurniture(store.doc, store.selection[0]!);
  if (!f?.circuit || !isFixture(f.icon)) return;
  const v = store.viewport;
  const s = scaleOf(v);
  const mates = circuitMates(store.doc, f.circuit, f.id);
  const c = worldToScreen(v, f.transform);
  g.save();
  g.strokeStyle = theme.accent;
  g.lineWidth = 1.5;
  g.beginPath();
  for (const m of partners(store, f.icon, f.circuit, f.id)) wire(g, c, worldToScreen(v, m.transform));
  g.setLineDash(WIRE_DASH);
  g.stroke();
  g.setLineDash(NO_DASH);
  for (const m of mates) {
    const p = worldToScreen(v, m.transform);
    g.beginPath();
    g.arc(p.x, p.y, (Math.max(m.transform.w, m.transform.h) * s) / 2 + 5, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  const info = circuitsOf(store.doc).find((x) => x.id === f.circuit);
  if (info) {
    const r = (Math.max(f.transform.w, f.transform.h) * s) / 2;
    // Beside the fixture: the selection's size label already sits below it.
    pill(g, `${circuitLabel(info.id)} · ${circuitSummary(info)}`, c.x + r + 14, c.y - 9, theme.accent, theme);
  }
}
