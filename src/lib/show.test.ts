import { describe, expect, it } from 'vitest';
import { arrangeControllers, controllerList, LOGO_MAX_CHARS, logoOf, logoSize, moveItem, orderAndGroups, readControllerPrefs, readShow, sectionsOf, titleOf, type ListItem } from './show';
import type { Controller } from './systems';

const box = (id: string, name: string, isPlayer = false): Controller => ({
  id, name, hostname: name.toLowerCase(), address: `192.168.0.${id.charCodeAt(0)}`, cape: '', board: '', boardShort: '',
  version: '', channels: 0, rangeText: '', isPlayer,
});
const list = [box('p', 'Player', true), box('a', 'Arches Left'), box('g', 'Garage'), box('r', 'Roof')];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('readShow', () => {
  it('reads a saved show and trims the name', () => {
    expect(readShow({ name: '  Lights on Mushtown ', logo: PNG, mainPlaylist: '2026' })).toEqual({ name: 'Lights on Mushtown', logo: PNG, mainPlaylist: '2026' });
  });
  it('is an unnamed show for anything else', () => {
    for (const raw of [undefined, null, 'x', [], { name: 5, logo: {}, mainPlaylist: null }]) {
      expect(readShow(raw)).toEqual({ name: '', logo: null, mainPlaylist: '' });
    }
    expect(titleOf(readShow(undefined))).toBe('Light Show');
    expect(titleOf(readShow({ name: 'Lights on Mushtown' }))).toBe('Lights on Mushtown');
    // A logo with the name in it stands on its own.
    expect(titleOf(readShow({ logo: PNG }))).toBe('');
    expect(titleOf(readShow({ logo: PNG, name: 'Mushtown' }))).toBe('Mushtown');
  });
});

