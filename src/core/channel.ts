/**
 * A change feed of its own for values that change far more often than the
 * panels should re-render (frame stats, hover picks): only their readers
 * subscribe, via useSyncExternalStore.
 */
export class Channel {
  private readonly fns = new Set<() => void>();

  subscribe = (fn: () => void): (() => void) => {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  };

  emit(): void {
    for (const fn of this.fns) fn();
  }
}
