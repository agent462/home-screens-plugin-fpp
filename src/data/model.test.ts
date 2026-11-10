import { describe, expect, it } from 'vitest';
import playlist from '../../test/fixtures/playlist-2026.json';
import rfShow from '../../test/fixtures/rf-show.json';
import type { FppPlaylist, FppStatus } from '../lib/fpp-types';
import { emptyReading } from '../lib/health';
import type { RfShow } from '../lib/remote-falcon';
import type { FeedState } from './feed';
import { buildModel, wantedCoverNames, type ModelOptions } from './model';

const NOW = Date.parse('2026-11-30T19:42:00-06:00');
const opts: ModelOptions = { songNames: 'sequence', covers: true, hidden: [], timeZone: 'America/Chicago', locale: 'en-US', now: NOW };

const GRINCH = 'Youre a Mean One Mr Grinch.fseq';
const KINGS = 'We Three Kings - Tommee Profitt & We The Kingdom.fseq';
const seq = (name: string) => rfShow.sequences.find((s) => s.name === name)!;

function playing(list: string, sequence: string): FppStatus {
  return {
    status_name: 'playing', current_playlist: { playlist: list, index: '1', count: '14' }, current_sequence: sequence,
    seconds_played: '94', seconds_remaining: '134', scheduler: { status: 'playing', currentPlaylist: { playlistName: '2026' } },
  };
}

function state(status: FppStatus, over: Partial<FeedState> = {}): FeedState {
  return {
    base: 'http://192.168.0.200', player: { ...emptyReading(), status, lastOkAt: NOW }, playerFetchedAt: NOW, systems: [], remotes: {},
    showName: '2026', lastShowSequence: '', playlistName: '2026', playlist: playlist as FppPlaylist, requests: null, schedule: null, meta: {}, covers: {},
    ...over,
  };
}

const heard = (over: Partial<RfShow>, at = NOW - 5_000) => ({ show: { ...(rfShow as RfShow), ...over }, at });
const TREE = 'Christmas Tree Farm - Taylor Swift';
const waiting = (...names: string[]) => names.map((name, i) => ({ sequence: seq(name), position: i + 1 }));

describe('buildModel on a request night', () => {
  it('is an ordinary night when nothing is slotted in and Remote Falcon is not connected', () => {
    const m = buildModel(state(playing('2026', GRINCH)), opts);
    expect(m.requests).toMatchObject({ playing: false, connected: false, open: false, waiting: 0 });
    expect(m.showIndex).toBe(7);
    expect(m.upNext.map((s) => s.index)).toEqual([8, 9, 10]);
  });

  it('keeps the show playlist and waits at the next show song while a request plays', () => {
    const m = buildModel(state(playing('2026-RF', `${TREE}.fseq`), { lastShowSequence: KINGS }), opts);
    expect(m.requests.playing).toBe(true);
    expect(m.songs).toHaveLength(14);
    expect(m.current).toMatchObject({ index: -1, names: { title: 'Christmas Tree Farm', artist: 'Taylor Swift' } });
    expect(m.showIndex).toBe(7);
    // Without Remote Falcon, what comes next is the show picking back up.
    expect(m.upNext.map((s) => s.index)).toEqual([7, 8, 9]);
    expect(m.round.done).toBeGreaterThan(0);
  });

  it('does not take a request for a song the show also has as the show playing it', () => {
    const m = buildModel(state(playing('2026-RF', 'Snowman - Sia.fseq'), { lastShowSequence: KINGS }), opts);
    expect(m.current?.index).toBe(-1);
    expect(m.showIndex).toBe(7);
  });

  it('puts waiting requests ahead of the show, with their own names and covers', () => {
    const m = buildModel(state(playing('2026-RF', `${TREE}.fseq`), {
      lastShowSequence: KINGS,
      requests: heard({ requests: waiting('Carol Of The Bells - Lindsey Sterling', 'Let It Go Frozen_Soundtrack') }),
    }), opts);
    expect(m.requests).toMatchObject({ playing: true, connected: true, open: true, mode: 'jukebox', waiting: 2 });
    expect(m.current?.cover).toBe(seq(TREE).imageUrl);
    expect(m.upNext.map((s) => [s.names.title, !!s.request])).toEqual([['Carol Of The Bells', true], ['Let It Go', true], ["Youre a Mean One Mr Grinch", false]]);
    expect(m.upNext[1].names.extra).toContain('From Frozen');
    // Covers that came from Remote Falcon are not looked up again.
    expect(wantedCoverNames(m, {}).map((n) => n.title)).not.toContain('Carol Of The Bells');
  });

  it('shows a waiting request as next while a show song plays', () => {
    const m = buildModel(state(playing('2026', GRINCH), { requests: heard({ requests: waiting(TREE) }) }), opts);
    expect(m.requests.playing).toBe(false);
    expect(m.upNext.map((s) => s.index)).toEqual([-1, 8, 9]);
    expect(m.upNext[0].request).toBe(true);
  });

  it('falls back to Remote Falcon for where the show picks up when the wall loaded mid-request', () => {
    const m = buildModel(state(playing('2026-RF', `${TREE}.fseq`), { requests: heard({ playingNextFromSchedule: 'Youre a Mean One Mr Grinch' }) }), opts);
    expect(m.showIndex).toBe(7);
    const unknown = buildModel(state(playing('2026-RF', `${TREE}.fseq`)), opts);
    expect(unknown.showIndex).toBe(-1);
    expect(unknown.upNext).toEqual([]);
  });

  it('ranks the vote on a voting night', () => {
    const m = buildModel(state(playing('2026', GRINCH), {
      requests: heard({
        preferences: { viewerControlEnabled: true, viewerControlMode: 'VOTING' },
        votes: [{ sequence: seq('Tsunami - DVBBS & Borgeous'), votes: 4 }, { sequence: seq('The Fate of Ophelia - Taylor Swift'), votes: 12 }],
      }),
    }), opts);
    expect(m.requests).toMatchObject({ mode: 'voting', totalVotes: 16, waiting: 0 });
    expect(m.requests.standings.map((s) => [s.names.title, s.votes])).toEqual([['The Fate of Ophelia', 12], ['Tsunami', 4]]);
  });

  it('stops trusting an old Remote Falcon answer', () => {
    const m = buildModel(state(playing('2026', GRINCH), { requests: heard({ requests: waiting(TREE) }, NOW - 60_000) }), opts);
    expect(m.requests).toMatchObject({ connected: false, waiting: 0 });
    expect(m.upNext.map((s) => s.index)).toEqual([8, 9, 10]);
  });
});
