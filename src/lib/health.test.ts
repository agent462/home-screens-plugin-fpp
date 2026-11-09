import { describe, expect, it } from 'vitest';
import statuses from '../../test/fixtures/statuses.json';
import fixture from '../../test/fixtures/multiSyncSystems.json';
import type { FppStatus, FppSystem } from './fpp-types';
import { applyCheck, healthOf, namesSentence, summarize, type Health, type Reading } from './health';
import { controllersFrom } from './systems';

const st = (ip: string) => (statuses as Record<string, FppStatus>)[ip];
const T0 = Date.parse('2026-11-27T19:30:00-06:00');
const min = (n: number) => n * 60_000;

describe('applyCheck and healthOf', () => {
  it('is quiet when all is well', () => {
    const r = applyCheck(undefined, { ok: true, status: st('192.168.0.118') }, T0, false);
    expect(healthOf(r, T0)).toMatchObject({ tone: 'ok', label: '', reason: null });
  });

  it('needs two misses before Offline, and counts from the last answer', () => {
    let r = applyCheck(undefined, { ok: true, status: st('192.168.0.110') }, T0, false);
    r = applyCheck(r, { ok: false }, T0 + min(1), false);
    expect(healthOf(r, T0 + min(1)).offline).toBe(false);
    r = applyCheck(r, { ok: false }, T0 + min(2), false);
    expect(healthOf(r, T0 + min(6))).toMatchObject({ offline: true, tone: 'bad', label: 'Offline · 6 min' });
    expect(r.status).not.toBeNull(); // last good answer kept for the sheet
  });

  it('says Offline for a box never heard from (the card adds Not heard from yet)', () => {
    let r = applyCheck(undefined, { ok: false }, T0, false);
    r = applyCheck(r, { ok: false }, T0 + 1000, false);
    expect(healthOf(r, T0 + 2000).label).toBe('Offline');
  });

  it('notices a restart from uptime going backwards and drops it after 10 minutes', () => {
    const before = { ...st('192.168.0.107'), status_name: 'playing', uptimeTotalSeconds: 4000 };
    const after = { ...st('192.168.0.107'), status_name: 'playing', uptimeTotalSeconds: 180 };
    let r = applyCheck(undefined, { ok: true, status: before }, T0, true);
    r = applyCheck(r, { ok: true, status: after }, T0 + min(1), true);
    expect(healthOf(r, T0 + min(1))).toMatchObject({ reason: 'restarted', label: 'Restarted 3 min ago' });
    r = applyCheck(r, { ok: true, status: { ...after, uptimeTotalSeconds: 900 } }, T0 + min(13), true);
    expect(healthOf(r, T0 + min(13)).reason).toBeNull();
  });

  it('says Not playing after two idle checks while the player plays', () => {
    const idle = st('192.168.0.112');
    let r = applyCheck(undefined, { ok: true, status: idle }, T0, true);
    expect(healthOf(r, T0).reason).toBeNull();
    r = applyCheck(r, { ok: true, status: idle }, T0 + 30_000, true);
    expect(healthOf(r, T0 + 30_000)).toMatchObject({ tone: 'warn', label: 'Not playing' });
    r = applyCheck(r, { ok: true, status: { ...idle, status_name: 'playing' } }, T0 + 60_000, true);
    expect(healthOf(r, T0 + 60_000).reason).toBeNull();
  });

  it('puts a warning ahead of heat and power', () => {
    const quad = st('192.168.0.113');
    const hot = { ...quad, sensors: [{ label: 'Temp1: ', value: 80, valueType: 'Temperature' }] };
    const r = applyCheck(undefined, { ok: true, status: hot }, T0, false);
    expect(healthOf(r, T0)).toMatchObject({ reason: 'warning', label: 'Warning' });
    const r2 = applyCheck(undefined, { ok: true, status: { ...hot, warnings: [] } }, T0, false);
    expect(healthOf(r2, T0)).toMatchObject({ reason: 'hot', label: 'Running hot' });
  });
});

describe('summarize the real show', () => {
  it('counts online, warnings and the warmest box', () => {
    const controllers = controllersFrom((fixture.systems as FppSystem[]));
    const readings = new Map<string, Reading>();
    const health = new Map<string, Health>();
    for (const c of controllers) {
      const r = applyCheck(undefined, { ok: true, status: st(c.address) }, T0, false);
      readings.set(c.id, r);
      health.set(c.id, healthOf(r, T0));
    }
    const s = summarize(controllers, health, readings);
    expect(s).toMatchObject({ total: 19, online: 19, remotesOnline: 18, remotesPlaying: 0, warningNames: ['Quad Props'], offlineNames: [] });
    expect(s.warmest?.celsius).toBeCloseTo(69.5, 1);
  });

  it('writes names as a sentence', () => {
    expect(namesSentence(['Garage'], 'are offline')).toBe('Garage is offline');
    expect(namesSentence(['Garage', 'Roof'], 'are offline')).toBe('Garage and Roof are offline');
    expect(namesSentence(['A', 'B', 'C'], 'are offline')).toBe('3 are offline');
  });
});
