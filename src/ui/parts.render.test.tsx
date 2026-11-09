// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import statuses from '../../test/fixtures/statuses.json';
import type { FppStatus } from '../lib/fpp-types';
import { applyCheck, emptyReading, healthOf } from '../lib/health';
import type { Controller } from '../lib/systems';
import type { ControllerView, ShowModel } from '../data/model';
import { HeroMessage } from './hero';
import { Card, LargeCard, type Env } from './parts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const env: Env = { units: 'imperial', timeZone: 'America/Chicago', locale: 'en-US', now: Date.parse('2026-11-27T19:42:00-06:00'), address: '192.168.0.200' };
const garage: Controller = {
  id: 'g', name: 'Garage', hostname: 'garage', address: '192.168.0.110', cape: 'K8-PB', board: 'PocketBeagle 2', boardShort: 'PB2',
  version: '10.4', channels: 7794, rangeText: '82,081 to 89,874', isPlayer: false,
};
const ok = applyCheck(undefined, { ok: true, status: (statuses as Record<string, FppStatus>)['192.168.0.110'] }, env.now - 60_000, false);
const offline = applyCheck(applyCheck(ok, { ok: false }, env.now - 30_000, false), { ok: false }, env.now, false);
const view = (reading = ok): ControllerView => ({ c: garage, reading, health: healthOf(reading, env.now) });

/** Fails on React's "conflicting property" style warning, the sign of a
 *  `border` shorthand mixed with a `borderColor` override. */
function watchConflicts() {
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  return () => spy.mock.calls.map((c) => String(c[0])).filter((m) => /conflicting property/i.test(m));
}

let root: ReturnType<typeof createRoot> | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  vi.restoreAllMocks();
});

function mount(node: React.ReactNode) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  act(() => root!.render(node));
  return (next: React.ReactNode) => act(() => root!.render(next));
}

describe('cards change state without style conflicts', () => {
  it('a controller going offline and coming back', () => {
    const conflicts = watchConflicts();
    const rerender = mount(<Card v={view()} env={env} onOpen={() => {}} />);
    rerender(<Card v={view(offline)} env={env} onOpen={() => {}} />);
    rerender(<Card v={view()} env={env} onOpen={() => {}} />);
    rerender(<LargeCard v={view()} env={env} onOpen={() => {}} />);
    rerender(<LargeCard v={view(offline)} env={env} onOpen={() => {}} />);
    expect(conflicts()).toEqual([]);
  });

  it('the player card switching between not answering and connecting', () => {
    const conflicts = watchConflicts();
    const model = (reachable: boolean) => ({
      hasData: true, connecting: false, reachable, lastHeardAt: env.now - 60_000, phase: { kind: 'idle' },
      cadence: null, through: null,
    }) as unknown as ShowModel;
    const rerender = mount(<HeroMessage m={model(true)} env={env} />);
    rerender(<HeroMessage m={model(false)} env={env} />);
    rerender(<HeroMessage m={model(true)} env={env} />);
    expect(conflicts()).toEqual([]);
  });

  it('a card that has not been checked yet', () => {
    const conflicts = watchConflicts();
    const rerender = mount(<Card v={view(emptyReading())} env={env} onOpen={() => {}} />);
    rerender(<Card v={view(offline)} env={env} onOpen={() => {}} />);
    expect(conflicts()).toEqual([]);
  });
});
