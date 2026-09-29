import { useEffect, useRef } from 'react';
import type { FixtureIcon } from '../core/document';
import { FIXTURES, fixtureObject } from '../library/electrical';
import { drawFixture } from '../render/drawFurniture';
import { readTheme } from '../render/theme';

/**
 * A fixture drawn by the canvas renderer itself (like SymbolThumb), in the
 * Electrical layer's colour, so a card shows exactly what lands on the plan.
 */
export function FixtureThumb({
  kind,
  color,
  width,
  height,
}: {
  kind: FixtureIcon;
  color: string;
  width: number;
  height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const g = canvas?.getContext('2d');
    if (!canvas || !g) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, width, height);
    // 1.5× the plan's 50 px/m, so a 0.24 m outlet reads at card size.
    const v = { pxPerMetre: 75, zoom: 1, panX: width / 2, panY: height / 2 };
    const spec = FIXTURES[kind];
    const f = fixtureObject(kind, '_thumb', { x: 0, y: 0, w: spec.w, h: spec.h, rotation: 0, flipX: false });
    drawFixture(g, f, v, dpr, color, readTheme());
  }, [kind, color, width, height]);
  return <canvas ref={ref} aria-hidden style={{ width, height }} className="block" />;
}
