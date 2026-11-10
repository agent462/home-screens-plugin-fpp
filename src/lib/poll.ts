/** How often the wall asks each box, and how the addresses are written.
 *  Every request is a fppd-native read (no PHP on the controllers). */
import type { FppStatus } from './fpp-types';

export const SYSTEMS_EVERY_MS = 5 * 60_000;
export const SCHEDULE_EVERY_MS = 30 * 60_000;
export const PLAYLIST_EVERY_MS = 30 * 60_000;
/** The player's Remote Falcon plugin setting: it only changes when the show
 *  is set up. */
export const REQUEST_PLAYLIST_EVERY_MS = 30 * 60_000;
/** Remote Falcon's own list of waiting requests and votes, during the show
 *  only. It asks for no more than one call every 5 seconds. */
export const REQUESTS_EVERY_MS = 5_000;
/** After this long without an answer the wall stops showing what Remote
 *  Falcon last said. */
export const REQUESTS_STALE_MS = 45_000;
/** A remote check with no answer by now counts as a miss (the hub proxy may
 *  keep waiting up to 15 s, but the round moves on). */
export const REMOTE_MISS_AFTER_MS = 5_000;
/** At most this many remote checks out at once, so one dead box never
 *  stalls the round. */
export const REMOTE_IN_FLIGHT = 2;
/** A box that just missed is asked again this soon rather than a round
 *  later, so a dead box reads Offline in seconds, not a minute. */
export const RETRY_AFTER_MISS_MS = 10_000;

export interface PlayerPace {
  playing: boolean;
  paused: boolean;
  reachable: boolean;
  asleep: boolean;
}

/** Player status: every 2 s while a song plays (the bar counts on its own in
 *  between), 5 s otherwise, 30 s while it is not answering, 60 s while the
 *  wall sleeps. `playerNextMs` pulls a check forward to the moments that
 *  matter. */
export function playerEveryMs(p: PlayerPace): number {
  if (p.asleep) return 60_000;
  if (!p.reachable) return 30_000;
  if (p.playing && !p.paused) return 2_000;
  return 5_000;
}

/** How soon after a song's expected end, or a show's scheduled start, the
 *  player is asked. */
const EDGE_AFTER_MS = 300;
/** While a song is ending, ask this often until the next one shows. */
export const EDGE_EVERY_MS = 500;
/** A scheduled show that has not started yet is watched this closely for
 *  its first seconds. */
const START_WATCH_MS = 10_000;

/**
 * When to ask the player next. Usually `everyMs` from now, but a change the
 * wall can see coming is asked for right as it happens: the end of the song
 * that is playing, and the start of the next scheduled show. Those answers
 * must be fresh (`fresh`), not the hub's cached copy from before the change.
 */
export function playerNextMs(everyMs: number, status: FppStatus | null | undefined, nowMs: number): { inMs: number; fresh: boolean } {
  const name = (status?.status_name ?? '').toLowerCase();
  if (name === 'playing') {
    const left = Number(status?.seconds_remaining);
    if (Number.isFinite(left)) {
      const endIn = left * 1000 + EDGE_AFTER_MS;
      if (endIn <= everyMs) return { inMs: Math.max(EDGE_EVERY_MS, endIn), fresh: true };
    }
  } else if (status && name !== 'paused') {
    const start = (status.scheduler?.nextPlaylist?.scheduledStartTime ?? 0) * 1000;
    const until = start - nowMs;
    if (start > 0 && until > 0 && until + EDGE_AFTER_MS <= everyMs) return { inMs: until + EDGE_AFTER_MS, fresh: true };
    if (start > 0 && until <= 0 && until > -START_WATCH_MS) return { inMs: 1000, fresh: true };
  }
  return { inMs: everyMs, fresh: false };
}

/** One full round of the remotes: 30 s during the show, a minute otherwise,
 *  five while the wall sleeps. */
export function remoteRoundMs(showLive: boolean, asleep: boolean): number {
  if (asleep) return 5 * 60_000;
  return showLive ? 30_000 : 60_000;
}

/** The hub caches each answer for just under the interval, so two walls
 *  share one request to the box. */
export function cacheTtlFor(everyMs: number): number {
  return Math.max(0, everyMs - Math.min(2_000, Math.round(everyMs * 0.15)));
}

/** "192.168.0.200", "fpp.local", "http://fpp.local/" → "http://fpp.local".
 *  Empty when there is nothing usable. */
export function playerBaseUrl(address: string | undefined): string {
  let a = (address ?? '').trim();
  if (!a) return '';
  if (!/^https?:\/\//i.test(a)) a = `http://${a}`;
  try {
    const u = new URL(a);
    if (!u.hostname) return '';
    return `${u.protocol}//${u.host}`;
  } catch {
    return '';
  }
}

/** A remote's address from the multisync list as a base URL (IPv6 bracketed). */
export function hostBaseUrl(address: string): string {
  const host = address.includes(':') && !address.startsWith('[') ? `[${address}]` : address;
  return `http://${host}`;
}
