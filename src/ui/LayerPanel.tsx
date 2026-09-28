import { useState } from 'react';
import type { Layer } from '../core/document';
import { LAYER_COLORS } from '../core/layerCommands';
import { isCustomLayer, layerContents, layerObjects } from '../core/layerStats';
import { Section, TextButton, Toggle } from './controls';
import { Slider } from './Slider';
import { useEditor } from './useStore';
import { Bolt } from './itemIcons';
import { cn } from './cn';

type StateKey = 'visible' | 'locked' | 'includeInPrint' | 'snapTargets' | 'cacheAsStatic';

const STATE_ROWS: { key: StateKey; label: string }[] = [
  { key: 'visible', label: 'Visible' },
  { key: 'locked', label: 'Locked' },
  { key: 'includeInPrint', label: 'Include in print' },
  { key: 'snapTargets', label: 'Snap targets' },
  { key: 'cacheAsStatic', label: 'Cache as static bitmap' },
];

/** Right panel while a layer is open in the Layers manager (design 08). */
export function LayerPanel({ layer }: { layer: Layer }) {
  const store = useEditor();
  const count = layerObjects(store.doc, layer.id).length;
  return (
    <>
      <div className="flex h-16 shrink-0 items-start gap-[10px] border-b border-line px-4 pt-[15px]">
        <span
          className="flex size-9 items-center justify-center rounded-[3px]"
          style={{ background: `color-mix(in srgb, ${layer.color} 12%, transparent)` }}
        >
          {/* Stroke is currentColor (svgr), so the glyph takes the layer's colour. */}
          <Bolt aria-hidden style={{ color: layer.color }} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-13 font-semibold text-ink">{layer.name}</p>
          <p className="mt-[2px] font-mono text-10 text-muted">
            {isCustomLayer(layer) ? 'custom' : 'default'} layer · {count} objects
          </p>
        </div>
      </div>
      <LayerSection layer={layer} />
      <Section title="State" className="pb-[18px]">
        <div className="flex flex-col gap-[14px]">
          {STATE_ROWS.map((r) => (
            <div key={r.key} className="flex h-4 items-center justify-between">
              <span className="text-12 text-ink">{r.label}</span>
              <Toggle
                label={r.label}
                on={layer[r.key]}
                onChange={(v) => store.setLayer('ToggleLayer', layer.id, { [r.key]: v })}
              />
            </div>
          ))}
        </div>
      </Section>
      <ContentsSection layer={layer} />
    </>
  );
}

function LayerSection({ layer }: { layer: Layer }) {
  const store = useEditor();
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    const name = draft?.trim();
    setDraft(null);
    if (name && name !== layer.name) store.setLayer('RenameLayer', layer.id, { name });
  };
  return (
    <Section title="Layer">
      <label className="flex h-7 items-center rounded-[3px] border border-line bg-sunken px-[7px] focus-within:border-accent">
        <span className="w-11 font-mono text-9 font-medium text-muted uppercase">Name</span>
        <input
          aria-label="Layer name"
          className="min-w-0 flex-1 bg-transparent font-mono text-11 text-ink outline-none"
          value={draft ?? layer.name}
          onFocus={() => setDraft(layer.name)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            if (e.key === 'Escape') {
              setDraft(null);
              e.currentTarget.blur();
            }
          }}
        />
      </label>
      <p className="mt-[14px] text-12 text-muted">Color</p>
      <div className="mt-1 flex gap-2" role="radiogroup" aria-label="Layer colour">
        {LAYER_COLORS.map((c) => {
          const on = c.toLowerCase() === layer.color.toLowerCase();
          return (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={c}
              onClick={() => store.setLayer('SetLayerColor', layer.id, { color: c })}
              className={cn('size-[26px] rounded-[3px]', on && 'outline-[1.5px] outline-offset-[1.5px] outline-solid')}
              style={{ background: c, outlineColor: c }}
            />
          );
        })}
      </div>
      <div className="mt-[18px] flex items-center justify-between">
        <span className="text-12 text-ink">Opacity</span>
        <span className="font-mono text-10 text-ink">{Math.round(layer.opacity * 100)}%</span>
      </div>
      <Slider
        label="Layer opacity"
        className="mt-[2px]"
        min={0}
        max={100}
        value={Math.round(layer.opacity * 100)}
        onChange={(v) => store.setLayer('SetLayerOpacity', layer.id, { opacity: v / 100 })}
      />
    </Section>
  );
}

/** "ReorderLayer(electrical, from: 1 → to: 3)" → two lines, as in the design. */
function splitCommand(text: string): [string, string] {
  const i = text.indexOf(', ');
  return i < 0 ? [text, ''] : [text.slice(0, i + 1), `  ${text.slice(i + 2)}`];
}

function ContentsSection({ layer }: { layer: Layer }) {
  const store = useEditor();
  const rows = layerContents(store.doc, layer.id);
  const pending = store.stack.pending;
  const shown = pending ?? store.stack.headCommand;
  const [line1, line2] = splitCommand(shown?.describe() ?? 'No commands yet');
  return (
    <Section title="Contents">
      <div className="flex flex-col gap-2">
        {rows.length ? (
          rows.map((r) => (
            <div key={r.label} className="flex h-4 items-center justify-between">
              <span className="text-12 text-muted">{r.label}</span>
              <span className="font-mono text-11 text-ink">{r.count}</span>
            </div>
          ))
        ) : (
          <p className="text-12 text-muted">Empty layer</p>
        )}
      </div>
      <div className="mt-[22px] rounded-[4px] border border-line bg-sunken px-[11px] pt-[9px] pb-[13px]">
        <p className="font-mono text-9 font-medium tracking-label-sm text-muted uppercase">
          {pending ? 'Pending command' : 'Last command'}
        </p>
        <p className="mt-[6px] font-mono text-10 whitespace-pre text-ink">{line1}</p>
        {line2 && <p className="mt-[2px] font-mono text-10 whitespace-pre text-muted">{line2}</p>}
        <p className="mt-2 text-11 text-muted">
          {pending ? 'Undoable · merges into history on drop' : shown ? 'Undoable · ⌘Z' : 'Layer edits land here'}
        </p>
      </div>
      <TextButton
        danger
        className="mt-[18px] h-8 w-full"
        disabled={store.doc.layers.length < 2}
        onClick={() => store.deleteLayer(layer.id)}
      >
        Delete layer
      </TextButton>
    </Section>
  );
}
