import type { ReactNode } from 'react';
import type { ToolId } from '../core/toolState';
import { cn } from './cn';
import { Section, Segmented, Toggle } from './controls';
import { type GlyphKey, ItemGlyph } from './itemIcons';
import { TERMINATORS, TerminatorGlyph, UNITS } from './MeasurePanel';
import { MonoSegments } from './MonoSegments';
import { useEditor } from './useStore';

type PlaceTool = Extract<ToolId, 'door' | 'window' | 'dimension' | 'text' | 'note' | 'revision'>;

const HEAD: Record<PlaceTool, { name: string; glyph: GlyphKey; how: string }> = {
  door: { name: 'Door', glyph: 'door', how: 'click a wall · Shift flips hinge' },
  window: { name: 'Window', glyph: 'window', how: 'click a wall to cut it' },
  dimension: { name: 'Dimension', glyph: 'dimension', how: 'click · click · pull · click' },
  text: { name: 'Text', glyph: 'text', how: 'click · type · Enter' },
  note: { name: 'Note', glyph: 'note', how: 'click · type · Enter' },
  revision: { name: 'Revision cloud', glyph: 'revision', how: 'outline the change · say what changed' },
};

const SHORTCUTS: Record<PlaceTool, [string, string][]> = {
  door: [
    ['Shift', 'other jamb'],
    ['Esc', 'done'],
  ],
  window: [['Esc', 'done']],
  dimension: [
    ['Shift', '45° steps'],
    ['Enter', 'end chain'],
    ['Esc', 'drop / done'],
  ],
  text: [
    ['Enter', 'place'],
    ['Esc', 'cancel'],
  ],
  note: [
    ['Enter', 'place'],
    ['⇧ Enter', 'new line'],
  ],
  revision: [
    ['Shift', 'square box'],
    ['Esc', 'drop / done'],
  ],
};

const POINTS_SHORTCUTS: [string, string][] = [
  ['Enter', 'close outline'],
  ['⌫', 'undo point'],
  ['Shift', '45° steps'],
  ['Esc', 'drop / done'],
];

function RevisionSettings() {
  const store = useEditor();
  const place = store.tools.place;
  return (
    <Section title="Revision cloud" className="pb-[18px]">
      <p className="text-12 text-muted">Draw</p>
      <Segmented
        className="mt-1"
        label="Cloud outline"
        font="font-sans"
        options={[
          { value: 'rect' as const, label: 'Rectangle' },
          { value: 'points' as const, label: 'Points' },
        ]}
        value={place.cloudMode}
        onChange={(mode) => place.setCloudMode(mode)}
      />
      <p className="mt-2 text-11 leading-[15px] text-muted">
        {place.cloudMode === 'rect'
          ? 'Drag a box around what changed.'
          : 'Click each corner of the outline; click the first point, press Enter or double-click to close.'}
      </p>
      <div className="mt-4 flex items-center gap-2">
        <span className="relative flex h-[18px] w-5 items-end justify-center">
          <svg viewBox="0 0 20 18" className="absolute inset-0 text-warning" aria-hidden>
            <path d="M10 0 20 18H0Z" fill="currentColor" />
          </svg>
          <span className="relative text-[9px] leading-[14px] font-bold text-surface">{place.nextRev()}</span>
        </span>
        <span className="text-12 text-ink">Next tag · Δ{place.nextRev()}</span>
      </div>
      <p className="mt-2 text-11 leading-[15px] text-muted">
        The tag lands under the cloud&apos;s bottom-right corner; type what changed and press Enter.
      </p>
    </Section>
  );
}

const m = (v: number) => `${v.toFixed(2)} m`;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex h-4 items-center justify-between">
      <span className="text-12 text-ink">{label}</span>
      {children}
    </div>
  );
}

function DoorWindow({ tool }: { tool: 'door' | 'window' }) {
  const store = useEditor();
  const place = store.tools.place;
  const s = place.opening;
  if (tool === 'window') {
    return (
      <Section title="Window" className="pb-[18px]">
        <p className="text-12 text-muted">Width</p>
        <MonoSegments
          className="mt-1"
          options={[0.6, 0.9, 1.2, 1.5, 2.4].map((w) => ({ id: w, label: m(w) }))}
          value={s.window.width}
          onChange={(width) => place.setWindowWidth(width)}
        />
      </Section>
    );
  }
  return (
    <Section title="Door" className="pb-[18px]">
      <p className="text-12 text-muted">Width</p>
      <MonoSegments
        className="mt-1"
        options={[0.7, 0.8, 0.9, 1.0].map((w) => ({ id: w, label: m(w) }))}
        value={s.door.width}
        onChange={(width) => place.setDoor({ width })}
      />
      <p className="mt-4 text-12 text-muted">Hinge</p>
      <Segmented
        className="mt-1"
        label="Hinge"
        font="font-sans"
        options={[
          { value: 'start' as const, label: 'Start jamb' },
          { value: 'end' as const, label: 'End jamb' },
        ]}
        value={s.door.hinge}
        onChange={(hinge) => place.setDoor({ hinge })}
      />
      <p className="mt-3 text-11 text-muted">The leaf swings into the side of the wall you point from.</p>
    </Section>
  );
}

