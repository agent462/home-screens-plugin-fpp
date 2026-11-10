/**
 * Outlet states and power actions, shared by every Light Show on the page.
 *
 * Asks Home Assistant for the linked outlets every 30 s (15 s while a detail
 * sheet is open) and nothing at all when no controller is linked. A restart
 * is "off, wait 10 s, on"; Home Assistant has no single call for that, so the
 * wait runs here. The pending "on" is written to local storage first, so a
 * wall that reloads mid-restart finishes it when it comes back.
 */
import type { HaApi } from '../lib/ha';
import type { OutletReading } from '../lib/power';
import type { Fetcher } from './feed';

export const POLL_MS = 30_000;
export const POLL_OPEN_MS = 15_000;
const POLL_DOWN_MS = 60_000;
export const RESTART_OFF_MS = 10_000;
/** How long the sheet waits for a controller to answer after its power is back. */
export const STARTING_MS = 120_000;
/** How long to wait for the player to shut down before cutting its power. */
export const SHUTDOWN_MS = 30_000;
const SHUTDOWN_PROBE_MS = 3_000;
const RETRY_ON_MS = 5_000;
const PENDING_KEY = 'fpp-power-pending';

export interface PowerJob {
  kind: 'restart' | 'off';
  /** `shutdown`: the player is shutting down. `off`: waiting to turn back
   *  on. `starting`: power is back, the controller is booting. */
  phase: 'shutdown' | 'off' | 'starting';
  /** When this phase began. */
  since: number;
  /** When the power comes back (phase `off`). */
  onAt: number | null;
}

export interface PowerState {
  /** `none`: Home Assistant is not connected. `down`: it is not answering. */
  ha: 'none' | 'unknown' | 'ok' | 'down';
  /** Entity id → reading; `null` when Home Assistant no longer has it. */
  outlets: Readonly<Record<string, OutletReading | null>>;
  jobs: Readonly<Record<string, PowerJob>>;
}

export interface PowerStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

