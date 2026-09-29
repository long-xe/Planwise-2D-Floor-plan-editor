import type { Wall } from '../core/document';
import { buildWallGraph } from '../geometry/walls';
import { ItemGlyph } from './itemIcons';
import { useEditor, useWallDraft } from './useStore';
import { roomOf } from '../core/rooms';
import { wallName } from '../library/wallNames';

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-[18px] items-center">
      <span className="w-[94px] text-11 text-muted">{label}</span>
      <span className="font-mono text-10 text-ink">{value}</span>
    </div>
  );
}

/** Left panel footer while drawing walls (design 04): the wall graph in numbers. */
export function WallGraphCard() {
  const store = useEditor();
  const draft = useWallDraft();
  const walls = store.doc.objects.filter((o): o is Wall => o.kind === 'wall');
  const graph = buildWallGraph(walls);
  const preview = draft?.placing ? ' + 1 preview' : '';
  return (
    <div className="m-4 shrink-0 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px]">
      <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Wall graph</p>
      <div className="mt-[5px]">
        <Line label="Nodes" value={String(graph.nodes.length)} />
        <Line label="Segments" value={`${walls.length}${preview}`} />
        <Line label="Joins" value={store.tools.wall.autoJoin ? 'auto · mitred' : 'square ends'} />
        <Line label="Closed rooms" value={String(graph.rooms)} />
      </div>
    </div>
  );
}

/** The wall being drawn, as a provisional row under the Walls layer (design 04). */
export function DrawingRow() {
  const store = useEditor();
  const d = useWallDraft();
  if (!d?.placing) return null;
  const { thickness, align } = store.tools.wall;
  const draft = { kind: 'wall' as const, id: '_draft', layerId: 'walls', a: d.start, b: d.end, thickness, align };
  const name = wallName(draft, (p) => roomOf(store.doc, p));
  return (
    <div className="mx-3 mt-px flex h-7 items-center rounded-[3px] border border-dashed border-tool-border bg-tool-tint pr-[7px] pl-[35px]">
      <ItemGlyph icon="wall" className="text-tool" />
      <span className="ml-2 flex-1 truncate text-12 font-medium text-tool">{name}</span>
      <span className="font-mono text-10 text-tool">drawing…</span>
    </div>
  );
}
