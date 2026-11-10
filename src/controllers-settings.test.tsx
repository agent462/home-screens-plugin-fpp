// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, byLabel, click, fakeSdk, mount, pick, typeInto, unmountAll } from '../test/dom';
import { ControllersSettings } from './controllers-settings';
import { readControllerPrefs, type ControllerPrefs, type GroupStyle } from './lib/show';
import type { Controller } from './lib/systems';

const box = (id: string, name: string, isPlayer = false): Controller => ({
  id, name, hostname: name.toLowerCase(), address: `192.168.0.${id.charCodeAt(0)}`, cape: '', board: '', boardShort: '',
  version: '', channels: 0, rangeText: '', isPlayer,
});
const boxes = [box('p', 'Player', true), box('a', 'Arches Left'), box('g', 'Garage'), box('r', 'Roof')];

/** The panel with its parent, which holds the names, order and hidden list. */
function Harness({ onHidden, onGroupStyle }: { onHidden: (ids: string[]) => void; onGroupStyle?: (style: GroupStyle) => void }) {
  const [prefs, setPrefs] = React.useState<ControllerPrefs>(() => readControllerPrefs(window.__HS_SDK__?.getPluginSettings?.('fpp').controllers));
  const [hidden, setHidden] = React.useState<string[]>([]);
  const [style, setStyle] = React.useState<GroupStyle>('headings');
  return (
    <ControllersSettings
      controllers={boxes} hidden={hidden} onHidden={(ids) => { setHidden(ids); onHidden(ids); }} prefs={prefs} onPrefs={setPrefs}
      groupStyle={style} onGroupStyle={(next) => { setStyle(next); onGroupStyle?.(next); }}
    />
  );
}

const rows = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Name for"]')].map((i) => i.value || i.placeholder);
/** Every line of the list, top to bottom, with group lines in brackets. */
const lines = (el: HTMLElement) => [...el.querySelectorAll<HTMLInputElement>('input[aria-label^="Name"]')]
  .map((i) => (i.getAttribute('aria-label')!.startsWith('Name of') ? `[${i.value}]` : i.value || i.placeholder));
const HOUSE = { controllers: { names: {}, order: [], groups: [{ name: 'House', ids: ['g', 'r'] }] } };
const failed = (el: HTMLElement) => el.textContent?.includes("That wasn't saved") ?? false;

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

