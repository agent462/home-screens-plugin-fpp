import { describe, expect, it } from 'vitest';
import sample from '../../test/fixtures/ha-outlets.sample.json';
import {
  isEntityId, mainOutlets, outletGroups, parseOutlets, parseStates, readLinks, sharedWith, statesTemplate, suggestLinks,
} from './power';

const outlets = parseOutlets(sample.rows);
const ctrl = (name: string) => ({ id: name.toLowerCase().replace(/\s+/g, '-'), name });

describe('saved links', () => {
  it('keeps only controller ids that point at an entity id', () => {
    expect(readLinks({ a: 'switch.garage_plug', b: 42, c: 'not an entity', d: 'switch.x; drop' })).toEqual({ a: 'switch.garage_plug' });
    expect(readLinks(null)).toEqual({});
    expect(readLinks(['switch.a'])).toEqual({});
  });
});

describe('outlets from Home Assistant', () => {
  it('offers the sockets, not the plug settings', () => {
    const main = mainOutlets(outlets).map((o) => o.name);
    expect(main).toContain('Garage plug');
    expect(main).not.toContain('Garage plug LED');
    expect(main).not.toContain('Porch Shelly');
  });

  it('falls back to every Tapo switch when none looks like a socket', () => {
    const odd = parseOutlets(sample.rows.filter((r) => r.tapo).map((r) => ({ ...r, deviceName: 'Something else', cls: null })));
    expect(mainOutlets(odd).length).toBe(odd.length);
  });

  it('groups single plugs first, then each strip, then the rest on request', () => {
    const groups = outletGroups(outlets, false);
    expect(groups.map((g) => g.label)).toEqual(['Tapo and Kasa plugs', 'Arches strip']);
    expect(groups[1].items.map((o) => o.name)).toEqual(['Arches strip Socket 2', 'Arches strip Socket 3', 'Arches supply']);
    const all = outletGroups(outlets, true);
    expect(all[2].label).toBe('Other switches');
    expect(all[2].items.map((o) => o.name)).toContain('Porch Shelly');
  });

  it('reads anything but on and off as not answering', () => {
    expect(parseOutlets([{ id: 'switch.a', name: 'A', state: 'unavailable' }])[0].state).toBe('na');
  });
});

describe('two strips with the same name', () => {
  it('stay two groups with their own ids', () => {
    const row = (id: string, name: string, via: string) => ({ id, name, state: 'on', device: `d_${id}`, deviceName: name, via, viaName: 'Unnamed TP25', tapo: true, cls: null });
    const groups = outletGroups(parseOutlets([
      row('switch.a1', 'A1', 'strip_a'), row('switch.a2', 'A2', 'strip_a'),
      row('switch.b1', 'B1', 'strip_b'), row('switch.b2', 'B2', 'strip_b'),
    ]), false);
    expect(groups.map((g) => g.label)).toEqual(['Unnamed TP25', 'Unnamed TP25']);
    expect(new Set(groups.map((g) => g.id)).size).toBe(2);
  });
});

describe('outlet states', () => {
  it('only ever puts entity ids into the template', () => {
    const t = statesTemplate(['switch.garage_plug', "switch.x'] %}{{ evil }}", 'switch.b']);
    expect(t).toContain("['switch.garage_plug', 'switch.b']");
    expect(t).not.toContain('evil');
    expect(isEntityId('switch.garage_plug')).toBe(true);
    expect(isEntityId('Switch.Garage')).toBe(false);
  });

  it('parses states, change times and outlets that are gone', () => {
    const s = parseStates([
      { id: 'switch.a', state: 'off', name: 'A', changed: 1795830960.5 },
      { id: 'switch.b', state: null, name: null, changed: null },
    ]);
    expect(s['switch.a']).toEqual({ state: 'off', name: 'A', changedAt: 1795830960500 });
    expect(s['switch.b']).toBeNull();
  });
});

describe('suggested links', () => {
  const main = mainOutlets(outlets);

  it('matches a controller to the one outlet carrying its name', () => {
    const s = suggestLinks([ctrl('Garage'), ctrl('Player'), ctrl('House Left'), ctrl('Quad Props')], main, {});
    expect(s).toEqual({
      garage: 'switch.garage_plug', player: 'switch.show_player_plug',
      'house-left': 'switch.house_left_outlet', 'quad-props': 'switch.quad_props_plug',
    });
  });

  it('suggests nothing when the match is not the obvious one', () => {
    // "Arches Left" is not in "Arches supply"; "House" fits two outlets.
    expect(suggestLinks([ctrl('Arches Left'), ctrl('House')], main, {})).toEqual({});
  });

  it('skips controllers and outlets that are already linked', () => {
    expect(suggestLinks([ctrl('Garage')], main, { garage: 'switch.flake_plug' })).toEqual({});
    expect(suggestLinks([ctrl('Garage')], main, { other: 'switch.garage_plug' })).toEqual({});
  });

  it('drops an outlet two controllers both claim', () => {
    expect(suggestLinks([{ id: 'a', name: 'Garage' }, { id: 'b', name: 'Garage' }], main, {})).toEqual({});
  });
});

describe('one outlet feeding several controllers', () => {
  it('names the others', () => {
    const links = { 'arches-left': 'switch.arches_strip_socket_1', 'arches-right': 'switch.arches_strip_socket_1', garage: 'switch.garage_plug' };
    const all = [ctrl('Arches Left'), ctrl('Arches Right'), ctrl('Garage')];
    expect(sharedWith(links, 'arches-left', all)).toEqual(['Arches Right']);
    expect(sharedWith(links, 'garage', all)).toEqual([]);
    expect(sharedWith(links, 'nobody', all)).toEqual([]);
  });
});
