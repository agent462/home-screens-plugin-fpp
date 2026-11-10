import type { FppSchedule, FppScheduleEntry, FppStatus } from './fpp-types';
import { calendarDaysBetween, clockText, spanText, windowText } from './format';

export type ShowPhase =
  /** A playlist is running (scheduled or started by hand). */
  | { kind: 'playing'; paused: boolean; endsAt: number | null; playlist: string }
  /** Tonight's show ran and ended; the next one is on a later day. */
  | { kind: 'done'; nextAt: number | null; playlist: string }
  /** Nothing playing, a show is scheduled. */
  | { kind: 'waiting'; nextAt: number; playlist: string }
  /** Nothing playing and nothing scheduled. */
  | { kind: 'idle' };

const PLAYING = new Set(['playing', 'paused', 'stopping gracefully', 'stopping gracefully after loop']);

/** The player is running something (a show, or anything else). */
export const isRunning = (status: FppStatus | null | undefined) => PLAYING.has((status?.status_name ?? '').toLowerCase());

interface ZoneParts {
  /** YYYYMMDD as a number, comparable with FPP's `*DateInt`. */
  dateInt: number;
  /** 0 = Sunday. */
  dow: number;
  dayOfMonth: number;
  minute: number;
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function zoneParts(ms: number, timeZone: string): ZoneParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(ms);
  } catch {
    parts = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(ms);
  }
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  return {
    dateInt: Number(`${get('year')}${get('month')}${get('day')}`),
    dow: DOW.indexOf(get('weekday')),
    dayOfMonth: Number(get('day')),
    minute: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

/** Does an FPP schedule `day` code include this day? (ScheduleEntry.h) */
export function dayMatches(day: number | undefined, dow: number, dayOfMonth: number): boolean {
  if (typeof day !== 'number') return false;
  if (day & 0x10000) return (day & (0x4000 >> dow)) !== 0;
  switch (day) {
    case 7: return true;
    case 8: return dow >= 1 && dow <= 5;
    case 9: return dow === 0 || dow === 6;
    case 10: return dow === 1 || dow === 3 || dow === 5;
    case 11: return dow === 2 || dow === 4;
    case 12: return dow <= 4;
    case 13: return dow === 5 || dow === 6;
    case 14: return dayOfMonth % 2 === 1;
    case 15: return dayOfMonth % 2 === 0;
    default: return day >= 0 && day <= 6 && day === dow;
  }
}

const hm = (t: string | undefined): number | null => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const dateInt = (iso: string | undefined): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  return m ? Number(`${m[1]}${m[2]}${m[3]}`) : null;
};

/** The playlist a family picked as their show, for a player that runs others
 *  too (a pre-show, a test list). */
export interface MainShow {
  name: string;
  /** The playlist Remote Falcon slots requests in from, '' when unknown. */
  requestPlaylist: string;
}

/** Is the player on the main show? A request slotted into it still counts. */
export function onMainShow(status: FppStatus | null | undefined, main: MainShow): boolean {
  const current = status?.current_playlist?.playlist ?? '';
  if (!current) return false;
  if (current === main.name) return true;
  const scheduled = status?.scheduler?.currentPlaylist?.playlistName ?? '';
  return current === main.requestPlaylist && (!scheduled || scheduled === main.name);
}

const playlistEntries = (schedule: FppSchedule | null | undefined, only = '') =>
  (schedule?.entries ?? []).filter((e) => e.enabled !== 0 && !!e.playlist && (e.type ?? 'playlist') === 'playlist' && (!only || e.playlist === only));

function inRange(e: FppScheduleEntry, d: number): boolean {
  const a = dateInt(e.startDate);
  const b = dateInt(e.endDate);
  return (a === null || d >= a) && (b === null || d <= b);
}

/** A playlist window that ended earlier today (or, for one that runs past
 *  midnight, one that started yesterday and ended this morning). */
export function showEndedToday(schedule: FppSchedule | null | undefined, nowMs: number, timeZone: string, only = ''): FppScheduleEntry | null {
  const now = zoneParts(nowMs, timeZone);
  const yesterday = zoneParts(nowMs - 86400000, timeZone);
  for (const e of playlistEntries(schedule, only)) {
    const start = hm(e.startTime);
    const end = hm(e.endTime);
    if (start === null || end === null) continue; // sunset-relative times: the windows say it
    if (end > start) {
      if (dayMatches(e.day, now.dow, now.dayOfMonth) && inRange(e, now.dateInt) && now.minute >= end) return e;
    } else if (now.minute >= end && now.minute < start
      && dayMatches(e.day, yesterday.dow, yesterday.dayOfMonth) && inRange(e, yesterday.dateInt)) {
      return e;
    }
  }
  return null;
}

