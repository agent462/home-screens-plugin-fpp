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
    showName: '2026', mainPlaylist: '', requestPlaylist: '2026-RF', lastShowSequence: '', playlistName: '2026', playlist: playlist as FppPlaylist, requests: null, schedule: null, meta: {}, covers: {},
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
    expect(m.upNext.map((s) => [s.names.title, !!s.request])).toEqual([['Carol Of The Bells', true], ['Let It Go', true], ["You're a Mean One, Mr. Grinch", false]]);
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

describe("buildModel with Remote Falcon's song list", () => {
  const idle: FppStatus = { status_name: 'idle', scheduler: { nextPlaylist: { playlistName: '2026', scheduledStartTime: NOW / 1000 + 3600 } } };

  it('names the show songs and gives them covers the way the family set them up, at any age and off the show', () => {
    const m = buildModel(state(idle, { requests: heard({}, NOW - 20 * 60_000) }), opts);
    expect(m.phase.kind).toBe('waiting');
    const grinch = m.grid[7];
    expect(grinch.names).toMatchObject({ title: "You're a Mean One, Mr. Grinch", artist: 'Small Town Titans' });
    expect(grinch.cover).toBe(seq('youre a mean one mr grinch').imageUrl);
    // A cover that came with the song is not looked up.
    expect(wantedCoverNames(m, {}).map((n) => n.title)).not.toContain("You're a Mean One, Mr. Grinch");
    // An old answer still says nothing about who is waiting.
    expect(m.requests.connected).toBe(false);
  });

  it('moves a trailing "(From ...)" onto its own line and keeps the album from the music file', () => {
    const media = '01 - I Knew It, I Knew You (From _Toy Story 5_).mp3';
    const m = buildModel(state(idle, { requests: heard({}), meta: { [media]: { title: 'x', artist: 'y', album: 'Toy Story 5 Soundtrack' } } }), { ...opts, songNames: 'tags' });
    expect(m.grid[2].names).toEqual({ title: 'I Knew It, I Knew You', extra: 'From Toy Story 5', artist: 'Taylor Swift', album: 'Toy Story 5 Soundtrack' });
  });

  it('looks up a cover for a song Remote Falcon has no picture for', () => {
    const m = buildModel(state(idle, { requests: heard({}) }), opts);
    const tso = m.grid[8];
    expect(tso.names.title).toBe('TSO Chrismas Medley 2025');
    expect(tso.ownCover).toBeUndefined();
    expect(wantedCoverNames(m, { 'TSO Chistmas Medley.mp3': null }).map((n) => n.title)).toContain('TSO Chrismas Medley 2025');
  });

  it('names songs from the player alone without Remote Falcon', () => {
    const m = buildModel(state(idle), opts);
    expect(m.grid[7].names.title).toBe('Youre a Mean One Mr Grinch');
  });
});

describe('buildModel with a main show picked', () => {
  const main = { mainPlaylist: '2026', requestPlaylist: '2026-RF' };
  const preShow: FppStatus = {
    status_name: 'playing', current_playlist: { playlist: 'Pre-show', index: '1', count: '3' }, current_sequence: 'Tune To Sign.fseq',
    seconds_played: '10', seconds_remaining: '50',
    scheduler: { status: 'playing', currentPlaylist: { playlistName: 'Pre-show' }, nextPlaylist: { playlistName: '2026', scheduledStartTime: NOW / 1000 + 1800 } },
  };

  it('keeps waiting for the show while the player runs another playlist, and says what that is', () => {
    const m = buildModel(state(preShow, main), opts);
    expect(m.phase).toMatchObject({ kind: 'waiting', playlist: '2026' });
    expect(m.current).toBeNull();
    expect(m.requests.playing).toBe(false);
    expect(m.songs).toHaveLength(14);
    expect(m.alsoPlaying).toEqual({ playlist: 'Pre-show', title: 'Tune To Sign' });
  });

  it('takes that other playlist as the show when no main show is picked', () => {
    const m = buildModel(state(preShow), opts);
    expect(m.phase).toMatchObject({ kind: 'playing', playlist: 'Pre-show' });
    expect(m.alsoPlaying).toBeNull();
  });

  it('is the show as usual on the main playlist, requests and all', () => {
    expect(buildModel(state(playing('2026', GRINCH), main), opts)).toMatchObject({ phase: { kind: 'playing' }, showIndex: 7, alsoPlaying: null });
    const request = buildModel(state(playing('2026-RF', `${TREE}.fseq`), { ...main, lastShowSequence: KINGS }), opts);
    expect(request).toMatchObject({ phase: { kind: 'playing' }, requests: { playing: true }, showIndex: 7, alsoPlaying: null });
  });
});

describe('buildModel with named and ordered controllers', () => {
  const systems = [
    { address: '192.168.0.200', hostname: 'player', uuid: 'p', typeId: 1, local: 1 },
    { address: '192.168.0.101', hostname: 'k8-showstopper', uuid: 'a', typeId: 1 },
    { address: '192.168.0.102', hostname: 'roof', uuid: 'b', typeId: 1 },
  ];
  it('uses the family names and order on the cards', () => {
    const m = buildModel(state(playing('2026', GRINCH), { systems }), { ...opts, controllers: { names: { a: 'Big tree' }, order: ['b', 'a'], groups: [] } });
    expect(m.controllers.map((v) => v.c.name)).toEqual(['Roof', 'Big tree', 'Player']);
    expect(m.sections).toHaveLength(1);
    expect(m.sections[0].name).toBeNull();
  });
  it('puts the controllers in no group first, then each group, and leaves out a group with nothing showing', () => {
    const prefs = { names: {}, order: [], groups: [{ name: 'Yard', ids: ['a', 'gone'] }, { name: 'Shed', ids: ['hidden'] }, { name: 'House', ids: ['b'] }] };
    const m = buildModel(state(playing('2026', GRINCH), { systems }), { ...opts, controllers: prefs });
    expect(m.sections.map((s) => [s.name, s.items.map((v) => v.c.name)])).toEqual([[null, ['Player']], ['Yard', ['K8 Showstopper']], ['House', ['Roof']]]);
    expect(m.controllers.map((v) => v.c.name)).toEqual(['Player', 'K8 Showstopper', 'Roof']);
    expect(m.summary.total).toBe(3);
  });
  it('is the player first, then by name, when nobody arranged them', () => {
    const m = buildModel(state(playing('2026', GRINCH), { systems }), opts);
    expect(m.controllers.map((v) => v.c.name)).toEqual(['Player', 'K8 Showstopper', 'Roof']);
  });
});
