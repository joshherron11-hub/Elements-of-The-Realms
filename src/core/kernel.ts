import { type Clock, SystemClock } from './clock';
import { EventBus } from './events';
import { type IdFactory, RandomIdFactory } from './ids';

/**
 * A kernel module is a self-contained system (economy, familiars, chronicle…)
 * that plugs into the kernel. Modules only talk to each other through the
 * shared services below and the event bus — never by reaching into each
 * other's internals.
 */
export interface KernelModule {
  /** Stable, unique module id, e.g. "economy". */
  readonly id: string;
  /** Called once when the kernel starts. */
  init?(kernel: Kernel): void;
  /** Called on each simulation step with elapsed simulated milliseconds. */
  tick?(dtMs: number, kernel: Kernel): void;
  /** Called when the kernel shuts down. */
  dispose?(): void;
}

export interface KernelServices {
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly events: EventBus;
}

export interface KernelOptions {
  clock?: Clock;
  ids?: IdFactory;
  events?: EventBus;
}

/**
 * The universal kernel. It knows nothing about Happy Fall, Blackmere, or any
 * Realm. Realms, servers and modes are configuration loaded on top of it.
 *
 * The kernel is pure simulation: it has no dependency on rendering, the DOM,
 * storage, or any AI provider.
 */
export class Kernel implements KernelServices {
  readonly clock: Clock;
  readonly ids: IdFactory;
  readonly events: EventBus;
  private readonly modules = new Map<string, KernelModule>();
  private started = false;

  constructor(options: KernelOptions = {}) {
    this.clock = options.clock ?? new SystemClock();
    this.ids = options.ids ?? new RandomIdFactory();
    this.events = options.events ?? new EventBus();
  }

  register(module: KernelModule): this {
    if (this.modules.has(module.id)) {
      throw new Error(`Kernel module "${module.id}" is already registered`);
    }
    this.modules.set(module.id, module);
    if (this.started) module.init?.(this);
    return this;
  }

  module<M extends KernelModule>(id: string): M {
    const m = this.modules.get(id);
    if (!m) throw new Error(`Kernel module "${id}" is not registered`);
    return m as M;
  }

  hasModule(id: string): boolean {
    return this.modules.has(id);
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    for (const m of this.modules.values()) m.init?.(this);
    this.events.emit({ type: 'kernel.started', at: this.clock.now(), payload: { modules: [...this.modules.keys()] } });
  }

  tick(dtMs: number): void {
    if (!this.started) throw new Error('Kernel.tick called before start()');
    for (const m of this.modules.values()) m.tick?.(dtMs, this);
  }

  stop(): void {
    if (!this.started) return;
    for (const m of [...this.modules.values()].reverse()) m.dispose?.();
    this.started = false;
  }

  get isRunning(): boolean {
    return this.started;
  }
}
