/** Turns the feed's raw answers into what the views draw. Pure: everything
 *  that varies (time, zone, locale, settings) comes in through `opts`. */
import type { FppStatus } from '../lib/fpp-types';
import { num } from '../lib/format';
import { healthOf, OFFLINE_AFTER_MISSES, summarize, type Health, type OutletPower, type Reading, type Summary } from '../lib/health';
import { REQUESTS_STALE_MS } from '../lib/poll';
import { rfView, sequenceKey, type RfSong } from '../lib/remote-falcon';
import { cadenceText, entryFor, showPhase, throughText, type ShowPhase } from '../lib/schedule';
import { coverSearchTerm, songNames, splitExtra, type SongNameSource, type SongNames } from '../lib/songs';
import { controllersFrom, type Controller } from '../lib/systems';
import { currentSongIndex, playlistSongs, roundPosition, type PlaylistSong, type RoundPosition } from '../lib/timeline';
import type { FeedState } from './feed';

export interface ModelOptions {
  songNames: SongNameSource;
  covers: boolean;
  hidden: readonly string[];
  timeZone: string;
  locale: string;
  now: number;
  formatNumber?: (n: number) => string;
  /** Controller id → its linked outlet, for controllers that have one. */
  power?: Readonly<Record<string, OutletPower>>;
}

export interface SongView {
  song: PlaylistSong;
  names: SongNames;
  cover: string | null;
  /** Position in the playlist, -1 when it is not in it. */
  index: number;
  /** A viewer asked for it (waiting in Remote Falcon's queue). */
  request?: boolean;
  /** Its votes on a voting night. */
  votes?: number;
  /** The cover came with the song, so none needs looking up. */
  ownCover?: boolean;
}

/** A request or voting night, as far as the wall can tell. */
export interface RequestsView {
  /** The song playing is not the show's own: a request, or a vote winner. */
  playing: boolean;
  /** Remote Falcon is connected and answering. Everything below needs it. */
  connected: boolean;
  /** Viewers can pick songs right now. */
  open: boolean;
  mode: 'jukebox' | 'voting';
  /** Requests waiting to play. */
  waiting: number;
  totalVotes: number;
  /** Songs with votes, most first. */
  standings: SongView[];
}

export interface ControllerView {
  c: Controller;
  health: Health;
  reading: Reading;
}

export interface ShowModel {
  /** The player has answered at least once. */
  hasData: boolean;
  /** Nothing heard yet, and not yet given up on. */
  connecting: boolean;
  reachable: boolean;
  lastHeardAt: number | null;
  phase: ShowPhase;
  status: FppStatus | null;
  /** When `status` arrived; with `elapsed` it lets the bar count on its own. */
  statusAt: number | null;
  playlistName: string;
  songs: PlaylistSong[];
  current: SongView | null;
  /** Seconds into the current song when `status` arrived. */
  elapsed: number;
  /** Length of the current song in seconds. */
  duration: number;
  round: RoundPosition;
  requests: RequestsView;
  /** Where the show is in its playlist: the song playing, or, while a
   *  request plays, the song the show picks up with. -1 when unknown. */
  showIndex: number;
  /** What plays next, in order: waiting requests, then the show's songs. */
  upNext: SongView[];
  firstUp: SongView[];
  /** The playlist's songs for the cover grid (it shows nine distinct covers). */
  grid: SongView[];
  controllers: ControllerView[];
  summary: Summary;
  cadence: string | null;
  through: string | null;
  volume: number | null;
}

const base = (f: string | undefined) => (f ?? '').split('/').pop() ?? '';

function songView(state: FeedState, opts: ModelOptions, song: PlaylistSong, index: number): SongView {
  const tags = song.media ? state.meta[song.media] ?? undefined : undefined;
  const names = songNames(song.sequence, song.media, tags, opts.songNames);
  const cover = opts.covers ? state.covers[coverSearchTerm(names)] ?? null : null;
  return { song, names, cover, index };
}

/** A song as Remote Falcon names it. Its own cover wins; without one the
 *  usual cover search stands in. */
function requestView(state: FeedState, opts: ModelOptions, song: RfSong, extra: Partial<SongView> = {}): SongView {
  const { main, extra: quiet } = splitExtra(song.title);
  const names = { title: main, extra: quiet, artist: song.artist, album: '' };
  const looked = opts.covers ? state.covers[coverSearchTerm(names)] ?? null : null;
  return {
    song: { sequence: song.name, media: '', duration: song.duration }, names,
    cover: song.image ?? looked, index: -1, ownCover: !!song.image, ...extra,
  };
}