function DimensionStyle() {
  const store = useEditor();
  const meas = store.tools.measure;
  const s = meas.settings;
  return (
    <Section title="Dimension style" className="pb-[18px]">
      <p className="text-12 text-muted">Terminator</p>
      <div className="mt-1 flex gap-[5px]" role="radiogroup" aria-label="Terminator">
        {TERMINATORS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="radio"
            aria-checked={s.terminator === t.value}
            onClick={() => meas.set({ terminator: t.value })}
            className={cn(
              'flex h-[34px] w-[78px] flex-col items-center justify-center gap-[3px] rounded-[3px] border border-line bg-sunken text-muted',
              s.terminator === t.value && 'border-accent bg-surface text-accent',
            )}
          >
            <TerminatorGlyph kind={t.value} />
            <span className="text-[9px] leading-3">{t.label}</span>
          </button>
        ))}
      </div>
      <p className="mt-4 text-12 text-muted">Units</p>
      <Segmented
        className="mt-1"
        label="Units"
        font="font-sans"
        options={UNITS}
        value={s.units}
        onChange={(units) => meas.set({ units })}
      />
      <div className="mt-4 flex flex-col gap-[14px]">
        <Row label="Snap to wall faces">
          <Toggle label="Snap to wall faces" on={s.snapWalls} onChange={(snapWalls) => meas.set({ snapWalls })} />
        </Row>
        <Row label="Snap to furniture edges">
          <Toggle
            label="Snap to furniture edges"
            on={s.snapFurniture}
            onChange={(snapFurniture) => meas.set({ snapFurniture })}
          />
        </Row>
      </div>
      <p className="mt-3 text-11 text-muted">Shared with the Measure tool; applies to every dimension on the plan.</p>
    </Section>
  );
}

/** Right panel for the Door, Window, Dimension, Text and Note tools. */
export function PlacePanel({ tool }: { tool: PlaceTool }) {
  const store = useEditor();
  const place = store.tools.place;
  const head =
    tool === 'text' && place.textMode === 'room'
      ? { ...HEAD.text, name: 'Text', how: 'point in a room · click · name it' }
      : tool === 'note' && place.noteMode === 'callout'
        ? { ...HEAD.note, name: 'Callout', how: 'click the point · title ⇧↵ detail · Enter' }
        : HEAD[tool];
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span className="flex size-9 items-center justify-center rounded-[3px] bg-tool-soft">
          <ItemGlyph icon={head.glyph} className="text-tool" />
        </span>
        <div>
          <p className="text-13 font-semibold text-ink">{head.name} tool</p>
          <p className="mt-[2px] font-mono text-10 text-muted">{head.how}</p>
        </div>
      </div>
      {(tool === 'door' || tool === 'window') && <DoorWindow tool={tool} />}
      {tool === 'dimension' && (
        <Section title="Chain" className="pb-[16px]">
          <Row label="Continue as chain">
            <Toggle label="Continue as chain" on={place.dimChain} onChange={(on) => place.setDimChain(on)} />
          </Row>
          <p className="mt-2 text-11 leading-[15px] text-muted">
            After placing a dimension, each click adds a point along the same line — one string of dimensions, like the
            plan&apos;s outer chains. Enter or Esc ends it.
          </p>
        </Section>
      )}
      {tool === 'dimension' && <DimensionStyle />}
      {tool === 'text' && (
        <Section title="Text" className="pb-[18px]">
          <Segmented
            label="Text mode"
            font="font-sans"
            options={[
              { value: 'label' as const, label: 'Label' },
              { value: 'room' as const, label: 'Room name' },
            ]}
            value={place.textMode}
            onChange={(mode) => place.setTextMode(mode)}
          />
          {place.textMode === 'label' ? (
            <>
              <p className="mt-4 text-12 text-muted">Size</p>
              <MonoSegments
                className="mt-1"
                options={[11, 13, 16, 20].map((px) => ({ id: px, label: `${px} px` }))}
                value={place.textSize}
                onChange={(px) => place.setTextSize(px)}
              />
            </>
          ) : (
            <p className="mt-3 text-11 leading-[15px] text-muted">
              Point inside a room: its walls outline it and its net area shows. Click where the name goes and type it;
              the room joins the area schedule. A room that has a name already is renamed instead.
            </p>
          )}
        </Section>
      )}
      {tool === 'revision' && <RevisionSettings />}
      {tool === 'note' && (
        <Section title="Note" className="pb-[18px]">
          <Segmented
            label="Note mode"
            font="font-sans"
            options={[
              { value: 'note' as const, label: 'Note' },
              { value: 'callout' as const, label: 'Callout' },
            ]}
            value={place.noteMode}
            onChange={(mode) => place.setNoteMode(mode)}
          />
          <p className="mt-3 text-11 leading-[15px] text-muted">
            {place.noteMode === 'note'
              ? 'A sticky note, signed MR and dated today, pinned where you click.'
              : 'A pin with a boxed title and one line of detail: type the title, Shift+Enter, then the detail.'}
          </p>
        </Section>
      )}
      <div className="m-4 rounded-[4px] border border-line bg-sunken px-3 pt-[9px] pb-[10px]">
        <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">Shortcuts</p>
        <div className="mt-2 grid grid-cols-[64px_1fr] gap-y-1 font-mono text-10">
          {(tool === 'revision' && place.cloudMode === 'points' ? POINTS_SHORTCUTS : SHORTCUTS[tool]).map(
            ([key, what]) => (
              <span key={key} className="contents">
                <span className="text-ink">{key}</span>
                <span className="text-muted">{what}</span>
              </span>
            ),
          )}
        </div>
      </div>
    </>
  );
}
