import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HaApi } from '../lib/ha';
import type { OutletReading } from '../lib/power';
import { PowerStore, RESTART_OFF_MS, STARTING_MS, type PowerStorage } from './power';

const E = 'switch.garage_plug';

function rig(opts: { connected?: boolean; failSet?: () => boolean; fetcher?: (url: string) => Promise<unknown>; saved?: string } = {}) {
  const outlets: Record<string, OutletReading | null> = { [E]: { state: 'on', name: 'Garage plug', changedAt: null } };
  const calls: string[] = [];
  const api: HaApi = {
    connected: () => opts.connected !== false,
    states: vi.fn(async (ids: readonly string[]) => { calls.push(`states:${ids.join(',')}`); return { ...outlets }; }),
    set: vi.fn(async (id: string, on: boolean) => {
      if (opts.failSet?.()) throw new Error('down');
      calls.push(`${on ? 'on' : 'off'}:${id}`);
      outlets[id] = { state: on ? 'on' : 'off', name: 'Garage plug', changedAt: Date.now() };
    }),
  };
  const mem = new Map<string, string>(opts.saved ? [['fpp-power-pending', opts.saved]] : []);
  const storage: PowerStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { mem.set(k, v); } };
  const fetcher = vi.fn((url: string) => (opts.fetcher ? opts.fetcher(url) : Promise.resolve({})));
  const store = new PowerStore(api, fetcher, storage);
  return { store, api, calls, mem, fetcher };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T19:42:00-06:00')); });
afterEach(() => { vi.useRealTimers(); });

describe('outlet polling', () => {
  it('asks nothing while no controller is linked', async () => {
    const { store, api } = rig();
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(120_000);
    expect(api.states).not.toHaveBeenCalled();
    off();
  });

  it('asks nothing when Home Assistant is not connected', async () => {
    const { store, api } = rig({ connected: false });
    store.setLinked([E]);
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(60_000);
    expect(api.states).not.toHaveBeenCalled();
    expect(store.getState().ha).toBe('none');
    off();
  });

  it('reads the linked outlets every 30 s, 15 s while a sheet is open', async () => {
    const { store, api } = rig();
    store.setLinked([E]);
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().ha).toBe('ok');
    expect(store.getState().outlets[E]?.state).toBe('on');
    await vi.advanceTimersByTimeAsync(61_000);
    expect(api.states).toHaveBeenCalledTimes(3);
    const done = store.watchClosely();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((api.states as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(6);
    done();
    off();
  });
});

describe('restart power', () => {
  it('turns off, waits 10 s, turns back on, then waits for the controller', async () => {
    const { store, calls, mem } = rig();
    store.setLinked([E]);
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(100);
    await store.restart(E);
    expect(calls).toContain(`off:${E}`);
    expect(store.getState().jobs[E]?.phase).toBe('off');
    expect(store.getState().outlets[E]?.state).toBe('off');
    expect(JSON.parse(mem.get('fpp-power-pending')!)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(RESTART_OFF_MS - 2000);
    expect(calls).not.toContain(`on:${E}`);
    await vi.advanceTimersByTimeAsync(3000);
    expect(calls).toContain(`on:${E}`);
    expect(store.getState().jobs[E]?.phase).toBe('starting');
    expect(JSON.parse(mem.get('fpp-power-pending')!)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(STARTING_MS + 2000);
    expect(store.getState().jobs[E]).toBeUndefined();
    off();
  });

  it('leaves nothing behind when the turn-off fails', async () => {
    const { store, mem } = rig({ failSet: () => true });
    const off = store.subscribe(() => {});
    await expect(store.restart(E)).rejects.toThrow();
    expect(store.getState().jobs[E]).toBeUndefined();
    expect(JSON.parse(mem.get('fpp-power-pending')!)).toHaveLength(0);
    off();
  });

  it('keeps trying to turn back on when Home Assistant drops out mid-restart', async () => {
    let fail = false;
    const { store, calls } = rig({ failSet: () => fail });
    const off = store.subscribe(() => {});
    await store.restart(E);
    fail = true;
    await vi.advanceTimersByTimeAsync(RESTART_OFF_MS + 6000);
    expect(calls).not.toContain(`on:${E}`);
    expect(store.getState().jobs[E]?.phase).toBe('off');
    fail = false;
    await vi.advanceTimersByTimeAsync(6000);
    expect(calls).toContain(`on:${E}`);
    off();
  });

  it('finishes a restart that a reload interrupted', async () => {
    const saved = JSON.stringify([{ entity: E, onAt: Date.now() - 60_000 }]);
    const { store, calls } = rig({ saved });
    const off = store.subscribe(() => {});
    await vi.advanceTimersByTimeAsync(1500);
    expect(calls).toContain(`on:${E}`);
    off();
  });
});

describe('the show player', () => {
  it('is shut down first, and loses power once it stops answering', async () => {
    let up = true;
    const { store, calls, fetcher } = rig({
      fetcher: (url) => {
        if (url.endsWith('/api/system/shutdown')) { setTimeout(() => { up = false; }, 7000); return Promise.resolve({}); }
        return up ? Promise.resolve({}) : Promise.reject(new Error('gone'));
      },
    });
    const off = store.subscribe(() => {});
    const done = store.turnOff(E, 'http://192.168.0.200');
    await vi.advanceTimersByTimeAsync(100);
    expect(store.getState().jobs[E]?.phase).toBe('shutdown');
    expect(fetcher).toHaveBeenCalledWith('http://192.168.0.200/api/system/shutdown', 0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls).not.toContain(`off:${E}`);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(calls).toContain(`off:${E}`);
    expect(store.getState().jobs[E]).toBeUndefined();
    off();
  });

  it('loses power after 30 s even if it never stops answering', async () => {
    const { store, calls } = rig();
    const off = store.subscribe(() => {});
    const done = store.turnOff(E, 'http://192.168.0.200');
    await vi.advanceTimersByTimeAsync(29_000);
    expect(calls).not.toContain(`off:${E}`);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(calls).toContain(`off:${E}`);
    off();
  });
});

describe('turn on', () => {
  it('turns the outlet on and waits for the controller to start', async () => {
    const { store, calls } = rig();
    const off = store.subscribe(() => {});
    await store.turnOn(E);
    expect(calls).toContain(`on:${E}`);
    expect(store.getState().outlets[E]?.state).toBe('on');
    expect(store.getState().jobs[E]?.phase).toBe('starting');
    off();
  });
});
