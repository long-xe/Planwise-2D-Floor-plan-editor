import { useEffect, useRef, useState } from 'react';
import type { TextEntry } from '../core/placeState';
import { worldToScreen } from '../core/viewport';
import { useEditor } from './useStore';

/** One input on the canvas; it commits once — Enter, or losing focus — or cancels on Esc. */
function EntryInput({ entry, x, y }: { entry: TextEntry; x: number; y: number }) {
  const store = useEditor();
  const [text, setText] = useState('');
  const done = useRef(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const place = store.tools.place;
  // The entry opens on pointerdown; the browser then focuses what was clicked
  // (mousedown's default). Focusing now would be undone at once — and the
  // blur would commit an empty entry — so wait for the click to finish.
  useEffect(() => {
    const id = setTimeout(() => field.current?.focus());
    return () => clearTimeout(id);
  }, []);
  const edit = (value: string) => {
    setText(value);
    place.setDraft(value);
  };
  const commit = () => {
    if (done.current) return;
    done.current = true;
    place.commit(entry, text);
  };
  const cancel = () => {
    done.current = true;
    if (place.entry === entry) place.setEntry(null);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') cancel();
    // Enter places it; a note or callout takes Shift+Enter for a new line.
    else if (e.key === 'Enter' && !((entry.kind === 'note' || entry.kind === 'callout') && e.shiftKey)) {
      e.preventDefault();
      commit();
    }
  };
  if (entry.kind === 'room') {
    // Centred on the click, where the room's name will sit (its area goes under it).
    return (
      <input
        ref={field}
        aria-label="Room name"
        placeholder="Room name"
        value={text}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={keys}
        onBlur={commit}
        style={{ left: x - 70, top: y - 4 }}
        className="absolute z-20 w-[140px] rounded-[2px] border border-accent bg-surface px-1 py-[2px] text-center text-11 font-semibold text-ink outline-none placeholder:font-normal placeholder:text-faint"
      />
    );
  }
  if (entry.kind === 'callout') {
    // Where the box goes: up and right of the pin.
    return (
      <textarea
        ref={field}
        aria-label="Callout title and body"
        placeholder={'Title\nDetail (Shift+Enter for the second line)'}
        value={text}
        rows={2}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={keys}
        onBlur={commit}
        style={{ left: x + 28, top: y - 76 }}
        className="absolute z-20 w-[240px] resize-none rounded-[2px] border border-ink bg-surface px-2 py-[6px] text-11 text-ink outline-none placeholder:text-faint"
      />
    );
  }
  if (entry.kind === 'revision') {
    // Beside the Δ tag, where "Rev 3 · …" will read.
    return (
      <input
        ref={field}
        aria-label="Revision note"
        placeholder={`Rev ${entry.rev} · what changed? (Enter)`}
        value={text}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={keys}
        onBlur={commit}
        style={{ left: x + 36, top: y + 8 }}
        className="absolute z-20 w-[250px] rounded-[2px] border border-warning bg-surface px-1 py-[2px] text-[10.5px] font-medium text-note-ink outline-none placeholder:text-faint"
      />
    );
  }
  if (entry.kind === 'text') {
    return (
      <input
        ref={field}
        aria-label="Label text"
        placeholder="Type a label…"
        value={text}
        onChange={(e) => edit(e.target.value)}
        onKeyDown={keys}
        onBlur={commit}
        style={{ left: x, top: y - 3, fontSize: place.textSize }}
        className="absolute z-20 w-[220px] rounded-[2px] border border-tool bg-surface px-1 font-medium text-ink outline-none placeholder:text-faint"
      />
    );
  }
  // Where the note's box will sit: 24 × 40 px below-right of its pin.
  return (
    <textarea
      ref={field}
      aria-label="Note text"
      placeholder="Type a note… (Shift+Enter for a new line)"
      value={text}
      rows={3}
      onChange={(e) => edit(e.target.value)}
      onKeyDown={keys}
      onBlur={commit}
      style={{ left: x + 24, top: y + 40 }}
      className="absolute z-20 w-[210px] resize-none rounded-[2px] border border-warning bg-note px-[10px] py-2 text-11 text-ink outline-none placeholder:text-note-ink"
    />
  );
}

/** The Text / Note tool's input, on the canvas where the click landed. */
export function AnnotationEntry() {
  const store = useEditor();
  const entry = store.tools.place.entry;
  if (!entry) return null;
  const p = worldToScreen(store.viewport, entry.at);
  // A new entry is a new input: fresh text, and it commits on its own.
  return <EntryInput key={`${entry.at.x},${entry.at.y}`} entry={entry} x={p.x} y={p.y} />;
}
