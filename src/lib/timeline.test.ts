import { describe, expect, it } from 'vitest';
import playlist from '../../test/fixtures/playlist-2026.json';
import type { FppPlaylist } from './fpp-types';
import { currentSongIndex, playlistSongs, roundPosition } from './timeline';
import { cacheTtlFor, hostBaseUrl, playerBaseUrl, playerEveryMs, remoteRoundMs, playerNextMs } from './poll';
import { calendarDaysBetween, mmss, spanText, temperature, uptimeText, windowText } from './format';

const songs = playlistSongs(playlist as FppPlaylist);

describe('playlist timeline', () => {
  it('reads the 14 songs of the main section', () => {
    expect(songs).toHaveLength(14);
    expect(songs[7].sequence).toBe('Youre a Mean One Mr Grinch.fseq');
    expect(Math.round(songs.reduce((t, s) => t + s.duration, 0))).toBe(2936);
  });

  it('finds the playing song by name, then by index', () => {
    expect(currentSongIndex(songs, { current_sequence: 'Youre a Mean One Mr Grinch.fseq' })).toBe(7);
    expect(currentSongIndex(songs, { current_song: '03 - Snowman.mp3' })).toBe(0);
    expect(currentSongIndex(songs, { current_sequence: 'x.fseq', current_playlist: { index: '3' } })).toBe(2);
    expect(currentSongIndex(songs, { current_sequence: 'x.fseq' })).toBe(-1);
  });

  it('knows how far into the round it is', () => {
    const r = roundPosition(songs, 7, 94);
    expect(Math.round(r.done)).toBe(1562);
    expect(Math.round(r.remaining / 60)).toBe(23);
  });
});

describe('polling pace', () => {
  it('is quick only while a song plays', () => {
    expect(playerEveryMs({ playing: true, paused: false, reachable: true, asleep: false })).toBe(2000);
    expect(playerEveryMs({ playing: false, paused: false, reachable: true, asleep: false })).toBe(5000);
    expect(playerEveryMs({ playing: true, paused: false, reachable: false, asleep: false })).toBe(30000);
    expect(playerEveryMs({ playing: true, paused: false, reachable: true, asleep: true })).toBe(60000);
    expect(remoteRoundMs(true, false)).toBe(30000);
    expect(remoteRoundMs(false, false)).toBe(60000);
  });

  it('asks right as a song ends or a show starts, and wants a fresh answer then', () => {
    const now = Date.parse('2026-11-30T19:42:00-06:00');
    const playing = (left: string) => ({ status_name: 'playing', seconds_remaining: left });
    expect(playerNextMs(2000, playing('134'), now)).toEqual({ inMs: 2000, fresh: false });
    expect(playerNextMs(2000, playing('1'), now)).toEqual({ inMs: 1300, fresh: true });
    expect(playerNextMs(2000, playing('0'), now)).toEqual({ inMs: 500, fresh: true });
    const idle = (startInMs: number) => ({ status_name: 'idle', scheduler: { nextPlaylist: { scheduledStartTime: (now + startInMs) / 1000 } } });
    expect(playerNextMs(5000, idle(3_600_000), now)).toEqual({ inMs: 5000, fresh: false });
    expect(playerNextMs(5000, idle(3000), now)).toEqual({ inMs: 3300, fresh: true });
    expect(playerNextMs(5000, idle(-4000), now)).toEqual({ inMs: 1000, fresh: true });
    expect(playerNextMs(5000, idle(-60_000), now)).toEqual({ inMs: 5000, fresh: false });
    expect(playerNextMs(30000, null, now)).toEqual({ inMs: 30000, fresh: false });
  });

  it('caches each answer for just under its interval', () => {
    expect(cacheTtlFor(2000)).toBe(1700);
    expect(cacheTtlFor(60000)).toBe(58000);
  });

  it('reads addresses however they are typed', () => {
    expect(playerBaseUrl('192.168.0.200')).toBe('http://192.168.0.200');
    expect(playerBaseUrl(' http://fpp.local/ ')).toBe('http://fpp.local');
    expect(playerBaseUrl('fpp.local:8080/whatever')).toBe('http://fpp.local:8080');
    expect(playerBaseUrl('')).toBe('');
    expect(hostBaseUrl('fe80::1')).toBe('http://[fe80::1]');
  });
});

describe('format', () => {
  it('formats times, temperatures and spans', () => {
    expect(mmss(94)).toBe('1:34');
    expect(mmss(163.9)).toBe('2:43');
    expect(temperature(69.5, 'imperial')).toBe(157);
    expect(temperature(69.5, 'metric')).toBe(70);
    expect(spanText(6 * 60_000)).toBe('6 min');
    expect(spanText(65 * 60_000)).toBe('1 h 5 min');
    expect(uptimeText(7440)).toBe('2 h 4 m');
    expect(windowText('17:00:00', '23:00:00', 'en-US')).toBe('5:00 to 11:00 PM');
    expect(windowText('17:00:00', '23:00:00', 'de-DE')).toBe('17:00 to 23:00');
  });

  it('counts calendar days in the household zone', () => {
    const tz = 'America/Chicago';
    expect(calendarDaysBetween(Date.parse('2026-11-27T23:30:00-06:00'), Date.parse('2026-11-28T17:00:00-06:00'), tz)).toBe(1);
    expect(calendarDaysBetween(Date.parse('2026-11-09T11:15:00-06:00'), Date.parse('2026-11-27T17:00:00-06:00'), tz)).toBe(18);
  });
});
