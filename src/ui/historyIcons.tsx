import type { FC, SVGProps } from 'react';
import type { HistoryIcon } from '../core/historyView';
import { cn } from './cn';
import { ItemGlyph } from './itemIcons';
import Move from './icons/hist-move.svg?react';
import Rotate from './icons/hist-rotate.svg?react';
import Resize from './icons/hist-resize.svg?react';
import Flip from './icons/flip.svg?react';
import Trash from './icons/hist-trash.svg?react';
import EyeOff from './icons/hist-eyeoff.svg?react';
import Layers from './icons/hist-layers.svg?react';
import Group from './icons/group.svg?react';

type Svg = FC<SVGProps<SVGSVGElement>>;

/** Command glyphs (design 09); object kinds fall back to the layer-list glyphs. */
const COMMAND_ICON: Partial<Record<HistoryIcon, Svg>> = {
  move: Move,
  rotate: Rotate,
  resize: Resize,
  flip: Flip,
  trash: Trash,
  eyeoff: EyeOff,
  layers: Layers,
  group: Group,
};

/** Stroke follows the text colour: ink, faint (redo rows), tool (HEAD), accent (inspector). */
export function HistoryGlyph({ icon, className }: { icon: HistoryIcon; className?: string }) {
  const Svg = COMMAND_ICON[icon];
  if (!Svg)
    return <ItemGlyph icon={icon as Parameters<typeof ItemGlyph>[0]['icon']} className={cn('text-ink', className)} />;
  return <Svg aria-hidden className={cn('block max-w-none text-ink', className)} />;
}
