import {
  DndContext,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import type { Transaction } from '../core/commandStack';
import type { Layer } from '../core/document';
import { layersTopDown } from '../core/document';
import { ReorderLayerCommand, ordersOf } from '../core/layerCommands';
import { LayerCardBody, LayerChildren } from './LayerCard';
import { insertionCollision, layerAnnouncements } from './layerDnd';
import { RenderOrder } from './RenderOrder';
import { LeftTabs } from './LeftPanel';
import { useEditor } from './useStore';
import { cn } from './cn';

interface Drag {
  id: string;
  /** Top-down ids at drag start; the list keeps this order while dragging. */
  snapshot: string[];
  /** Layer orders at drag start, so undo restores them, not a preview. */
  base: Map<string, number>;
  from: number;
  /** Index in the final top-down list (arrayMove semantics, as ReorderLayer). */
  to: number;
  tx: Transaction;
}

/**
 * Layers manager (design 08): wide left panel with a card per layer,
 * drag-to-reorder, and the per-frame render order. Opened by focusing a
 * layer; Done, Esc or an empty-canvas click returns to the compact list.
 *
 * Reordering uses dnd-kit for input (pointer and keyboard, text-selection
 * and scroll handling, screen-reader announcements) while the document
 * change stays a transaction: each new drop target updates one pending
 * ReorderLayer command, drop commits it, Esc / blur roll it back.
 */
export function LayersManager() {
  const store = useEditor();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ furniture: true });
  const [drag, setDrag] = useState<Drag | null>(null);
  // Mirrors `drag` for event handlers; every setDrag below updates it too.
  const dragRef = useRef<Drag | null>(null);
  /** Set for the Esc that cancelled a drag, so that same key doesn't also close the manager. */
  const cancelledAt = useRef(0);

  const layers = layersTopDown(store.doc);
  const byId = new Map(layers.map((l) => [l.id, l]));
  const order = drag ? drag.snapshot : layers.map((l) => l.id);

  const sensors = useSensors(
    // A few px of travel before a drag starts, so a click on the handle still opens the layer.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const end = useCallback((commit: boolean) => {
    const d = dragRef.current;
    if (!d) return;
    if (commit && d.to !== d.from) d.tx.commit();
    else {
      d.tx.rollback();
      cancelledAt.current = performance.now();
    }
    dragRef.current = null;
    setDrag(null);
  }, []);

  // Esc leaves the manager, unless it is closing a menu, a rename or a drag first.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || dragRef.current) return;
      if (performance.now() - cancelledAt.current < 100) return;
      if ((e.target as HTMLElement | null)?.closest('input, textarea')) return;
      if (document.querySelector('[data-layer-menu]')) return;
      store.focusLayer(null);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [store]);

  // Losing focus mid-drag must not leave a half-applied reorder (dnd-kit
  // only cancels on Esc and tab visibility).
  useEffect(() => {
    const blur = () => end(false);
    window.addEventListener('blur', blur);
    return () => window.removeEventListener('blur', blur);
  }, [end]);

  const onDragStart = ({ active }: DragStartEvent) => {
    const id = String(active.id);
    const snapshot = layers.map((l) => l.id);
    store.focusLayer(id);
    const d: Drag = {
      id,
      snapshot,
      base: ordersOf(store.doc),
      from: snapshot.indexOf(id),
      to: snapshot.indexOf(id),
      tx: store.stack.begin(),
    };
    dragRef.current = d;
    setDrag(d);
  };

  const onDragOver = ({ over }: DragOverEvent) => {
    const d = dragRef.current;
    if (!d || !over) return;
    const to = d.snapshot.indexOf(String(over.id));
    if (to < 0 || to === d.to) return;
    d.tx.update(new ReorderLayerCommand(store.doc, d.id, d.from, to, Date.now(), d.base));
    const next = { ...d, to };
    dragRef.current = next;
    setDrag(next);
  };

  // Indicator sits above the card that ends up right below the dropped one.
  const final = drag ? arrayMove(drag.snapshot, drag.from, drag.to) : [];
  const below = drag && drag.to !== drag.from ? (final[drag.to + 1] ?? 'bottom') : null;
  const dragged = drag ? byId.get(drag.id) : undefined;
  const announcements = layerAnnouncements((id) => byId.get(id)?.name ?? id);

  return (
    <aside className="flex min-h-0 w-left-wide flex-col border-r border-line bg-surface">
      <LeftTabs />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
        <div className="flex items-center pt-[9px]">
          <span className="font-mono text-10 font-medium tracking-label text-muted uppercase">
            Layers · {layers.length}
          </span>
          <span className="ml-[10px] flex-1 font-mono text-10 text-faint">{store.doc.objects.length} objects</span>
          <button
            type="button"
            title="Back to the layer list (Esc)"
            onClick={() => store.focusLayer(null)}
            className="mr-[6px] h-[26px] rounded-[3px] border border-line bg-surface px-[10px] text-11 font-medium text-muted hover:border-faint hover:text-ink"
          >
            Done
          </button>
          <button
            type="button"
            onClick={() => store.addLayer()}
            className="mr-1 h-[26px] rounded-[3px] border border-line bg-surface px-[10px] text-11 font-medium text-accent hover:border-faint"
          >
            + New layer
          </button>
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={insertionCollision}
          modifiers={[restrictToVerticalAxis]}
          accessibility={{ announcements }}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={() => end(true)}
          onDragCancel={() => end(false)}
        >
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {/* select-none: dragging across cards must never start a text selection. */}
            <div className="mt-1 flex flex-col gap-2 select-none">
              {order.map((id) => {
                const layer = byId.get(id);
                if (!layer) return null;
                return (
                  <Fragment key={id}>
                    {below === id && <DropIndicator label={`Drop here · above ${layer.name}`} />}
                    <SortableCard
                      layer={layer}
                      active={store.activeLayerId === id}
                      expanded={!!expanded[id]}
                      onToggleExpand={() => setExpanded((x) => ({ ...x, [id]: !x[id] }))}
                      onOpen={() => store.focusLayer(id)}
                    />
                  </Fragment>
                );
              })}
              {below === 'bottom' && <DropIndicator label="Drop here · bottom" />}
            </div>
          </SortableContext>

          {/* No drop animation: the list is static, the committed order re-renders it. */}
          <DragOverlay dropAnimation={null}>
            {dragged && (
              // Lifted card (design: nudged right, tilted, accent border, soft shadow).
              <div className="flex h-11 w-[328px] translate-x-[9px] rotate-[1.5deg] items-center rounded-[4px] border-[1.5px] border-accent bg-surface pr-[9px] pl-[11px] shadow-drag">
                <LayerCardBody layer={dragged} ghost />
              </div>
            )}
          </DragOverlay>
        </DndContext>

        <RenderOrder />
      </div>
    </aside>
  );
}