function nextWindow(status: FppStatus | null | undefined, schedule: FppSchedule | null | undefined, nowMs: number, only = ''): { at: number; playlist: string } | null {
  const np = status?.scheduler?.nextPlaylist;
  if (np?.scheduledStartTime && np.scheduledStartTime * 1000 > nowMs && (!only || np.playlistName === only)) {
    return { at: np.scheduledStartTime * 1000, playlist: np.playlistName ?? '' };
  }
  const item = (schedule?.items ?? [])
    .filter((i) => i.command === 'Start Playlist' && (i.startTime ?? 0) * 1000 > nowMs && (!only || i.args?.[0] === only))
    .sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0))[0];
  return item ? { at: (item.startTime ?? 0) * 1000, playlist: item.args?.[0] ?? '' } : null;
}

/**
 * Where the show is. With a main show picked, only that playlist counts:
 * while the player runs anything else the show is waiting, done or idle.
 */
export function showPhase(status: FppStatus | null | undefined, schedule: FppSchedule | null | undefined, nowMs: number, timeZone: string, main?: MainShow | null): ShowPhase {
  const name = (status?.status_name ?? '').toLowerCase();
  const only = main?.name ?? '';
  if (PLAYING.has(name) && (!main || onMainShow(status, main))) {
    const cp = status?.scheduler?.currentPlaylist;
    let endsAt = cp?.scheduledEndTime && (!only || cp.playlistName === only) ? cp.scheduledEndTime * 1000 : null;
    if (!endsAt) {
      const live = (schedule?.items ?? []).find((i) => i.command === 'Start Playlist' && (!only || i.args?.[0] === only)
        && (i.startTime ?? 0) * 1000 <= nowMs && (i.endTime ?? 0) * 1000 > nowMs);
      endsAt = live?.endTime ? live.endTime * 1000 : null;
    }
    return { kind: 'playing', paused: name === 'paused', endsAt, playlist: only || (status?.current_playlist?.playlist ?? cp?.playlistName ?? '') };
  }
  const next = nextWindow(status, schedule, nowMs, only);
  const ended = showEndedToday(schedule, nowMs, timeZone, only);
  if (ended && (!next || calendarDaysBetween(nowMs, next.at, timeZone) >= 1)) {
    return { kind: 'done', nextAt: next?.at ?? null, playlist: ended.playlist ?? '' };
  }
  if (next) return { kind: 'waiting', nextAt: next.at, playlist: next.playlist };
  return { kind: 'idle' };
}

/** "in 18 days", "tomorrow", "in 2 h 14 min". */
export function untilText(atMs: number, nowMs: number, timeZone: string): string {
  const days = calendarDaysBetween(nowMs, atMs, timeZone);
  if (days <= 0) return `in ${spanText(atMs - nowMs)}`;
  if (days === 1) return 'tomorrow';
  return `in ${days} days`;
}

/** "Every night 5:00 to 11:00 PM" for the rule that runs this playlist. */
export function cadenceText(entry: FppScheduleEntry | null | undefined, locale: string): string | null {
  if (!entry) return null;
  const when: Record<number, string> = {
    7: 'Every night', 8: 'Weeknights', 9: 'Weekends', 12: 'Sunday to Thursday', 13: 'Friday and Saturday',
  };
  const days = typeof entry.day === 'number' ? when[entry.day] : undefined;
  const window = windowText(entry.startTime ?? '', entry.endTime ?? '', locale);
  if (days && window) return `${days} ${window}`;
  return days ?? null;
}

/** "through January 10", from the rule's end date. */
export function throughText(entry: FppScheduleEntry | null | undefined, locale: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(entry?.endDate ?? '');
  if (!m) return null;
  const d = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  try {
    return `through ${new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'long', day: 'numeric' }).format(d)}`;
  } catch {
    return null;
  }
}

/** The rule behind a playlist's upcoming (or current) run. */
export function entryFor(schedule: FppSchedule | null | undefined, playlist: string, atMs: number | null, timeZone: string): FppScheduleEntry | null {
  const list = playlistEntries(schedule).filter((e) => !playlist || e.playlist === playlist);
  if (atMs !== null) {
    const p = zoneParts(atMs, timeZone);
    const hit = list.find((e) => inRange(e, p.dateInt) && dayMatches(e.day, p.dow, p.dayOfMonth));
    if (hit) return hit;
  }
  return list[0] ?? null;
}

/** "11:00 PM" for a pill. */
export const endsText = (endsAt: number | null, timeZone: string, locale: string) =>
  endsAt ? clockText(endsAt, timeZone, locale) : null;
