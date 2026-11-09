import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/multiSyncSystems.json';
import { boardShort, channelCount, channelRangeText, controllersFrom, isFppType, titleCaseHost } from './systems';
import type { FppSystem } from './fpp-types';

const systems = fixture.systems as FppSystem[];

describe('controllersFrom (the real show: 38 rows, 19 boxes)', () => {
  const list = controllersFrom(systems);

  it('merges each box listed again under its IPv6 link-local address', () => {
    expect(systems).toHaveLength(38);
    expect(list).toHaveLength(19);
    expect(list.every((c) => !c.address.includes(':'))).toBe(true);
  });

  it('puts the player first, then the remotes by name', () => {
    expect(list[0]).toMatchObject({ name: 'Player', isPlayer: true, address: '192.168.0.200' });
    const rest = list.slice(1).map((c) => c.name);
    expect(rest).toEqual([...rest].sort((a, b) => a.localeCompare(b)));
    expect(rest).toContain('Right Singing Faces');
    expect(list.filter((c) => c.isPlayer)).toHaveLength(1);
  });

  it('reads cape, board and channels', () => {
    const arches = list.find((c) => c.hostname === 'arches-left')!;
    expect(arches).toMatchObject({ cape: 'K8-PB', board: 'PocketBeagle 2', boardShort: 'PB2', channels: 354056 - 341292 + 1 });
    expect(arches.rangeText).toBe('341,293 to 354,057');
    const mega = list.find((c) => c.hostname === 'mega')!;
    expect(mega).toMatchObject({ cape: 'K16A-B', board: 'BeagleBone Black', boardShort: 'BBB' });
  });

  it('keeps the IPv4 row even when the IPv6 row comes first', () => {
    const v4 = systems.find((s) => s.hostname === 'garage' && !s.address!.includes(':'))!;
    const v6 = systems.find((s) => s.hostname === 'garage' && s.address!.includes(':'))!;
    expect(controllersFrom([v6, v4])[0].address).toBe(v4.address);
  });

  it('leaves out hidden boxes and anything that is not FPP', () => {
    const garage = list.find((c) => c.hostname === 'garage')!;
    expect(controllersFrom(systems, [garage.id]).map((c) => c.id)).not.toContain(garage.id);
    const falcon: FppSystem = { address: '192.168.0.50', hostname: 'f16', typeId: 0x88, uuid: 'F' };
    expect(controllersFrom([...systems, falcon])).toHaveLength(19);
  });

  it('prefers the host description FPP was given', () => {
    const s: FppSystem = { address: '10.0.0.2', hostname: 'k8-merry', HostDescription: ' Merry Sign ', typeId: 0x41, uuid: 'x' };
    expect(controllersFrom([s])[0].name).toBe('Merry Sign');
  });
});

describe('small rules', () => {
  it('names hosts and boards', () => {
    expect(titleCaseHost('k8-showstopper')).toBe('K8 Showstopper');
    expect(titleCaseHost('right-singing-faces')).toBe('Right Singing Faces');
    expect(boardShort('Raspberry Pi 4')).toBe('Pi 4');
    expect(boardShort('PocketBeagle')).toBe('PB');
  });

  it('counts channel ranges, including split ones', () => {
    expect(channelCount('0-7')).toBe(8);
    expect(channelCount('0-7,100-199')).toBe(108);
    expect(channelCount('')).toBe(0);
    expect(channelRangeText('0-7')).toBe('1 to 8');
  });

  it('knows which type ids are FPP', () => {
    expect(isFppType(0x47)).toBe(true);
    expect(isFppType(13)).toBe(true);
    expect(isFppType(0x80)).toBe(false);
    expect(isFppType(0)).toBe(false);
    expect(isFppType(undefined)).toBe(false);
  });
});
