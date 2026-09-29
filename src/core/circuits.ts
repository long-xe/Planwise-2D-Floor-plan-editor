import type { Doc, Furniture } from './document';

export interface CircuitInfo {
  id: string;
  switches: number;
  lights: number;
}

/** "c3" → "C3", as the panels and pills name circuits. */
export const circuitLabel = (id: string): string => id.toUpperCase();

const num = (id: string) => Number(id.replace(/\D+/g, '')) || 0;

/** Every circuit on the plan with what's on it, in number order ("C1", "C2", … "C10"). */
export function circuitsOf(doc: Doc): CircuitInfo[] {
  const byId = new Map<string, CircuitInfo>();
  for (const o of doc.objects) {
    if (o.kind !== 'furniture' || !o.circuit) continue;
    const c = byId.get(o.circuit) ?? { id: o.circuit, switches: 0, lights: 0 };
    if (o.icon === 'switch') c.switches++;
    if (o.icon === 'light') c.lights++;
    byId.set(o.circuit, c);
  }
  return [...byId.values()].toSorted((a, b) => num(a.id) - num(b.id) || a.id.localeCompare(b.id));
}

/** A circuit id no fixture uses yet, past any in `also` (one armed but not placed). */
export function nextCircuitId(doc: Doc, also: readonly (string | null)[] = []): string {
  const taken = [...circuitsOf(doc).map((c) => c.id), ...also.filter((x): x is string => !!x)];
  return `c${Math.max(0, ...taken.map(num)) + 1}`;
}

/** The switches and lights sharing `circuit`, except `self`. */
export function circuitMates(doc: Doc, circuit: string, self?: string): Furniture[] {
  return doc.objects.filter((o): o is Furniture => o.kind === 'furniture' && o.circuit === circuit && o.id !== self);
}

const part = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "1 switch · 2 lights". */
export function circuitSummary(c: CircuitInfo): string {
  return `${part(c.switches, 'switch', 'switches')} · ${part(c.lights, 'light', 'lights')}`;
}