describe('logoOf', () => {
  it('lets through only a small picture made by the settings panel', () => {
    expect(logoOf(PNG)).toBe(PNG);
    expect(logoOf('data:image/webp;base64,UklGRg==')).toBe('data:image/webp;base64,UklGRg==');
    expect(logoOf('https://example.com/logo.png')).toBeNull();
    expect(logoOf('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
    expect(logoOf('data:image/png;base64,AAAA" onerror="x')).toBeNull();
    expect(logoOf(`data:image/png;base64,${'A'.repeat(LOGO_MAX_CHARS)}`)).toBeNull();
    expect(logoOf(undefined)).toBeNull();
  });
});

describe('logoSize', () => {
  it('fits the height, never bigger than the picture', () => {
    expect(logoSize(800, 400, 176)).toEqual({ w: 352, h: 176 });
    expect(logoSize(100, 50, 176)).toEqual({ w: 100, h: 50 });
  });
  it('keeps a very wide picture within the room the header has', () => {
    expect(logoSize(2000, 200, 176)).toEqual({ w: 528, h: 53 });
  });
  it('is nothing for a picture with no size', () => {
    expect(logoSize(0, 0, 176)).toEqual({ w: 0, h: 0 });
  });
});

describe('controller names and order', () => {
  it('reads what was saved, dropping empty names and repeats', () => {
    expect(readControllerPrefs({ names: { a: ' Left arches ', g: '', r: 4 }, order: ['r', 'a', 'r', 7] })).toEqual({ names: { a: 'Left arches' }, order: ['r', 'a'], groups: [] });
    expect(readControllerPrefs(undefined)).toEqual({ names: {}, order: [], groups: [] });
  });

  it('renames, and sorts by the new name when nobody set an order', () => {
    const out = arrangeControllers(list, { names: { r: 'Above the garage' }, order: [], groups: [] });
    expect(out.map((c) => c.name)).toEqual(['Player', 'Above the garage', 'Arches Left', 'Garage']);
    expect(list[3].name).toBe('Roof'); // the player's own list is left alone
  });

  it('puts placed controllers first in their order, then the rest the usual way', () => {
    const out = arrangeControllers(list, { names: {}, order: ['r', 'gone', 'g'], groups: [] });
    expect(out.map((c) => c.id)).toEqual(['r', 'g', 'p', 'a']);
  });
});

describe('controller groups', () => {
  const prefs = { names: { g: 'Garage door' }, order: ['a', 'p'], groups: [{ name: 'House', ids: ['r', 'away', 'g'] }, { name: 'Empty', ids: [] }] };
  const names = (items: ListItem[]) => items.map((it) => (it.kind === 'group' ? `[${it.name}]` : it.c.name));

  it('reads groups, keeping a controller in the first group that lists it', () => {
    expect(readControllerPrefs({ groups: [{ name: ' House ', ids: ['r', 'g', 'r'] }, { name: 'Yard', ids: ['g', 'a', 5] }, 'x', { ids: ['p'] }] }).groups)
      .toEqual([{ name: 'House', ids: ['r', 'g'] }, { name: 'Yard', ids: ['a'] }, { name: '', ids: ['p'] }]);
  });

  it('draws the controllers in no group first, then each group that has any', () => {
    expect(sectionsOf(list, prefs).map((s) => [s.name, s.items.map((c) => c.name)])).toEqual([[null, ['Arches Left', 'Player']], ['House', ['Roof', 'Garage door']]]);
    expect(arrangeControllers(list, prefs).map((c) => c.id)).toEqual(['a', 'p', 'r', 'g']);
  });

  it('calls a group nobody named "Group" on the wall', () => {
    expect(sectionsOf(list, { names: {}, order: [], groups: [{ name: '', ids: ['r'] }] })[1].name).toBe('Group');
  });

  it('lists the settings lines top to bottom, keeping an empty group and what is away', () => {
    const items = controllerList(list, prefs);
    expect(names(items)).toEqual(['Arches Left', 'Player', '[House]', 'Roof', 'Garage door', '[Empty]']);
    expect(items[2]).toMatchObject({ kind: 'group', away: ['away'] });
  });

  it('gives back what it was given when nothing moved', () => {
    expect(orderAndGroups(controllerList(list, prefs))).toEqual({ order: ['a', 'p', 'r', 'g'], groups: [{ name: 'House', ids: ['r', 'g', 'away'] }, { name: 'Empty', ids: [] }] });
  });

  it('moves a controller into the group whose line it crosses, and out again', () => {
    const items = controllerList(list, prefs);
    const down = moveItem(items, 1, 1); // Player goes under the House line
    expect(names(down)).toEqual(['Arches Left', '[House]', 'Player', 'Roof', 'Garage door', '[Empty]']);
    expect(orderAndGroups(down).groups[0]).toEqual({ name: 'House', ids: ['p', 'r', 'g', 'away'] });
    const up = moveItem(items, 3, -1); // Roof goes above the House line
    expect(orderAndGroups(up)).toMatchObject({ order: ['a', 'p', 'r', 'g'], groups: [{ name: 'House', ids: ['g', 'away'] }, { name: 'Empty', ids: [] }] });
  });

  it("moves a group's line to take a controller in or let one go", () => {
    const items = controllerList(list, prefs);
    expect(orderAndGroups(moveItem(items, 2, -1)).groups[0].ids).toEqual(['p', 'r', 'g', 'away']);
    expect(orderAndGroups(moveItem(items, 5, -1)).groups).toEqual([{ name: 'House', ids: ['r', 'away'] }, { name: 'Empty', ids: ['g'] }]);
  });

  it('keeps the controllers when a group is taken away: they join the one above, or none', () => {
    const items = controllerList(list, prefs);
    expect(orderAndGroups(items.filter((_, i) => i !== 2))).toEqual({ order: ['a', 'p', 'r', 'g'], groups: [{ name: 'Empty', ids: [] }] });
  });

  it('stops at the ends of the list', () => {
    const items = controllerList(list, prefs);
    expect(names(moveItem(items, 0, -1))).toEqual(names(items));
    expect(names(moveItem(items, 5, 1))).toEqual(names(items));
  });
});
