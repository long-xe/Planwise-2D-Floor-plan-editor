import type { FC, SVGProps } from 'react';
import type { RowGlyph } from '../core/layerRows';
import { cn } from './cn';
import Sofa from './icons/sofa-small.svg?react';
import Desk from './icons/desk.svg?react';
import Bed from './icons/bed-small.svg?react';
import Bath from './icons/bath.svg?react';
import Plant from './icons/plant.svg?react';
import Bolt from './icons/bolt.svg?react';
import WallIcon from './icons/wall.svg?react';
import DoorIcon from './icons/door.svg?react';
import WindowIcon from './icons/window.svg?react';

interface Glyph {
  Svg: FC<SVGProps<SVGSVGElement>>;
  /** Slot size from the design; the SVG keeps its own box (stroke overflow included). */
  w: number;
  h: number;
  /** Only for glyphs drawn smaller than their source file. */
  size?: { width: number; height: number };
}

const bolt: Glyph = { Svg: Bolt, w: 9.6, h: 11.2, size: { width: 9.33, height: 12 } };

/** Object kinds with a row icon: catalog items plus the structural pieces of the Walls layer. */
export type GlyphKey = RowGlyph;

const ITEM_ICON: Record<GlyphKey, Glyph> = {
  sofa: { Svg: Sofa, w: 12.8, h: 8 },
  desk: { Svg: Desk, w: 12.8, h: 8.8 },
  bed: { Svg: Bed, w: 11.2, h: 10.4 },
  bath: { Svg: Bath, w: 11.2, h: 8.8 },
  plant: { Svg: Plant, w: 9.6, h: 11.2 },
  outlet: bolt,
  switch: bolt,
  light: bolt,
  // Tool-rail glyphs (16 px) at row size.
  wall: { Svg: WallIcon, w: 12, h: 12, size: { width: 11.6, height: 11.6 } },
  door: { Svg: DoorIcon, w: 13, h: 11, size: { width: 13.1, height: 10.9 } },
  window: { Svg: WindowIcon, w: 13, h: 6, size: { width: 13.1, height: 5.6 } },
};

/**
 * Row icon for an object kind. Stroke follows the text colour, so callers
 * tint it with `text-muted` / `text-accent` / `text-ink` instead of
 * shipping one SVG per colour.
 */
export function ItemGlyph({ icon, className }: { icon: GlyphKey; className?: string }) {
  const { Svg, w, h, size } = ITEM_ICON[icon];
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center text-muted', className)}
      style={{ width: w, height: h }}
    >
      <Svg className="block max-w-none" aria-hidden {...size} />
    </span>
  );
}

export { Bolt };
