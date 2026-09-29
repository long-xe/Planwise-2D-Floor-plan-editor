import { useEffect, useRef } from 'react';
import { DEFAULT_MEASURE } from '../core/measureState';
import type { Viewport } from '../core/viewport';
import type { Doc } from '../core/document';
import { printedBounds } from '../core/exportOptions';
import { drawGrid, drawLayer } from '../render/drawScene';
import { readTheme } from '../render/theme';

const W = 180;
const H = 120;
/** Layers a template card shows: the plan itself, not its annotations or wiring. */
const SHOWN = new Set(['walls', 'furniture']);

/**
 * A template card's picture (design 03 "thumb"), drawn by the editor's own
 * layer renderer so the card is the plan it creates. Blank shows the
 * dashed empty board.
 */
export function TemplateThumb({ doc, blank }: { doc: Doc; blank: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = W * dpr;
    c.height = H * dpr;
    const theme = readTheme();
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = theme.canvas;
    g.fillRect(0, 0, W, H);
    const full = { pxPerMetre: 50, zoom: 1, panX: 0, panY: 0 };
    drawGrid(g, { ...full, zoom: 0.3 }, { minX: 0, minY: 0, maxX: W / 15, maxY: H / 15 }, theme);
    if (blank) {
      g.strokeStyle = theme.inkFaint;
      g.lineWidth = 1.5;
      g.setLineDash([4, 3]);
      g.strokeRect(30, 20, 120, 80);
      g.setLineDash([]);
      g.beginPath();
      g.moveTo(90, 54);
      g.lineTo(90, 66);
      g.moveTo(84, 60);
      g.lineTo(96, 60);
      g.stroke();
      return;
    }
    const box = printedBounds(doc, Object.fromEntries(doc.layers.map((l) => [l.id, SHOWN.has(l.id)])));
    const k = Math.min((W - 24) / (box.maxX - box.minX), (H - 16) / (box.maxY - box.minY));
    const v: Viewport = {
      ...full,
      zoom: k / 50,
      panX: (W - (box.maxX - box.minX) * k) / 2 - box.minX * k,
      panY: (H - (box.maxY - box.minY) * k) / 2 - box.minY * k,
    };
    const style = {
      format: { units: DEFAULT_MEASURE.units, precision: 0.01 },
      terminator: 'tick' as const,
      showAreas: false,
    };
    const view = { minX: -1e3, minY: -1e3, maxX: 1e3, maxY: 1e3 };
    for (const layer of doc.layers.toSorted((a, b) => a.order - b.order)) {
      if (!SHOWN.has(layer.id)) continue;
      drawLayer(g, doc, layer, {
        v,
        view,
        theme,
        dpr,
        out: { drawn: 0, culled: 0, calls: 0 },
        mitre: true,
        only: null,
        batch: null,
        annot: style,
      });
    }
  }, [doc, blank]);
  return <canvas ref={ref} aria-hidden style={{ width: W, height: H }} className="block rounded-[3px]" />;
}
