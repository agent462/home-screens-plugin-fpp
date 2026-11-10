/** What Remote Falcon says about a request or voting night, cut down to what
 *  the wall draws. Pure: the feed fetches, this reads. */
import type { FppStatus } from './fpp-types';
import { namesFromFile } from './songs';

export const RF_SHOW_URL = 'https://remotefalcon.com/remote-falcon-external-api/showDetails';
/** The hub secret that holds the signed key (see `remoteFalconKey`). */
export const RF_SECRET = 'rf_key';

// The parts of Remote Falcon's `showDetails` answer this plugin reads.
export interface RfSequence {
  name?: string | null;
  displayName?: string | null;
  duration?: number | null;
  artist?: string | null;
  imageUrl?: string | null;
}
export interface RfShow {
  preferences?: {
    viewerControlEnabled?: boolean | null;
    viewerControlMode?: string | null;
  } | null;
  sequences?: RfSequence[] | null;
  requests?: Array<{ sequence?: RfSequence | null; position?: number | null }> | null;
  votes?: Array<{ sequence?: RfSequence | null; sequenceGroup?: { name?: string | null } | null; votes?: number | null }> | null;
  playingNextFromSchedule?: string | null;
}

export interface RfSong {
  /** Remote Falcon's sequence name. */
  name: string;
  title: string;
  artist: string;
  /** The cover set in Remote Falcon, when there is one. */
  image: string | null;
  /** Seconds, 0 when Remote Falcon does not know. */
  duration: number;
}

export interface RfView {
  /** Viewers can pick songs right now. */
  open: boolean;
  mode: 'jukebox' | 'voting';
  /** Waiting requests in play order (jukebox nights). */
  queue: RfSong[];
  /** Songs with votes, most first (voting nights). */
  standings: Array<RfSong & { votes: number }>;
  totalVotes: number;
  /** The show's own next song, as Remote Falcon last heard it. */
  scheduledNext: string;
  /** Remote Falcon's entry for a sequence file the player names. */
  find: (file: string | undefined) => RfSong | undefined;
}

/** FPP file names and Remote Falcon names differ in case, punctuation and
 *  the .fseq ending. */
export const sequenceKey = (name: string | null | undefined): string =>
  (name ?? '').split('/').pop()!.replace(/\.fseq$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Only https covers reach the wall, so a stray value can't become an odd src. */
const imageOf = (url: string | null | undefined): string | null => {
  const u = (url ?? '').trim();
  return /^https:\/\/[^\s"'<>()]+$/i.test(u) ? u : null;
};

function songOf(seq: RfSequence | null | undefined): RfSong | null {
  const name = (seq?.name ?? '').trim();
  if (!name) return null;
  const shown = seq?.displayName?.trim() || name;
  const artist = seq?.artist?.trim() ?? '';
  const split = artist ? { title: shown, artist } : namesFromFile(shown);
  return { name, title: split.title || shown, artist: split.artist, image: imageOf(seq?.imageUrl), duration: Math.max(0, Number(seq?.duration) || 0) };
}

export function rfView(show: RfShow): RfView {
  const catalog = new Map<string, RfSong>();
  for (const seq of show.sequences ?? []) {
    const song = songOf(seq);
    if (!song) continue;
    catalog.set(sequenceKey(song.name), song);
    if (seq.displayName) catalog.set(sequenceKey(seq.displayName), song);
  }
  // A request carries its own copy of the sequence; the catalog's is fuller.
  const known = (seq: RfSequence | null | undefined) => catalog.get(sequenceKey(seq?.name)) ?? songOf(seq);
  const mode = show.preferences?.viewerControlMode === 'VOTING' ? 'voting' : 'jukebox';

  const queue = mode === 'jukebox'
    ? [...(show.requests ?? [])]
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .flatMap((r) => known(r.sequence) ?? [])
    : [];

  const standings = mode === 'voting'
    ? (show.votes ?? [])
      .flatMap((v) => {
        const song = known(v.sequence) ?? (v.sequenceGroup?.name ? { name: v.sequenceGroup.name, title: v.sequenceGroup.name, artist: '', image: null, duration: 0 } : null);
        const votes = Math.max(0, Number(v.votes) || 0);
        return song && votes > 0 ? [{ ...song, votes }] : [];
      })
      .sort((a, b) => b.votes - a.votes)
    : [];

  return {
    open: show.preferences?.viewerControlEnabled === true,
    mode,
    queue,
    standings,
    totalVotes: standings.reduce((t, s) => t + s.votes, 0),
    scheduledNext: show.playingNextFromSchedule ?? '',
    find: (file) => (file ? catalog.get(sequenceKey(file)) : undefined),
  };
}

const PLAYING = new Set(['playing', 'paused', 'stopping gracefully', 'stopping gracefully after loop']);

/**
 * The playlist that is the show, even while something else is slotted in.
 * Remote Falcon plays a request by inserting its own playlist after the
 * current song, and for those minutes the player names that one as current.
 * The schedule still names the show. A show started by hand has no schedule
 * entry, so the last show playlist is kept while the request playlist plays.
 */
export function showPlaylistName(status: FppStatus | null | undefined, requestPlaylist: string, last: string): string {
  if (!status) return last;
  const current = status.current_playlist?.playlist ?? '';
  if (PLAYING.has((status.status_name ?? '').toLowerCase())) {
    const scheduled = status.scheduler?.currentPlaylist?.playlistName ?? '';
    if (scheduled) return scheduled;
    if (current && current === requestPlaylist && last && last !== current) return last;
    return current || last;
  }
  return status.scheduler?.nextPlaylist?.playlistName ?? '';
}
