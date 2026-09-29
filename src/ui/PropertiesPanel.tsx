import type { Furniture } from '../core/document';
import { findLayer } from '../core/document';
import { normalizeRotation } from '../geometry/transform';
import { AppearanceSection } from './AppearanceSection';
import { HistoryInspector } from './HistoryInspector';
import { HitDetectionSection } from './HitDetectionSection';
import { LayerPanel } from './LayerPanel';
import { StructurePanel } from './StructurePanel';
import { WallToolPanel } from './WallToolPanel';
import { FurniturePanel } from './FurniturePanel';
import { PerfPanel } from './PerfPanel';
import { AlignSection, MultiSelectionHeader, SelectionBoundsSection } from './MultiSelectionPanel';
import { IconButton, NumberField, Section } from './controls';
import { Icon } from './Icon';
import { ItemGlyph } from './itemIcons';
import { Tabs } from './PanelTabs';
import { SnappingSection } from './SnappingSection';
import { useEditor } from './useStore';
import bed from './icons/bed.svg';
import rotateIcon from './icons/rotate.svg';
import flipIcon from './icons/flip.svg';
import linkIcon from './icons/link.svg';
import check from './icons/check.svg';
import { cn } from './cn';

export function PropertiesPanel() {
  const store = useEditor();
  const sel = store.selectedFurniture;
  const f = sel.length === 1 ? sel[0] : undefined;
  const layer = store.activeLayerId ? findLayer(store.doc, store.activeLayerId) : undefined;
  // Walls, doors and windows selected on their own get their own panel.
  const structural = sel.length ? [] : store.selection;

  return (
    // The design draws the divider over the panel's first column (content starts
    // at +16), so use an inset shadow rather than a border that takes up width.
    <aside className="flex min-h-0 flex-col overflow-y-auto bg-surface shadow-[inset_1px_0_0_var(--pw-border)]">
      {store.perf.hud ? (
        <Tabs
          tabs={['Properties', 'Performance']}
          active={store.perf.rightTab === 'performance' ? 'Performance' : 'Properties'}
          onSelect={(t) => store.perf.setRightTab(t === 'Performance' ? 'performance' : 'properties')}
        />
      ) : (
        <Tabs tabs={['Properties', 'Document']} active="Properties" />
      )}
      {store.perf.hud && store.perf.rightTab === 'performance' ? (
        <PerfPanel />
      ) : !layer && store.history.tab === 'history' ? (
        <HistoryInspector />
      ) : !layer && store.tools.active === 'wall' ? (
        <WallToolPanel />
      ) : !layer && store.tools.active === 'furniture' ? (
        <FurniturePanel />
      ) : layer ? (
        <LayerPanel layer={layer} />
      ) : structural.length ? (
        <StructurePanel ids={structural} />
      ) : sel.length > 1 ? (
        // Multi-selection / group (design 07).
        <>
          <MultiSelectionHeader />
          <AlignSection />
          <SelectionBoundsSection />
          <HitDetectionSection />
        </>
      ) : (
        <>
          {f ? <ObjectHeader f={f} /> : <EmptyHeader />}
          {f && <TransformSection f={f} />}
          <SnappingSection />
          {f && <AppearanceSection f={f} />}
          {!f && <HitDetectionSection />}
          <CommandSection />
        </>
      )}
    </aside>
  );
}

function ObjectHeader({ f }: { f: Furniture }) {
  const store = useEditor();
  return (
    <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
      <span className="flex size-9 items-center justify-center rounded-[3px] border border-line bg-sunken">
        {f.icon === 'bed' ? <Icon src={bed} w={14} h={13} /> : <ItemGlyph icon={f.icon} className="text-ink" />}
      </span>
      <div>
        <p className="text-13 font-semibold text-ink">{f.name}</p>
        <p className="mt-[2px] font-mono text-10 text-muted">
          {f.id} · {store.layerName(f.layerId)} layer
        </p>
      </div>
    </div>
  );
}

function EmptyHeader() {
  return (
    <div className="flex h-16 shrink-0 items-center border-b border-line px-4 text-12 text-muted">
      Nothing selected — click or drag a marquee on the canvas
    </div>
  );
}

function TransformSection({ f }: { f: Furniture }) {
  const store = useEditor();
  const t = f.transform;
  const pendingRotate = store.stack.pending?.type === 'Rotate';

  const setSize = (key: 'w' | 'h', v: number) => {
    const n = Math.max(0.05, v);
    if (!store.lockAspect) return store.applyTransform('Resize', f.id, { [key]: n });
    const k = n / t[key];
    store.applyTransform('Resize', f.id, { w: t.w * k, h: t.h * k });
  };

  return (
    <Section title="Transform" className="pb-[14px]">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" unit="m" value={t.x} onCommit={(x) => store.applyTransform('Move', f.id, { x })} />
        <NumberField label="Y" unit="m" value={t.y} onCommit={(y) => store.applyTransform('Move', f.id, { y })} />
        <NumberField label="W" unit="m" value={t.w} onCommit={(v) => setSize('w', v)} />
        <NumberField label="H" unit="m" value={t.h} onCommit={(v) => setSize('h', v)} />
        <NumberField
          label="R"
          unit="°"
          digits={1}
          value={t.rotation}
          focused={pendingRotate}
          onCommit={(r) => store.applyTransform('Rotate', f.id, { rotation: normalizeRotation(r) })}
        />
        <div className="flex gap-[6px]">
          <IconButton
            label="Rotate 90°"
            onClick={() => store.applyTransform('Rotate', f.id, { rotation: normalizeRotation(t.rotation + 90) })}
          >
            <Icon src={rotateIcon} w={13} h={15} />
          </IconButton>
          <IconButton
            label="Flip horizontal"
            active={t.flipX}
            onClick={() => store.applyTransform('Flip', f.id, { flipX: !t.flipX })}
          >
            <Icon src={flipIcon} w={14} h={16} />
          </IconButton>
          <IconButton
            label="Lock aspect ratio"
            active={store.lockAspect}
            onClick={() => store.setLockAspect(!store.lockAspect)}
          >
            <Icon src={linkIcon} w={17} h={17} />
          </IconButton>
        </div>
      </div>
      <label className="mt-3 flex cursor-pointer items-start">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={store.lockAspect}
          onChange={(e) => store.setLockAspect(e.target.checked)}
        />
        <span
          className={cn(
            'mt-[2px] flex size-[14px] items-center justify-center rounded-[2px] border border-line bg-surface',
            store.lockAspect && 'border-accent bg-accent',
          )}
        >
          {store.lockAspect && <Icon src={check} w={6.6} h={4.4} />}
        </span>
        <span className="ml-2 flex-1 text-12 text-ink">Lock aspect ratio</span>
        <span className="mr-[6px] font-mono text-10 text-muted">1 : {(t.h / t.w).toFixed(2)}</span>
      </label>
    </Section>
  );
}

function CommandSection() {
  const { stack } = useEditor();
  const pending = stack.pending;
  const head = stack.headCommand;
  const line = pending?.describe() ?? head?.describe() ?? 'No commands yet';
  const status = pending
    ? 'pending · commits on pointerup'
    : head
      ? `committed · #${stack.undoDepth} · ${stack.redoDepth} redo`
      : 'history empty';
  return (
    <Section title="Command">
      <p className="font-mono text-10 text-muted">{line}</p>
      <p className="mt-[3px] font-mono text-10 text-muted">{status}</p>
    </Section>
  );
}
