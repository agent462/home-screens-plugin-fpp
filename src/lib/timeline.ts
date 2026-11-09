import type { FppPlaylist, FppStatus } from './fpp-types';
import { num } from './format';

export interface PlaylistSong {
  sequence: string;
  media: string;
  /** Seconds. */
  duration: number;
}

const SONG_TYPES = new Set(['sequence', 'both', 'media']);

/** The main section of a playlist as songs (lead-in and lead-out are the
 *  intro and outro, not part of the round the wall counts). */
export function playlistSongs(pl: FppPlaylist | null | undefined): PlaylistSong[] {
  return (pl?.mainPlaylist ?? [])
    .filter((e) => e && e.enabled !== 0 && SONG_TYPES.has((e.type ?? '').toLowerCase()) && (e.sequenceName || e.mediaName))
    .map((e) => ({ sequence: e.sequenceName ?? '', media: e.mediaName ?? '', duration: Math.max(0, num(e.duration)) }));
}

const base = (f: string | undefined) => (f ?? '').split('/').pop() ?? '';

/** Which song is playing, by name first (the playlist index counts lead-in
 *  items), falling back to the index. -1 when it isn't in this playlist. */
export function currentSongIndex(songs: PlaylistSong[], status: FppStatus | null | undefined): number {
  if (!status || songs.length === 0) return -1;
  const seq = base(status.current_sequence || status.sequence_filename);
  const media = base(status.current_song);
  if (seq) {
    const i = songs.findIndex((s) => s.sequence === seq);
    if (i >= 0) return i;
  }
  if (media) {
    const i = songs.findIndex((s) => s.media === media);
    if (i >= 0) return i;
  }
  const idx = num(status.current_playlist?.index) - 1;
  return idx >= 0 && idx < songs.length ? idx : -1;
}

export interface RoundPosition {
  /** Seconds into this pass of the playlist. */
  done: number;
  total: number;
  remaining: number;
}

export function roundPosition(songs: PlaylistSong[], index: number, elapsed: number): RoundPosition {
  const total = songs.reduce((t, s) => t + s.duration, 0);
  if (index < 0) return { done: 0, total, remaining: total };
  const before = songs.slice(0, index).reduce((t, s) => t + s.duration, 0);
  const done = Math.min(total, before + Math.min(Math.max(0, elapsed), songs[index]?.duration ?? 0));
  return { done, total, remaining: Math.max(0, total - done) };
}
