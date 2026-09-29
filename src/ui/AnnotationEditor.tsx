import { useEffect, useRef, useState } from 'react';
import type { PartRef } from '../core/annotationEdit';
import { partText } from '../core/annotationEdit';
import { NOTE_BOX, layoutAnnotation, samePart } from '../core/annotationLayout';
import type { Annotation } from '../core/annotations';
import type { Rect } from '../geometry/vec';
import { measureText } from '../render/textMeasure';
import { cn } from './cn';
import { useEditor } from './useStore';

/** Where the editor sits: over a note's or callout's box (even when its pin was clicked), else over the piece. */
function editorRect(a: Annotation, ref: PartRef, rects: { part: PartRef['part']; rect: Rect }[]): Rect | null {
  const want = a.type === 'note' || a.type === 'callout' ? { kind: 'box' as const } : ref.part;
  return rects.find((r) => samePart(r.part, want))?.rect ?? null;
}

function Field({ a, at, refTo }: { a: Annotation; at: Rect; refTo: PartRef }) {
  const store = useEditor();
  const edit = store.tools.annotation;
  const [text, setText] = useState(() => partText(a, refTo.part) ?? '');
  const done = useRef(false);
  const field = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  // Opened by a double-click: focus once the click has settled, words selected.
  useEffect(() => {
    const id = setTimeout(() => {
      field.current?.focus();
      field.current?.select();
    });
    return () => clearTimeout(id);
  }, []);
  const commit = () => {
    if (done.current) return;
    done.current = true;
    edit.commitText(refTo, text);
  };
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      done.current = true;
      edit.closeEditor();
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      commit();
    }
  };
  const common = {
    ref: field,
    value: text,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setText(e.target.value),
    onKeyDown: keys,
    onBlur: commit,
  };
  if (a.type === 'note' || a.type === 'callout') {
    const note = a.type === 'note';
    return (
      <textarea
        {...common}
        aria-label={note ? 'Note text' : 'Callout title and body'}
        rows={note ? 3 : 2}
        style={{ left: at.minX, top: at.minY, width: Math.max(note ? NOTE_BOX.w : 220, at.maxX - at.minX) }}
        className={cn(
          'absolute z-20 resize-none rounded-[2px] border px-[10px] py-2 text-11 text-ink outline-none',
          note ? 'border-warning bg-note' : 'border-ink bg-surface',
        )}
      />
    );
  }
  const room = a.type === 'area';
  const size = a.type === 'text' ? a.size : 11;
  const w = Math.max(room ? 120 : 160, at.maxX - at.minX + 24);
  return (
    <input
      {...common}
      aria-label={room ? 'Room name' : a.type === 'revision' ? 'Revision note' : 'Label text'}
      style={{
        left: room ? (at.minX + at.maxX) / 2 - w / 2 : at.minX + (a.type === 'revision' ? 38 : 0),
        top: at.minY - 3,
        width: w,
        fontSize: size,
      }}
      className={cn(
        'absolute z-20 rounded-[2px] border border-accent bg-surface px-1 font-medium text-ink outline-none',
        room && 'text-center font-semibold',
      )}
    />
  );
}

/** Double-click editor for an annotation's words (note, callout, label, room name, revision). */
export function AnnotationEditor() {
  const store = useEditor();
  const ref = store.tools.annotation.editing;
  const a = ref ? store.tools.annotation.annotation(ref.id) : null;
  if (!ref || !a) return null;
  const rects = layoutAnnotation(a, store.viewport, store.tools.measure.style, measureText).flatMap((p) =>
    p.shape.kind === 'rect' ? [{ part: p.part, rect: p.shape.rect }] : [],
  );
  const at = editorRect(a, ref, rects);
  if (!at) return null;
  // A different piece is a different editor: fresh text, one commit each.
  return <Field key={`${ref.id}:${JSON.stringify(ref.part)}`} a={a} at={at} refTo={ref} />;
}
