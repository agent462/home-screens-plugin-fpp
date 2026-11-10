import type { FppSystem } from './fpp-types';

/** One controller card's fixed facts, from the player's multisync list. */
export interface Controller {
  /** Stable key: FPP's uuid, or the hostname when a box has none. */
  id: string;
  name: string;
  hostname: string;
  address: string;
  /** Cape name, or the board when there is no cape. */
  cape: string;
  /** "PocketBeagle 2", "BeagleBone Black", "Raspberry Pi 4". */
  board: string;
  /** "PB2", "BBB", "Pi 4", for tight rows. */
  boardShort: string;
  version: string;
  channels: number;
  /** "1 to 8", 1-based like FPP's channel numbers. */
  rangeText: string;
  isPlayer: boolean;
}

/** FPP platforms are type ids 1 to 0x7F; 0x80 and up are Falcon, ESPixelStick,
 *  WLED and others, which do not answer `/api/fppd/status`. */
export function isFppType(typeId: number | undefined): boolean {
  return typeof typeId === 'number' && typeId > 0 && typeId < 0x80;
}

const isIPv6 = (address: string) => address.includes(':');

export function titleCaseHost(hostname: string): string {
  return hostname
    .split(/[-_\s.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function boardName(type: string | undefined): string {
  const t = (type ?? '').trim();
  if (/^PocketBeagle2$/i.test(t)) return 'PocketBeagle 2';
  return t;
}

export function boardShort(board: string): string {
  if (/^PocketBeagle 2/i.test(board)) return 'PB2';
  if (/^PocketBeagle/i.test(board)) return 'PB';
  if (/^BeagleBone Black/i.test(board)) return 'BBB';
  if (/^BeagleBone Green/i.test(board)) return 'BBG';
  return board.replace(/^Raspberry Pi\s*/i, 'Pi ').trim();
}

function ranges(text: string | undefined): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const part of (text ?? '').split(',')) {
    const m = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(part);
    if (m) out.push([Number(m[1]), Number(m[2])]);
  }
  return out;
}

export function channelCount(text: string | undefined): number {
  return ranges(text).reduce((sum, [a, b]) => sum + Math.max(0, b - a + 1), 0);
}

export function channelRangeText(text: string | undefined, formatNumber: (n: number) => string = (n) => n.toLocaleString('en-US')): string {
  return ranges(text).map(([a, b]) => `${formatNumber(a + 1)} to ${formatNumber(b + 1)}`).join(', ');
}

/**
 * The player's multisync list as controller cards.
 *
 * FPP lists every box once per address, so each one appears again under its
 * IPv6 link-local address; rows are merged by uuid and the IPv4 row wins.
 * Non-FPP systems are left out (nothing to ask them). The player (`local: 1`)
 * comes first, then everything else by name, so a box keeps its spot.
 */
export function controllersFrom(
  systems: FppSystem[] | undefined,
  hidden: readonly string[] = [],
  formatNumber?: (n: number) => string,
): Controller[] {
  const byId = new Map<string, FppSystem>();
  for (const s of systems ?? []) {
    if (!s || !s.address || !isFppType(s.typeId)) continue;
    const id = s.uuid || s.hostname || s.address;
    const seen = byId.get(id);
    if (!seen || (isIPv6(seen.address ?? '') && !isIPv6(s.address))) byId.set(id, s);
  }
  const hiddenSet = new Set(hidden);
  const list: Controller[] = [];
  for (const [id, s] of byId) {
    if (hiddenSet.has(id)) continue;
    const board = boardName(s.type);
    const hostname = s.hostname ?? s.address ?? '';
    list.push({
      id,
      name: (s.HostDescription ?? '').trim() || titleCaseHost(hostname) || (s.address ?? ''),
      hostname,
      address: s.address ?? '',
      cape: (s.capeInfo?.name ?? '').trim() || board,
      board,
      boardShort: boardShort(board),
      version: s.version ?? '',
      channels: channelCount(s.channelRanges),
      rangeText: channelRangeText(s.channelRanges, formatNumber),
      isPlayer: s.local === 1 || s.fppModeString === 'player',
    });
  }
  return list.sort(byPlayerThenName);
}

/** The player first, then everything else by name. */
export const byPlayerThenName = (a: Controller, b: Controller): number =>
  (a.isPlayer !== b.isPlayer
    ? a.isPlayer ? -1 : 1
    : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
