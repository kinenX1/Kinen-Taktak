/** Minimal typed event bus. The match emits commentary-ready events through it. */
export type Handler<T> = (payload: T) => void;
export class EventBus<M extends Record<string, unknown>> {
  private map = new Map<keyof M, Set<Handler<any>>>();
  on<K extends keyof M>(type: K, fn: Handler<M[K]>) {
    if (!this.map.has(type)) this.map.set(type, new Set());
    this.map.get(type)!.add(fn);
    return () => this.off(type, fn);
  }
  off<K extends keyof M>(type: K, fn: Handler<M[K]>) { this.map.get(type)?.delete(fn); }
  emit<K extends keyof M>(type: K, payload: M[K]) {
    this.map.get(type)?.forEach((fn) => fn(payload));
  }
  clear() { this.map.clear(); }
}
