import type { FppStatus } from './fpp-types';
import { spanText } from './format';
import type { Controller } from './systems';
import { summarizeSensors, warningTexts, type SensorSummary } from './sensors';

/** Misses in a row before a box is called Offline (one dropped packet is not news). */
export const OFFLINE_AFTER_MISSES = 2;
/** Idle checks in a row, while the player plays, before "Not playing". */
export const NOT_PLAYING_AFTER = 2;
/** How long a "Restarted" label stays up. */
export const RESTART_LABEL_MS = 10 * 60 * 1000;

/** What the wall knows about one box, built up check by check. */
export interface Reading {
  /** The last good answer (kept while the box is not answering). */
  status: FppStatus | null;
  lastOkAt: number | null;
  /** First miss of the current run of misses. */
  firstMissAt: number | null;
  misses: number;
  /** When the box came back up, if its uptime was seen going backwards. */
  restartedAt: number | null;
  /** Checks in a row that found it idle while the player was playing. */
  idleWhilePlaying: number;
}

export const emptyReading = (): Reading => ({
  status: null, lastOkAt: null, firstMissAt: null, misses: 0, restartedAt: null, idleWhilePlaying: 0,
});

export type CheckResult = { ok: true; status: FppStatus } | { ok: false };

const isPlaying = (s: FppStatus | null | undefined) => (s?.status_name ?? '').toLowerCase() === 'playing';

/** Fold one check into a box's reading. */
export function applyCheck(prev: Reading | undefined, result: CheckResult, nowMs: number, playerPlaying: boolean): Reading {
  const r = prev ?? emptyReading();
  if (!result.ok) {
    return { ...r, misses: r.misses + 1, firstMissAt: r.firstMissAt ?? nowMs };
  }
  const up = result.status.uptimeTotalSeconds;
  const prevUp = r.status?.uptimeTotalSeconds;
  let restartedAt = r.restartedAt;
  if (typeof up === 'number' && typeof prevUp === 'number' && up + 5 < prevUp) {
    restartedAt = nowMs - up * 1000;
  }
  if (restartedAt !== null && nowMs - restartedAt > RESTART_LABEL_MS) restartedAt = null;
  return {
    status: result.status,
    lastOkAt: nowMs,
    firstMissAt: null,
    misses: 0,
    restartedAt,
    idleWhilePlaying: playerPlaying && !isPlaying(result.status) ? r.idleWhilePlaying + 1 : 0,
  };
}

export type Tone = 'ok' | 'warn' | 'bad' | 'unknown';
export type Reason = 'offline' | 'powerOff' | 'warning' | 'notPlaying' | 'restarted' | 'hot' | 'lowPower';

/** A controller's linked outlet, as far as its card cares. */
export interface OutletPower {
  off: boolean;
  /** When it was turned off. */
  since: number | null;
}

export interface Health {
  tone: Tone;
  reason: Reason | null;
  /** The words on the card, '' when all is well. */
  label: string;
  offline: boolean;
  /** Not answering because its outlet is off: on purpose, not a fault. */
  poweredOff: boolean;
  /** When the outlet went off, when known. */
  offSince: number | null;
  sensors: SensorSummary;
  warnings: string[];
}

/** One card's state. A card says something only when something is wrong. */
export function healthOf(reading: Reading | undefined, nowMs: number, outlet?: OutletPower): Health {
  const r = reading ?? emptyReading();
  const sensors = summarizeSensors(r.status?.sensors);
  const warnings = warningTexts(r.status?.warnings);
  const base = { sensors, warnings, offline: false, poweredOff: false, offSince: null };
  // Its outlet is off and it has stopped answering: switched off, not lost.
  if (outlet?.off && r.misses >= 1) {
    return { ...base, offline: true, poweredOff: true, offSince: outlet.since, tone: 'unknown', reason: 'powerOff', label: 'Power off' };
  }
  if (r.misses >= OFFLINE_AFTER_MISSES) {
    const since = r.lastOkAt ?? r.firstMissAt;
    return {
      ...base, offline: true, tone: 'bad', reason: 'offline',
      label: r.lastOkAt === null ? 'Offline' : `Offline · ${spanText(nowMs - (since ?? nowMs))}`,
    };
  }
  if (!r.status) return { ...base, tone: 'unknown', reason: null, label: '' };
  if (warnings.length) return { ...base, tone: 'warn', reason: 'warning', label: warnings.length > 1 ? `${warnings.length} warnings` : 'Warning' };
  // A box that just came back is idle while it boots: say why first.
  if (r.restartedAt !== null && nowMs - r.restartedAt <= RESTART_LABEL_MS) {
    return { ...base, tone: 'warn', reason: 'restarted', label: `Restarted ${spanText(nowMs - r.restartedAt)} ago` };
  }
  if (r.idleWhilePlaying >= NOT_PLAYING_AFTER) return { ...base, tone: 'warn', reason: 'notPlaying', label: 'Not playing' };
  if (sensors.hot) return { ...base, tone: 'warn', reason: 'hot', label: 'Running hot' };
  if (sensors.lowPower) return { ...base, tone: 'warn', reason: 'lowPower', label: 'Low power' };
  return { ...base, tone: 'ok', reason: null, label: '' };
}

export interface Summary {
  total: number;
  online: number;
  offlineNames: string[];
  /** Switched off at the outlet; not counted as offline. */
  poweredOffNames: string[];
  /** Remotes (not the player) that answered. */
  remotesOnline: number;
  /** Of those, how many are playing right now. */
  remotesPlaying: number;
  warningNames: string[];
  warmest: { name: string; celsius: number } | null;
}

export function summarize(controllers: Controller[], health: Map<string, Health>, readings: Map<string, Reading>): Summary {
  let online = 0;
  let remotesOnline = 0;
  let remotesPlaying = 0;
  const offlineNames: string[] = [];
  const poweredOffNames: string[] = [];
  const warningNames: string[] = [];
  let warmest: Summary['warmest'] = null;
  for (const c of controllers) {
    const h = health.get(c.id);
    const r = readings.get(c.id);
    if (h?.poweredOff) { poweredOffNames.push(c.name); continue; }
    if (h?.offline) { offlineNames.push(c.name); continue; }
    if (!r?.status) continue;
    online++;
    if (!c.isPlayer) {
      remotesOnline++;
      if (isPlaying(r.status)) remotesPlaying++;
    }
    if (h?.warnings.length) warningNames.push(c.name);
    const hot = h?.sensors.hottest;
    if (hot != null && (!warmest || hot > warmest.celsius)) warmest = { name: c.name, celsius: hot };
  }
  return { total: controllers.length, online, offlineNames, poweredOffNames, remotesOnline, remotesPlaying, warningNames, warmest };
}

/** "Garage is offline", "Garage and Roof are offline", "3 are offline". */
export function namesSentence(names: string[], verb: string): string {
  if (names.length === 0) return '';
  if (names.length === 1) return `${names[0]} ${verb.replace(/^are /, 'is ')}`;
  if (names.length === 2) return `${names[0]} and ${names[1]} ${verb}`;
  return `${names.length} ${verb}`;
}
