/** How often the wall asks each box, and how the addresses are written.
 *  Every request is a fppd-native read (no PHP on the controllers). */

export const SYSTEMS_EVERY_MS = 5 * 60_000;
export const SCHEDULE_EVERY_MS = 30 * 60_000;
export const PLAYLIST_EVERY_MS = 30 * 60_000;
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
 *  between), 15 s otherwise, 30 s while it is not answering, 60 s while the
 *  wall sleeps. */
export function playerEveryMs(p: PlayerPace): number {
  if (p.asleep) return 60_000;
  if (!p.reachable) return 30_000;
  if (p.playing && !p.paused) return 2_000;
  if (p.paused) return 5_000;
  return 15_000;
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
