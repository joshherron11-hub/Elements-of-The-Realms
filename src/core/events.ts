/**
 * Kernel event bus.
 *
 * Systems announce facts ("contract.completed", "familiar.fed") on the bus.
 * Other systems — Chronicle, persistence, presentation, AI interpretation —
 * subscribe. This is the main seam that keeps simulation decoupled from
 * everything that observes it.
 *
 * The bus is synchronous and in-process. Handlers must not throw; a throwing
 * handler is isolated and reported so one bad observer cannot corrupt
 * simulation state.
 */
export interface KernelEvent<TType extends string = string, TPayload = unknown> {
  readonly type: TType;
  readonly at: number;
  readonly payload: TPayload;
}

export type EventHandler<E extends KernelEvent = KernelEvent> = (event: E) => void;

export class EventBus {
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly wildcard = new Set<EventHandler>();
  private readonly onHandlerError: (error: unknown, event: KernelEvent) => void;

  constructor(onHandlerError?: (error: unknown, event: KernelEvent) => void) {
    this.onHandlerError =
      onHandlerError ?? ((error, event) => console.error(`[EventBus] handler failed for ${event.type}`, error));
  }

  /** Subscribe to one event type, or '*' for all. Returns an unsubscribe fn. */
  on<E extends KernelEvent>(type: E['type'] | '*', handler: EventHandler<E>): () => void {
    const h = handler as EventHandler;
    if (type === '*') {
      this.wildcard.add(h);
      return () => this.wildcard.delete(h);
    }
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(h);
    return () => set.delete(h);
  }

  emit(event: KernelEvent): void {
    const specific = this.handlers.get(event.type);
    for (const h of [...(specific ?? []), ...this.wildcard]) {
      try {
        h(event);
      } catch (error) {
        this.onHandlerError(error, event);
      }
    }
  }
}