export function buildModel(state: FeedState, opts: ModelOptions): ShowModel {
  const status = state.player.status;
  const reachable = state.player.misses < OFFLINE_AFTER_MISSES && status !== null;
  const phase = showPhase(status, state.schedule, opts.now, opts.timeZone);
  const songs = playlistSongs(state.playlist);
  const playing = phase.kind === 'playing';

  let current: SongView | null = null;
  let elapsed = 0;
  let duration = 0;
  let index = -1;
  // Remote Falcon's answer counts only during the show and while it is fresh.
  const heard = state.requests;
  const rf = playing && heard && opts.now - heard.at < REQUESTS_STALE_MS ? rfView(heard.show) : null;
  // The player is on another playlist than the show's: a request slotted in.
  const playingList = status?.current_playlist?.playlist ?? '';
  const requested = playing && !!state.showName && !!playingList && playingList !== state.showName;
  if (playing && status) {
    elapsed = num(status.seconds_played);
    duration = elapsed + num(status.seconds_remaining);
    // A request can be a song the show also has; it is still not the show's turn.
    index = requested ? -1 : currentSongIndex(songs, status);
    const known = requested ? rf?.find(status.current_sequence) : undefined;
    if (known) {
      current = requestView(state, opts, known);
    } else {
      const song: PlaylistSong = index >= 0
        ? songs[index]
        : { sequence: base(status.current_sequence), media: base(status.current_song), duration };
      if (song.sequence || song.media) current = songView(state, opts, song, index);
      if (!duration) duration = song.duration;
    }
  }

  // While a request plays the show waits at its next song. The player's own
  // last show song says which; Remote Falcon's note is the fallback for a
  // wall that loaded mid-request.
  let showIndex = index;
  if (requested && songs.length) {
    const last = state.lastShowSequence ? songs.findIndex((s) => s.sequence === state.lastShowSequence) : -1;
    if (last >= 0) showIndex = (last + 1) % songs.length;
    else if (rf?.scheduledNext) {
      const key = sequenceKey(rf.scheduledNext);
      showIndex = songs.findIndex((s) => sequenceKey(s.sequence) === key);
    }
  }

  const wrap = (from: number, count: number) => {
    const out: SongView[] = [];
    for (let i = 0; i < Math.min(count, songs.length); i++) {
      const at = (from + i) % songs.length;
      out.push(songView(state, opts, songs[at], at));
    }
    return out;
  };

  const queue = rf ? rf.queue.map((s) => requestView(state, opts, s, { request: true })) : [];
  const showFrom = requested ? showIndex : index >= 0 ? index + 1 : -1;
  const upNext = [...queue, ...(showFrom >= 0 ? wrap(showFrom, 3) : [])].slice(0, 3);
  const requests: RequestsView = {
    playing: requested,
    connected: rf !== null,
    open: rf?.open ?? false,
    mode: rf?.mode ?? 'jukebox',
    waiting: queue.length,
    totalVotes: rf?.totalVotes ?? 0,
    standings: rf ? rf.standings.slice(0, 3).map((s) => requestView(state, opts, s, { votes: s.votes })) : [],
  };

  const controllers = controllersFrom(state.systems ?? [], opts.hidden, opts.formatNumber);
  const readings = new Map<string, Reading>();
  const health = new Map<string, Health>();
  const views: ControllerView[] = controllers.map((c) => {
    const reading = c.isPlayer ? state.player : state.remotes[c.id];
    const r = reading ?? { status: null, lastOkAt: null, firstMissAt: null, misses: 0, restartedAt: null, idleWhilePlaying: 0 };
    readings.set(c.id, r);
    const h = healthOf(r, opts.now, opts.power?.[c.id]);
    health.set(c.id, h);
    return { c, health: h, reading: r };
  });

  const planned = phase.kind === 'playing' ? phase.playlist : phase.kind === 'idle' ? '' : phase.playlist;
  const at = phase.kind === 'waiting' ? phase.nextAt : phase.kind === 'done' ? phase.nextAt : opts.now;
  const entry = entryFor(state.schedule, planned, at, opts.timeZone);

  return {
    hasData: status !== null,
    connecting: status === null && state.player.misses < OFFLINE_AFTER_MISSES,
    reachable,
    lastHeardAt: state.player.lastOkAt,
    phase,
    status,
    statusAt: state.playerFetchedAt,
    playlistName: state.playlistName || planned,
    songs,
    current,
    elapsed,
    duration,
    round: roundPosition(songs, showIndex, requested ? 0 : elapsed),
    requests,
    showIndex,
    upNext,
    firstUp: wrap(0, 3),
    grid: wrap(0, Math.min(songs.length, 24)),
    controllers: views,
    summary: summarize(controllers, health, readings),
    cadence: cadenceText(entry, opts.locale),
    through: throughText(entry, opts.locale),
    volume: typeof status?.volume === 'number' ? status.volume : null,
  };
}

/** Media files whose tags the views need now. */
const onScreen = (m: ShowModel): SongView[] =>
  [m.current, ...m.upNext, ...m.requests.standings, ...m.firstUp, ...m.grid].filter((s): s is SongView => !!s);

export function wantedMedia(m: ShowModel): string[] {
  const list = onScreen(m);
  return [...new Set(list.map((s) => s.song.media).filter(Boolean))];
}

/** Names to find covers for, once their tags are in (so the search uses the
 *  real title, not the file name). */
export function wantedCoverNames(m: ShowModel, meta: FeedState['meta']): SongNames[] {
  const list = onScreen(m).filter((s) => !s.ownCover);
  const seen = new Set<string>();
  const out: SongNames[] = [];
  for (const s of list) {
    if (s.song.media && !(s.song.media in meta)) continue;
    const term = coverSearchTerm(s.names);
    if (!term || seen.has(term)) continue;
    seen.add(term);
    out.push(s.names);
  }
  return out;
}