describe('the Controllers settings', () => {
  it('lists the controllers the usual way, with their own names as hints', async () => {
    fakeSdk();
    const el = await mount(<Harness onHidden={() => {}} />);
    expect(rows(el)).toEqual(['Player', 'Arches Left', 'Garage', 'Roof']);
    expect(byLabel(el, 'Name for Garage').value).toBe('');
  });

  it('saves a new name when the field is left, and clears it again', async () => {
    const hub = fakeSdk();
    const el = await mount(<Harness onHidden={() => {}} />);
    await typeInto(byLabel(el, 'Name for Garage'), '  Garage door  ');
    expect(hub.state.settings.controllers).toEqual({ names: { g: 'Garage door' }, order: [], groups: [] });
    expect(byLabel(el, 'Name for Garage').value).toBe('Garage door');

    await typeInto(byLabel(el, 'Name for Garage'), '');
    expect(hub.state.settings.controllers).toEqual({ names: {}, order: [], groups: [] });
    expect(byLabel(el, 'Name for Garage').placeholder).toBe('Garage');
  });

  it('does not save when nothing changed, or when a controller is given its own name back', async () => {
    const hub = fakeSdk();
    const el = await mount(<Harness onHidden={() => {}} />);
    await typeInto(byLabel(el, 'Name for Garage'), '');
    await typeInto(byLabel(el, 'Name for Garage'), 'Garage');
    expect(hub.setPluginSettings).not.toHaveBeenCalled();
  });

  it('saves the whole order when one is moved, and goes back to the usual order', async () => {
    const hub = fakeSdk();
    const el = await mount(<Harness onHidden={() => {}} />);
    await click(byLabel(el, 'Move Roof up'));
    expect(hub.state.settings.controllers).toEqual({ names: {}, order: ['p', 'a', 'r', 'g'], groups: [] });
    expect(rows(el)).toEqual(['Player', 'Arches Left', 'Roof', 'Garage']);

    await click(button(el, 'Back to the usual order'));
    expect(hub.state.settings.controllers).toEqual({ names: {}, order: [], groups: [] });
    expect(rows(el)).toEqual(['Player', 'Arches Left', 'Garage', 'Roof']);
  });

  it('stops the arrows at the ends of the list', async () => {
    fakeSdk();
    const el = await mount(<Harness onHidden={() => {}} />);
    expect(byLabel<HTMLButtonElement>(el, 'Move Player up').disabled).toBe(true);
    expect(byLabel<HTMLButtonElement>(el, 'Move Roof down').disabled).toBe(true);
    expect(byLabel<HTMLButtonElement>(el, 'Move Roof up').disabled).toBe(false);
  });

  it('puts things back and says so when a save fails', async () => {
    const hub = fakeSdk({ controllers: { names: { g: 'Garage door' }, order: [] } });
    hub.state.failSaves = true;
    const el = await mount(<Harness onHidden={() => {}} />);
    await click(byLabel(el, 'Move Roof up'));
    expect(rows(el)).toEqual(['Player', 'Arches Left', 'Garage door', 'Roof']);
    expect(failed(el)).toBe(true);

    await typeInto(byLabel(el, 'Name for Roof'), 'Chimney');
    expect(byLabel(el, 'Name for Roof').value).toBe('');
    expect(failed(el)).toBe(true);

    // The next save that works clears the message.
    hub.state.failSaves = false;
    await typeInto(byLabel(el, 'Name for Roof'), 'Chimney');
    expect(byLabel(el, 'Name for Roof').value).toBe('Chimney');
    expect(failed(el)).toBe(false);
  });

  it('leaves a controller out of this module without touching the shared settings', async () => {
    const hub = fakeSdk();
    const onHidden = vi.fn();
    const el = await mount(<Harness onHidden={onHidden} />);
    await click(byLabel(el, 'Show Garage'));
    expect(onHidden).toHaveBeenLastCalledWith(['g']);
    await click(byLabel(el, 'Show Garage'));
    expect(onHidden).toHaveBeenLastCalledWith([]);
    expect(hub.setPluginSettings).not.toHaveBeenCalled();
  });

  describe('groups', () => {
    it('adds a group as a new line at the bottom, ready to be named', async () => {
      const hub = fakeSdk();
      const el = await mount(<Harness onHidden={() => {}} />);
      expect(el.querySelector('select')).toBeNull(); // nothing to choose until there is a group
      await click(button(el, 'Add a group'));
      expect(lines(el)).toEqual(['Player', 'Arches Left', 'Garage', 'Roof', '[]']);
      expect(document.activeElement).toBe(byLabel(el, 'Name of the new group'));
      expect(el.textContent).toContain('A new group starts at the bottom, empty');
      expect(hub.state.settings.controllers).toEqual({ names: {}, order: ['p', 'a', 'g', 'r'], groups: [{ name: '', ids: [] }] });

      await typeInto(byLabel(el, 'Name of the new group'), ' House ');
      expect(hub.state.settings.controllers).toMatchObject({ groups: [{ name: 'House', ids: [] }] });
      expect(byLabel(el, 'Name of the House group').value).toBe('House');
    });

    it("takes a controller in when the group's line moves up past it", async () => {
      const hub = fakeSdk({ controllers: { names: {}, order: [], groups: [{ name: 'House', ids: [] }] } });
      const el = await mount(<Harness onHidden={() => {}} />);
      await click(byLabel(el, 'Move the House group up'));
      await click(byLabel(el, 'Move the House group up'));
      expect(lines(el)).toEqual(['Player', 'Arches Left', '[House]', 'Garage', 'Roof']);
      expect(hub.state.settings.controllers).toEqual({ names: {}, order: ['p', 'a', 'g', 'r'], groups: [{ name: 'House', ids: ['g', 'r'] }] });
      expect(el.textContent).not.toContain('A new group starts at the bottom, empty');
    });

    it('moves a controller into and out of a group with its own arrows', async () => {
      const hub = fakeSdk(HOUSE);
      const el = await mount(<Harness onHidden={() => {}} />);
      expect(lines(el)).toEqual(['Player', 'Arches Left', '[House]', 'Garage', 'Roof']);
      await click(byLabel(el, 'Move Arches Left down'));
      expect(lines(el)).toEqual(['Player', '[House]', 'Arches Left', 'Garage', 'Roof']);
      expect(hub.state.settings.controllers).toMatchObject({ groups: [{ name: 'House', ids: ['a', 'g', 'r'] }] });
      await click(byLabel(el, 'Move Arches Left up'));
      expect(hub.state.settings.controllers).toMatchObject({ groups: [{ name: 'House', ids: ['g', 'r'] }] });
    });

    it('renames a group', async () => {
      const hub = fakeSdk(HOUSE);
      const el = await mount(<Harness onHidden={() => {}} />);
      await typeInto(byLabel(el, 'Name of the House group'), 'Home');
      expect(hub.state.settings.controllers).toMatchObject({ groups: [{ name: 'Home', ids: ['g', 'r'] }] });
      expect(lines(el)).toEqual(['Player', 'Arches Left', '[Home]', 'Garage', 'Roof']);
    });

    it('takes a group away and keeps its controllers', async () => {
      const hub = fakeSdk(HOUSE);
      const el = await mount(<Harness onHidden={() => {}} />);
      await click(byLabel(el, 'Take the House group away'));
      expect(lines(el)).toEqual(['Player', 'Arches Left', 'Garage', 'Roof']);
      expect(hub.state.settings.controllers).toEqual({ names: {}, order: ['p', 'a', 'g', 'r'], groups: [] });
    });

    it('keeps a controller the player is not listing right now in its group', async () => {
      const hub = fakeSdk({ controllers: { names: {}, order: [], groups: [{ name: 'House', ids: ['away', 'g'] }] } });
      const el = await mount(<Harness onHidden={() => {}} />);
      await click(byLabel(el, 'Move Roof down'));
      await click(byLabel(el, 'Move Roof down'));
      expect(hub.state.settings.controllers).toMatchObject({ groups: [{ name: 'House', ids: ['g', 'r', 'away'] }] });
    });

    it('offers how this module shows the groups once there is one', async () => {
      const hub = fakeSdk(HOUSE);
      const onGroupStyle = vi.fn();
      const el = await mount(<Harness onHidden={() => {}} onGroupStyle={onGroupStyle} />);
      const list = el.querySelector('select')!;
      expect([...list.options].map((o) => o.value)).toEqual(['headings', 'tags', 'off']);
      expect(list.value).toBe('headings');
      await pick(list, 'tags');
      expect(onGroupStyle).toHaveBeenCalledWith('tags');
      // That choice is this module's own, not the shared settings'.
      expect(hub.setPluginSettings).not.toHaveBeenCalled();
    });

    it('puts a group back when its save fails', async () => {
      const hub = fakeSdk(HOUSE);
      hub.state.failSaves = true;
      const el = await mount(<Harness onHidden={() => {}} />);
      await click(byLabel(el, 'Take the House group away'));
      expect(lines(el)).toEqual(['Player', 'Arches Left', '[House]', 'Garage', 'Roof']);
      expect(failed(el)).toBe(true);
    });
  });
});