interface Pending { entity: string; onAt: number }

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class PowerStore {
  private state: PowerState = { ha: 'unknown', outlets: {}, jobs: {} };
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private ids: string[] = [];
  private due = 0;
  private busy = false;
  private open = 0;
  private retryOnAt = new Map<string, number>();
  private turningOn = new Set<string>();
  private resumed = false;

  constructor(
    private api: HaApi,
    private fetcher: Fetcher,
    private storage: PowerStorage | null = null,
    private now: () => number = Date.now,
  ) {}

  getState = (): PowerState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) {
      this.resume();
      this.due = 0;
      this.tick();
      this.timer = setInterval(() => this.tick(), 1000);
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.timer) { clearInterval(this.timer); this.timer = null; }
    };
  };

  /** The outlets linked to a controller on this page. */
  setLinked(ids: readonly string[]): void {
    const next = [...new Set(ids)].sort();
    if (next.join('|') === this.ids.join('|')) return;
    this.ids = next;
    this.due = 0;
  }

  /** A detail sheet is open: check a little more often. Returns the undo. */
  watchClosely(): () => void {
    this.open++;
    this.due = Math.min(this.due, this.now() + 1000);
    return () => { this.open--; };
  }

  private set(patch: Partial<PowerState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private setJob(entity: string, job: PowerJob | null): void {
    const jobs = { ...this.state.jobs };
    if (job) jobs[entity] = job; else delete jobs[entity];
    this.set({ jobs });
  }

  private setOutlet(entity: string, on: boolean): void {
    const was = this.state.outlets[entity];
    this.set({ outlets: { ...this.state.outlets, [entity]: { name: was?.name ?? entity, state: on ? 'on' : 'off', changedAt: this.now() } } });
    // Read it back soon rather than trusting the guess for a whole round.
    this.due = this.now() + 2000;
  }

  private pending(): Pending[] {
    try {
      const list = JSON.parse(this.storage?.getItem(PENDING_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter((p) => p && typeof p.entity === 'string' && typeof p.onAt === 'number') : [];
    } catch {
      return [];
    }
  }

  private savePending(entity: string, onAt: number | null): void {
    try {
      const rest = this.pending().filter((p) => p.entity !== entity);
      this.storage?.setItem(PENDING_KEY, JSON.stringify(onAt === null ? rest : [...rest, { entity, onAt }]));
    } catch { /* storage full or blocked: the restart still runs on this page */ }
  }

  /** Pick up restarts a reload interrupted. */
  private resume(): void {
    if (this.resumed) return;
    this.resumed = true;
    const jobs = { ...this.state.jobs };
    for (const p of this.pending()) {
      if (!jobs[p.entity]) jobs[p.entity] = { kind: 'restart', phase: 'off', since: Math.min(p.onAt - RESTART_OFF_MS, this.now()), onAt: p.onAt };
    }
    this.set({ jobs });
  }

  /** Exposed for tests; the interval calls it once a second. */
  tick(): void {
    const now = this.now();
    for (const [entity, job] of Object.entries(this.state.jobs)) {
      if (job.phase === 'off' && job.onAt !== null && now >= job.onAt) this.powerBackOn(entity, job);
      else if (job.phase === 'starting' && now - job.since > STARTING_MS) this.setJob(entity, null);
    }

    if (!this.api.connected()) {
      if (this.state.ha !== 'none') this.set({ ha: 'none', outlets: {} });
      return;
    }
    if (this.state.ha === 'none') this.set({ ha: 'unknown' });
    if (!this.ids.length || this.busy || now < this.due) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    this.busy = true;
    this.api.states(this.ids)
      .then((outlets) => {
        // An action that landed while this was out knows better.
        const kept: Record<string, OutletReading | null> = { ...outlets };
        for (const entity of Object.keys(this.state.jobs)) if (entity in this.state.outlets) kept[entity] = this.state.outlets[entity];
        this.set({ ha: 'ok', outlets: kept });
        this.due = Math.max(this.due, this.now() + (this.open > 0 ? POLL_OPEN_MS : POLL_MS));
      })
      .catch(() => {
        this.set({ ha: 'down' });
        this.due = this.now() + POLL_DOWN_MS;
      })
      .finally(() => { this.busy = false; });
  }

  private powerBackOn(entity: string, job: PowerJob): void {
    const now = this.now();
    if (this.turningOn.has(entity) || now < (this.retryOnAt.get(entity) ?? 0)) return;
    // Give up after two minutes of trying; the card then reads "Power off"
    // and Turn on is one tap away.
    if (job.onAt !== null && now - job.onAt > STARTING_MS) {
      this.savePending(entity, null);
      this.retryOnAt.delete(entity);
      this.setJob(entity, null);
      return;
    }
    this.turningOn.add(entity);
    this.api.set(entity, true)
      .then(() => {
        this.savePending(entity, null);
        this.retryOnAt.delete(entity);
        this.setOutlet(entity, true);
        this.setJob(entity, { ...job, phase: 'starting', since: this.now(), onAt: null });
      })
      .catch(() => { this.retryOnAt.set(entity, this.now() + RETRY_ON_MS); })
      .finally(() => { this.turningOn.delete(entity); });
  }

  /** Ask the player to shut down, and wait until it stops answering. */
  private async shutDown(base: string): Promise<void> {
    try { await withTimeout(this.fetcher(`${base}/api/system/shutdown`, 0), 8000); } catch { /* it may drop the call as it goes down */ }
    const until = this.now() + SHUTDOWN_MS;
    while (this.now() < until) {
      await wait(SHUTDOWN_PROBE_MS);
      try { await withTimeout(this.fetcher(`${base}/api/fppd/status`, 0), SHUTDOWN_PROBE_MS); } catch { return; }
    }
  }

  async turnOn(entity: string): Promise<void> {
    await this.api.set(entity, true);
    this.savePending(entity, null);
    this.setOutlet(entity, true);
    // The controller needs a minute to start: the sheet says so instead of
    // offering to restart what was only just switched on.
    this.setJob(entity, { kind: 'restart', phase: 'starting', since: this.now(), onAt: null });
  }

  /** `shutDownFirst`: the show player's address, while it is still answering. */
  async turnOff(entity: string, shutDownFirst?: string): Promise<void> {
    if (this.state.jobs[entity]) return;
    try {
      if (shutDownFirst) {
        this.setJob(entity, { kind: 'off', phase: 'shutdown', since: this.now(), onAt: null });
        await this.shutDown(shutDownFirst);
      }
      await this.api.set(entity, false);
      this.setOutlet(entity, false);
    } finally {
      const left: PowerJob | undefined = this.getState().jobs[entity];
      if (left?.kind === 'off') this.setJob(entity, null);
    }
  }

  async restart(entity: string, shutDownFirst?: string): Promise<void> {
    if (this.state.jobs[entity]) return;
    try {
      if (shutDownFirst) {
        this.setJob(entity, { kind: 'restart', phase: 'shutdown', since: this.now(), onAt: null });
        await this.shutDown(shutDownFirst);
      }
      const onAt = this.now() + RESTART_OFF_MS;
      // Written before the power goes, so no reload can leave it off.
      this.savePending(entity, onAt);
      await this.api.set(entity, false);
      this.setOutlet(entity, false);
      this.setJob(entity, { kind: 'restart', phase: 'off', since: this.now(), onAt });
    } catch (err) {
      this.savePending(entity, null);
      this.setJob(entity, null);
      throw err;
    }
  }
}

let shared: PowerStore | null = null;

/** The page's one power store (created on first use). */
export function powerStore(make: () => PowerStore): PowerStore {
  if (!shared) shared = make();
  return shared;
}
