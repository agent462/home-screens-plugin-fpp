import { describe, expect, it } from 'vitest';
import { arrangeControllers, LOGO_MAX_CHARS, logoOf, logoSize, moveController, readControllerPrefs, readShow, titleOf } from './show';
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
    expect(readControllerPrefs({ names: { a: ' Left arches ', g: '', r: 4 }, order: ['r', 'a', 'r', 7] })).toEqual({ names: { a: 'Left arches' }, order: ['r', 'a'] });
    expect(readControllerPrefs(undefined)).toEqual({ names: {}, order: [] });
  });

  it('renames, and sorts by the new name when nobody set an order', () => {
    const out = arrangeControllers(list, { names: { r: 'Above the garage' }, order: [] });
    expect(out.map((c) => c.name)).toEqual(['Player', 'Above the garage', 'Arches Left', 'Garage']);
    expect(list[3].name).toBe('Roof'); // the player's own list is left alone
  });

  it('puts placed controllers first in their order, then the rest the usual way', () => {
    const out = arrangeControllers(list, { names: {}, order: ['r', 'gone', 'g'] });
    expect(out.map((c) => c.id)).toEqual(['r', 'g', 'p', 'a']);
  });

  it('moves one up or down the list as shown, and stops at the ends', () => {
    expect(moveController(list, 'g', -1)).toEqual(['p', 'g', 'a', 'r']);
    expect(moveController(list, 'g', 1)).toEqual(['p', 'a', 'r', 'g']);
    expect(moveController(list, 'p', -1)).toEqual(['p', 'a', 'g', 'r']);
    expect(moveController(list, 'r', 1)).toEqual(['p', 'a', 'g', 'r']);
  });
});
