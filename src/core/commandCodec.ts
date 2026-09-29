import type { HistoryEntry, StackSnapshot } from './commandStack';
import { type Command, SetAppearanceCommand, TransformCommand } from './commands';
import { AddLayerCommand, DeleteLayerCommand, LayerPropsCommand, ReorderLayerCommand } from './layerCommands';
import { AddObjectsCommand, BatchCommand, DeleteCommand, EditObjectsCommand, GroupCommand } from './structureCommands';

/**
 * Every command class the history can hold, under a stable tag. Tags, not
 * class names: a production build minifies names.
 */
const REGISTRY = {
  transform: TransformCommand,
  appearance: SetAppearanceCommand,
  batch: BatchCommand,
  delete: DeleteCommand,
  add: AddObjectsCommand,
  group: GroupCommand,
  edit: EditObjectsCommand,
  layerProps: LayerPropsCommand,
  reorderLayer: ReorderLayerCommand,
  addLayer: AddLayerCommand,
  deleteLayer: DeleteLayerCommand,
} as const;

type Tag = keyof typeof REGISTRY;

export interface EncodedCommand {
  kind: Tag;
  props: Record<string, unknown>;
}

const MAP = '__map';

/** Deep copy of a command's own fields, with Maps as entry arrays and child commands encoded. */
function encodeValue(v: unknown): unknown {
  if (v instanceof Map) return { [MAP]: [...v].map(([k, x]) => [k, encodeValue(x)]) };
  if (Array.isArray(v)) return v.map((x) => (isCommand(x) ? encodeCommand(x) : encodeValue(x)));
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)]));
  return v;
}

function decodeValue(v: unknown): unknown {
  if (Array.isArray(v)) return v.map((x) => (isEncoded(x) ? decodeCommand(x) : decodeValue(x)));
  if (v && typeof v === 'object') {
    if (MAP in v) return new Map((v as { [MAP]: [unknown, unknown][] })[MAP].map(([k, x]) => [k, decodeValue(x)]));
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decodeValue(x)]));
  }
  return v;
}

function isCommand(v: unknown): v is Command {
  return !!v && typeof v === 'object' && Object.values(REGISTRY).some((C) => v instanceof C);
}

function isEncoded(v: unknown): v is EncodedCommand {
  return !!v && typeof v === 'object' && 'kind' in v && 'props' in v && (v as { kind: string }).kind in REGISTRY;
}

export function encodeCommand(cmd: Command): EncodedCommand {
  const kind = (Object.keys(REGISTRY) as Tag[]).find((t) => cmd instanceof REGISTRY[t]);
  if (!kind) throw new Error(`No codec for command ${cmd.type}`);
  return { kind, props: encodeValue({ ...cmd }) as Record<string, unknown> };
}

/** Rebuilt on the class prototype, so execute / undo / merge behave exactly as before. */
export function decodeCommand(e: EncodedCommand): Command {
  const cmd = Object.create(REGISTRY[e.kind].prototype) as Command;
  return Object.assign(cmd, decodeValue(e.props));
}

interface EncodedEntry {
  seq: number;
  cmd: EncodedCommand;
}

export interface EncodedHistory {
  entries: EncodedEntry[];
  head: number;
  nextSeq: number;
  coalesced: number;
  branches: { fork: number; entries: EncodedEntry[] }[];
}

const encodeEntries = (es: readonly HistoryEntry[]): EncodedEntry[] =>
  es.map((e) => ({ seq: e.seq, cmd: encodeCommand(e.cmd) }));
const decodeEntries = (es: readonly EncodedEntry[]): HistoryEntry[] =>
  es.map((e) => ({ seq: e.seq, cmd: decodeCommand(e.cmd) }));

export function encodeHistory(s: StackSnapshot): EncodedHistory {
  return {
    entries: encodeEntries(s.entries),
    head: s.head,
    nextSeq: s.nextSeq,
    coalesced: s.coalesced,
    branches: s.branches.map((b) => ({ fork: b.fork, entries: encodeEntries(b.entries) })),
  };
}

export function decodeHistory(h: EncodedHistory): StackSnapshot {
  return {
    entries: decodeEntries(h.entries),
    head: h.head,
    nextSeq: h.nextSeq,
    coalesced: h.coalesced,
    branches: h.branches.map((b) => ({ fork: b.fork, entries: decodeEntries(b.entries) })),
  };
}

/** What the history would weigh in the project file (UTF-8 bytes of its JSON). */
export function historyBytes(s: StackSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(encodeHistory(s))).length;
}
