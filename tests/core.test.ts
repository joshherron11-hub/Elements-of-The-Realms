import { describe, expect, it, vi } from 'vitest';
import { EventBus, Kernel, ManualClock, SequentialIdFactory, err, ok, type KernelModule } from '../src/core';

describe('ids', () => {
  it('sequential factory is deterministic and prefixed', () => {
    const ids = new SequentialIdFactory();
    expect(ids.next('actor')).toBe('actor_000001');
    expect(ids.next('location')).toBe('location_000002');
  });
});

describe('ManualClock', () => {
  it('advances only when told and refuses to go backwards', () => {
    const c = new ManualClock(100);
    c.advance(50);
    expect(c.now()).toBe(150);
    expect(() => c.advance(-1)).toThrow();
  });
});

describe('Result', () => {
  it('distinguishes ok and err', () => {
    expect(ok(3)).toEqual({ ok: true, value: 3 });
    const e = err('NO_COIN', 'not enough coin');
    expect(e.ok).toBe(false);
  });
});

describe('EventBus', () => {
  it('delivers to specific and wildcard handlers and supports unsubscribe', () => {
    const bus = new EventBus();
    const specific = vi.fn();
    const all = vi.fn();
    const off = bus.on('a', specific);
    bus.on('*', all);
    bus.emit({ type: 'a', at: 0, payload: 1 });
    bus.emit({ type: 'b', at: 0, payload: 2 });
    off();
    bus.emit({ type: 'a', at: 0, payload: 3 });
    expect(specific).toHaveBeenCalledTimes(1);
    expect(all).toHaveBeenCalledTimes(3);
  });

  it('isolates a throwing handler from other handlers', () => {
    const onError = vi.fn();
    const bus = new EventBus(onError);
    const good = vi.fn();
    bus.on('x', () => {
      throw new Error('boom');
    });
    bus.on('x', good);
    bus.emit({ type: 'x', at: 0, payload: null });
    expect(good).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledOnce();
  });
});

describe('Kernel', () => {
  it('initialises, ticks and disposes modules in order', () => {
    const calls: string[] = [];
    const mod: KernelModule = {
      id: 'test',
      init: () => calls.push('init'),
      tick: (dt) => calls.push(`tick:${dt}`),
      dispose: () => calls.push('dispose'),
    };
    const k = new Kernel({ clock: new ManualClock(), ids: new SequentialIdFactory() });
    k.register(mod);
    expect(() => k.tick(1)).toThrow();
    k.start();
    k.tick(16);
    k.stop();
    expect(calls).toEqual(['init', 'tick:16', 'dispose']);
  });

  it('rejects duplicate module ids and resolves registered modules', () => {
    const k = new Kernel();
    k.register({ id: 'economy' });
    expect(() => k.register({ id: 'economy' })).toThrow();
    expect(k.module('economy').id).toBe('economy');
    expect(() => k.module('missing')).toThrow();
  });

  it('announces start on the event bus', () => {
    const k = new Kernel({ clock: new ManualClock(42) });
    const seen = vi.fn();
    k.events.on('kernel.started', seen);
    k.start();
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ type: 'kernel.started', at: 42 }));
  });
});
