import { describe, expect, it } from 'vitest';
import { rfView, sequenceKey, showPlaylistName, type RfShow } from './remote-falcon';

const seq = (name: string, displayName: string, artist: string | null, duration = 180, imageUrl = '') => ({ name, displayName, artist, duration, imageUrl });
const TREE = seq('Christmas Tree Farm - Taylor Swift', 'Christmas Tree Farm', 'Taylor Swift', 228, 'https://img.example/tree.jpg');
const BELLS = seq('Carol Of The Bells - Lindsey Sterling', 'Carol Of The Bells', 'Lindsey Stirling', 166);
const MEDLEY = seq('Skrillex Medley', 'Skrillex Medley', null, 214, 'javascript:alert(1)');

const show = (over: Partial<RfShow> = {}): RfShow => ({
  preferences: { viewerControlEnabled: true, viewerControlMode: 'JUKEBOX' },
  sequences: [TREE, BELLS, MEDLEY],
  requests: [],
  votes: [],
  playingNextFromSchedule: 'Snowman - Sia',
  ...over,
});

describe('rfView', () => {
  it('lists waiting requests in play order with their names and covers', () => {
    const v = rfView(show({ requests: [{ sequence: { name: BELLS.name }, position: 2 }, { sequence: { name: TREE.name }, position: 1 }] }));
    expect(v.open).toBe(true);
    expect(v.mode).toBe('jukebox');
    expect(v.queue.map((s) => s.title)).toEqual(['Christmas Tree Farm', 'Carol Of The Bells']);
    expect(v.queue[0]).toMatchObject({ artist: 'Taylor Swift', image: 'https://img.example/tree.jpg', duration: 228 });
    expect(v.standings).toEqual([]);
  });

  it('ranks votes on a voting night and leaves out songs with none', () => {
    const v = rfView(show({
      preferences: { viewerControlEnabled: true, viewerControlMode: 'VOTING' },
      requests: [{ sequence: TREE, position: 1 }],
      votes: [{ sequence: BELLS, votes: 4 }, { sequence: TREE, votes: 12 }, { sequence: MEDLEY, votes: 0 }, { sequenceGroup: { name: 'Disney' }, votes: 7 }],
    }));
    expect(v.mode).toBe('voting');
    expect(v.queue).toEqual([]);
    expect(v.standings.map((s) => [s.title, s.votes])).toEqual([['Christmas Tree Farm', 12], ['Disney', 7], ['Carol Of The Bells', 4]]);
    expect(v.totalVotes).toBe(23);
  });

  it('finds a song by the file name the player reports, and drops covers that are not https', () => {
    const v = rfView(show());
    expect(v.find('Christmas Tree Farm - Taylor Swift.fseq')?.title).toBe('Christmas Tree Farm');
    expect(v.find('skrillex medley.fseq')).toMatchObject({ artist: '', image: null });
    expect(v.find('Not In The List.fseq')).toBeUndefined();
  });

  it('reads closed requests and an empty answer without falling over', () => {
    expect(rfView(show({ preferences: { viewerControlEnabled: false, viewerControlMode: 'JUKEBOX' } })).open).toBe(false);
    expect(rfView({})).toMatchObject({ open: false, mode: 'jukebox', queue: [], standings: [], totalVotes: 0, scheduledNext: '' });
  });
});

describe('sequenceKey', () => {
  it('ignores case, punctuation, folders and the .fseq ending', () => {
    expect(sequenceKey("sub/You're a Mean One.FSEQ")).toBe(sequenceKey('youre a mean one'));
  });
});

describe('showPlaylistName', () => {
  const playing = (playlist: string, scheduled?: string) => ({
    status_name: 'playing', current_playlist: { playlist },
    scheduler: scheduled ? { currentPlaylist: { playlistName: scheduled } } : {},
  });

  it('keeps the scheduled show while a request playlist is slotted in', () => {
    expect(showPlaylistName(playing('2026-RF', '2026'), '2026-RF', '2026')).toBe('2026');
    expect(showPlaylistName(playing('2026', '2026'), '2026-RF', '')).toBe('2026');
  });

  it('keeps a show started by hand while the request playlist plays', () => {
    expect(showPlaylistName(playing('2026'), '2026-RF', '')).toBe('2026');
    expect(showPlaylistName(playing('2026-RF'), '2026-RF', '2026')).toBe('2026');
  });

  it('takes the request playlist as the show when it is all that has played', () => {
    expect(showPlaylistName(playing('2026-RF'), '2026-RF', '')).toBe('2026-RF');
  });

  it('names the next scheduled playlist while nothing plays', () => {
    expect(showPlaylistName({ status_name: 'idle', current_playlist: { playlist: '' }, scheduler: { nextPlaylist: { playlistName: '2026' } } }, '', 'old')).toBe('2026');
    expect(showPlaylistName(null, '', 'kept')).toBe('kept');
  });
});
