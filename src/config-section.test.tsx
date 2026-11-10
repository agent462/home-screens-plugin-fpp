// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import systems from '../test/fixtures/multiSyncSystems.json';
import statuses from '../test/fixtures/statuses.json';
import rfShow from '../test/fixtures/rf-show.json';
import haOutlets from '../test/fixtures/ha-outlets.sample.json';
import { button, byLabel, click, fakeSdk, mount, pick, settle, typeInto, unmountAll } from '../test/dom';
import { ConfigSection } from './config-section';

const ST = statuses as Record<string, unknown>;

/** The show player and Remote Falcon, as the hub's proxy would reach them. */
function answer(url: string): unknown {
  const u = new URL(url);
  if (u.hostname === 'remotefalcon.com') return rfShow;
  if (u.hostname === 'homeassistant.local') return haOutlets.rows;
  if (u.hostname !== '192.168.0.200') throw new Error('unreachable');
  if (u.pathname === '/api/fppd/status') return ST['192.168.0.200'];
  if (u.pathname === '/api/fppd/multiSyncSystems') return systems;
  if (u.pathname === '/api/playlists') return ['Pre-show', '2026', 7, ''];
  throw new Error('not found');
}

/** The section with the module's own settings held the way the editor does. */
function Editor({ start, onChange }: { start: Record<string, unknown>; onChange?: (u: Record<string, unknown>) => void }) {
  const [config, setConfig] = React.useState(start);
  return <ConfigSection config={config} onChange={(u) => { onChange?.(u); setConfig((c) => ({ ...c, ...u })); }} moduleId="m" screenId="s" />;
}

const says = (el: HTMLElement, text: string) => el.textContent?.includes(text) ?? false;
const listWith = (el: HTMLElement, option: string) =>
  [...el.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === option)) ?? null;
const PLAYER = { playerAddress: '192.168.0.200' };

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the module settings', () => {
  it('finds the player, its controllers and its playlists', async () => {
    fakeSdk({}, answer);
    const el = await mount(<Editor start={PLAYER} />);
    expect(says(el, 'Found it: FPP')).toBe(true);
    expect(says(el, '19 controllers')).toBe(true);
    expect(el.querySelectorAll('input[aria-label^="Name for"]')).toHaveLength(19);
    // The playlists are offered in order, without anything that is not a name.
    expect([...listWith(el, '2026')!.options].map((o) => o.value)).toEqual(['', '2026', 'Pre-show']);
  });

  it('keeps the show settings and hides the controller lists when the player cannot be reached', async () => {
    fakeSdk({}, () => { throw new Error('offline'); });
    const el = await mount(<Editor start={PLAYER} />);
    expect(says(el, "Couldn't reach it")).toBe(true);
    expect(says(el, 'Your show')).toBe(true);
    expect(el.querySelectorAll('input[aria-label^="Name for"]')).toHaveLength(0);
    expect(listWith(el, '2026')).toBeNull();
  });

  it('shows a controller under its new name in the Power list too', async () => {
    fakeSdk({}, answer, { 'home-assistant': { haUrl: 'http://homeassistant.local:8123' } });
    const el = await mount(<Editor start={PLAYER} />);
    await settle();
    expect(byLabel(el, 'Outlet for Garage')).toBeTruthy();
    await typeInto(byLabel(el, 'Name for Garage'), 'Garage door');
    expect(byLabel(el, 'Outlet for Garage door')).toBeTruthy();
    expect(el.querySelector('[aria-label="Outlet for Garage"]')).toBeNull();
  });

  it('offers a field for your own words only when that is what goes under the name', async () => {
    fakeSdk({}, answer);
    const changes: Array<Record<string, unknown>> = [];
    const el = await mount(<Editor start={PLAYER} onChange={(u) => changes.push(u)} />);
    expect(el.querySelector('[aria-label="Your own words"]')).toBeNull();

    await pick(listWith(el, 'words')!, 'words');
    expect(changes).toContainEqual({ subtitle: 'words' });
    await typeInto(byLabel(el, 'Your own words'), ' Tune to 88.5 FM ');
    expect(changes).toContainEqual({ tagline: 'Tune to 88.5 FM' });

    await pick(listWith(el, 'words')!, 'hours');
    expect(el.querySelector('[aria-label="Your own words"]')).toBeNull();
  });

  describe('with Remote Falcon', () => {
    it('offers Song names from and plain cover lookups while it is not connected', async () => {
      fakeSdk({}, answer);
      const el = await mount(<Editor start={PLAYER} />);
      expect(listWith(el, 'sequence')).not.toBeNull();
      expect(says(el, 'Look up album covers')).toBe(true);
      expect(says(el, 'Look up missing covers')).toBe(false);
    });

    it('steps Song names from aside while it is connected, and brings it back on Disconnect', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
      const hub = fakeSdk({ remoteFalcon: true }, answer);
      const el = await mount(<Editor start={PLAYER} />);
      expect(listWith(el, 'sequence')).toBeNull();
      expect(says(el, 'Names and covers come from Remote Falcon')).toBe(true);
      expect(says(el, 'Look up missing covers')).toBe(true);

      await click(button(el, 'Disconnect'));
      expect(hub.state.settings.remoteFalcon).toBe(false);
      expect(listWith(el, 'sequence')).not.toBeNull();
      expect(says(el, 'Look up album covers')).toBe(true);
    });

    it('steps Song names from aside as soon as it is connected', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":true}', { status: 200 })));
      const hub = fakeSdk({}, answer);
      const el = await mount(<Editor start={PLAYER} />);
      const fields = [...el.querySelectorAll<HTMLInputElement>('input[placeholder^="Paste the"]')];
      await typeInto(fields[0], 'token');
      await typeInto(fields[1], 'secret');
      await click(button(el, 'Connect'));
      expect(hub.state.settings.remoteFalcon).toBe(true);
      expect(listWith(el, 'sequence')).toBeNull();
      expect(says(el, 'Look up missing covers')).toBe(true);
    });
  });
});
