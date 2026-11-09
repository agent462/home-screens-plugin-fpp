import { describe, expect, it } from 'vitest';
import fixture from '../../test/fixtures/schedule.json';
import statuses from '../../test/fixtures/statuses.json';
import type { FppSchedule, FppStatus } from './fpp-types';
import { cadenceText, dayMatches, entryFor, showEndedToday, showPhase, throughText, untilText } from './schedule';

const TZ = 'America/Chicago';
const schedule = fixture.schedule as FppSchedule;
const idle = (statuses as Record<string, FppStatus>)['192.168.0.200'];
const at = (iso: string) => Date.parse(iso);

describe('showPhase on the real 2026 schedule (nightly 5 to 11 PM from Nov 27)', () => {
  it('is waiting today, Nov 9, with the next start from the player', () => {
    const now = at('2026-11-09T11:15:00-06:00');
    const p = showPhase(idle, schedule, now, TZ);
    expect(p).toMatchObject({ kind: 'waiting', playlist: '2026' });
    expect(p.kind === 'waiting' && new Date(p.nextAt).toISOString()).toBe('2026-11-27T23:00:00.000Z');
    expect(p.kind === 'waiting' && untilText(p.nextAt, now, TZ)).toBe('in 18 days');
  });

  it('is done for tonight after 11 PM on a show night, back tomorrow', () => {
    const now = at('2026-11-27T23:30:00-06:00');
    const status: FppStatus = { status_name: 'idle', scheduler: { nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-28T17:00:00-06:00') / 1000 } } };
    const p = showPhase(status, schedule, now, TZ);
    expect(p.kind).toBe('done');
    expect(p.kind === 'done' && untilText(p.nextAt!, now, TZ)).toBe('tomorrow');
  });

  it('is waiting, not done, at 4 PM on a show night', () => {
    const now = at('2026-11-28T16:00:00-06:00');
    const status: FppStatus = { status_name: 'idle', scheduler: { nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-28T17:00:00-06:00') / 1000 } } };
    const p = showPhase(status, schedule, now, TZ);
    expect(p.kind).toBe('waiting');
    expect(p.kind === 'waiting' && untilText(p.nextAt, now, TZ)).toBe('in 1 h');
  });

  it('is not done before the season starts', () => {
    expect(showEndedToday(schedule, at('2026-11-20T23:30:00-06:00'), TZ)).toBeNull();
  });

  it('is playing, ending when the scheduler says', () => {
    const end = at('2026-11-27T23:00:00-06:00') / 1000;
    const status: FppStatus = {
      status_name: 'playing', current_playlist: { playlist: '2026' },
      scheduler: { status: 'playing', currentPlaylist: { playlistName: '2026', scheduledEndTime: end } },
    };
    expect(showPhase(status, schedule, at('2026-11-27T19:42:00-06:00'), TZ)).toEqual({ kind: 'playing', paused: false, endsAt: end * 1000, playlist: '2026' });
  });

  it('finds the end from the schedule window when started by hand inside it, and knows paused', () => {
    const status: FppStatus = { status_name: 'paused', current_playlist: { playlist: '2026' } };
    const p = showPhase(status, schedule, at('2026-11-27T19:42:00-06:00'), TZ);
    expect(p).toMatchObject({ kind: 'playing', paused: true });
    expect(p.kind === 'playing' && new Date(p.endsAt!).toISOString()).toBe('2026-11-28T05:00:00.000Z');
  });

  it('is idle with nothing scheduled', () => {
    expect(showPhase({ status_name: 'idle' }, { entries: [], items: [] }, Date.now(), TZ)).toEqual({ kind: 'idle' });
  });
});

describe('schedule words', () => {
  const entry = entryFor(schedule, '2026', at('2026-11-27T17:00:00-06:00'), TZ);
  it('describes the rule', () => {
    expect(cadenceText(entry, 'en-US')).toBe('Every night 5:00 to 11:00 PM');
    expect(throughText(entry, 'en-US')).toBe('through January 10');
  });
  it('handles windows across noon', () => {
    expect(cadenceText({ day: 9, startTime: '11:00:00', endTime: '13:30:00' }, 'en-US')).toBe('Weekends 11:00 AM to 1:30 PM');
  });
});

describe('dayMatches (FPP day codes)', () => {
  it('reads presets and custom masks', () => {
    expect(dayMatches(7, 3, 9)).toBe(true);
    expect(dayMatches(8, 6, 9)).toBe(false);
    expect(dayMatches(13, 5, 9)).toBe(true);
    expect(dayMatches(2, 2, 9)).toBe(true);
    expect(dayMatches(14, 1, 9)).toBe(true);
    // 82688 = custom Fri, Sat and Sun (the sign effects in the real schedule)
    expect(dayMatches(82688, 0, 1)).toBe(true);
    expect(dayMatches(82688, 5, 1)).toBe(true);
    expect(dayMatches(82688, 3, 1)).toBe(false);
  });
});