/**
 * One card in the sortable list. Items don't shift while dragging (the
 * design keeps them still and marks the target with DropIndicator), so the
 * sortable transform is deliberately not applied; the dragged card leaves
 * a "… was here" placeholder that still acts as its drop zone.
 */
function SortableCard({
  layer,
  active,
  expanded,
  onToggleExpand,
  onOpen,
}: {
  layer: Layer;
  active: boolean;
  expanded: boolean;
  onToggleExpand(): void;
  onOpen(): void;
}) {
  const { setNodeRef, setActivatorNodeRef, attributes, listeners, isDragging } = useSortable({ id: layer.id });
  if (isDragging) {
    return (
      <div
        ref={setNodeRef}
        className="flex h-11 items-center rounded-[4px] border border-dashed border-faint bg-sunken pl-[66px] text-11 text-faint"
      >
        {layer.name} was here
      </div>
    );
  }
  return (
    <>
      <div
        ref={setNodeRef}
        onClick={onOpen}
        className={cn(
          'flex h-11 cursor-pointer items-center rounded-[4px] border border-line bg-surface pr-[9px] pl-[11px]',
          active && 'border-accent',
        )}
      >
        <LayerCardBody
          layer={layer}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }}
        />
      </div>
      {expanded && <LayerChildren layer={layer} />}
    </>
  );
}

/** 2 px accent line with a ring at its start, drawn in the gap above the target card. */
function DropIndicator({ label }: { label: string }) {
  return (
    <div className="relative -mt-2 h-0">
      <span className="absolute right-0 bottom-[3px] font-mono text-[9.5px] leading-3 text-accent">{label}</span>
      <span className="absolute inset-x-0 top-[2px] h-[2px] bg-accent" />
      <span className="absolute top-[-2px] -left-[6px] size-[10px] rounded-full border-2 border-accent bg-surface" />
    </div>
  );
}
