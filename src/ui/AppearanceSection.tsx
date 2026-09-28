import { type ReactNode, useState } from 'react';
import type { Furniture } from '../core/document';
import { Section } from './controls';
import { useEditor } from './useStore';

/** Inline numeric input that commits on Enter/blur, styled as plain mono text. */
function InlineNumber({ value, digits, suffix, onCommit }: {
  value: number; digits: number; suffix: string; onCommit(v: number): void;
}) {
  const shown = value.toFixed(digits);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number.parseFloat(draft);
    setDraft(null);
    if (Number.isFinite(n) && n.toFixed(digits) !== shown) onCommit(n);
  };
  return (
    <span className="flex items-center font-mono text-11 text-muted">
      <input
        className="w-10 bg-transparent text-right outline-none focus:text-ink"
        value={draft ?? shown}
        onFocus={() => setDraft(shown)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      />
      <span className="whitespace-pre">{suffix}</span>
    </span>
  );
}

/** `pr` differs per row in the design: the opacity ends 6px further in than the stroke width. */
function ColorRow({ color, label, pr, onColor, children }: {
  color: string; label: string; pr: string; onColor(c: string): void; children: ReactNode;
}) {
  return (
    <div className={`flex h-7 items-center rounded-[3px] border border-line bg-sunken pl-[5px] ${pr}`}>
      <label className="relative size-4 cursor-pointer rounded-[2px] border border-ink" style={{ background: color }}>
        <input
          type="color"
          aria-label={label}
          value={color.toLowerCase()}
          onChange={(e) => onColor(e.target.value.toUpperCase())}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      <span className="ml-2 flex-1 font-mono text-11 text-ink">{color.toUpperCase()}</span>
      {children}
    </div>
  );
}

export function AppearanceSection({ f }: { f: Furniture }) {
  const store = useEditor();
  const a = f.appearance;
  return (
    <Section title="Appearance" pb="pb-[10px]">
      <div className="mt-[2px] flex flex-col gap-2">
        <ColorRow color={a.fill} label="Fill colour" pr="pr-[22px]" onColor={(fill) => store.setAppearance(f.id, { fill })}>
          <InlineNumber
            value={a.fillOpacity * 100}
            digits={0}
            suffix="%"
            onCommit={(v) => store.setAppearance(f.id, { fillOpacity: Math.min(1, Math.max(0, v / 100)) })}
          />
        </ColorRow>
        <ColorRow color={a.stroke} label="Stroke colour" pr="pr-4" onColor={(stroke) => store.setAppearance(f.id, { stroke })}>
          <InlineNumber
            value={a.strokeWidth}
            digits={2}
            suffix=" px"
            onCommit={(v) => store.setAppearance(f.id, { strokeWidth: Math.max(0, v) })}
          />
        </ColorRow>
      </div>
    </Section>
  );
}
