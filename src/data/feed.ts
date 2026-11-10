/**
 * One poller per show player, shared by every instance on the page.
 *
 * A single 1 s tick decides what is due. The player's status, the controller
 * list, the schedule and the playlist come from the player; each remote is
 * asked for its own fppd status in a round robin spread across the round, at
 * most two at a time. Song tags and covers are fetched only for songs a view
 * asks for, and kept in the host's display cache so a reload does not ask
 * again.
 *
 * On a request night the player names Remote Falcon's playlist as current
 * while a request plays. The feed keeps hold of the show's own playlist
 * through that, and, when Remote Falcon is connected, asks it who is waiting.
 * Off the show it is asked now and then, for its song names and covers.
 *
 * A family can pick one playlist as their show. Then that is the playlist
 * the feed holds, whatever else the player runs.
 */
import type { FppPlaylist, FppSchedule, FppStatus, FppSystem } from '../lib/fpp-types';
import { applyCheck, emptyReading, OFFLINE_AFTER_MISSES, type Reading } from '../lib/health';
import {
  cacheTtlFor, EDGE_EVERY_MS, hostBaseUrl, playerEveryMs, playerNextMs, remoteRoundMs,
  PLAYLIST_EVERY_MS, REMOTE_IN_FLIGHT, REQUESTS_EVERY_MS, REQUESTS_IDLE_EVERY_MS, REQUEST_PLAYLIST_EVERY_MS, REMOTE_MISS_AFTER_MS, RETRY_AFTER_MISS_MS, SCHEDULE_EVERY_MS, SYSTEMS_EVERY_MS,
} from '../lib/poll';
import { showPlaylistName, type RfShow } from '../lib/remote-falcon';
import { coverSearchTerm, pickCover, tagsFromMeta, type ItunesTrack, type SongNames, type SongTags } from '../lib/songs';
import { controllersFrom } from '../lib/systems';

/** Fetch JSON through the hub proxy; rejects on any failure. */
export type Fetcher = (url: string, cacheTtlMs: number) => Promise<unknown>;

/** Remote Falcon's show details through the hub, which adds the saved key. */
export type RequestsFetcher = (cacheTtlMs: number) => Promise<unknown>;

export interface FeedCache {
  get: (key: string) => unknown | undefined;
  set: (key: string, value: unknown, ttlMs: number) => void;
}

export interface FeedState {
  base: string;
  player: Reading;
  /** When the current player status arrived, so the bar can count on. */
  playerFetchedAt: number | null;
  systems: FppSystem[] | null;
  remotes: Readonly<Record<string, Reading>>;
  /** The show's own playlist, held through a slotted-in request. */
  showName: string;
  /** The playlist the family picked as their show; '' follows the schedule. */
  mainPlaylist: string;
  /** The playlist Remote Falcon's player plugin inserts requests from. */
  requestPlaylist: string;
  /** The last sequence the player played from the show playlist, which is
   *  where the show picks up after a request. */
  lastShowSequence: string;
  /** The playlist that was fetched (the show's, once it has answered). */
  playlistName: string;
  playlist: FppPlaylist | null;
  /** Remote Falcon's last answer and when it came; null when not connected
   *  or nothing has been heard. Its song list is good at any age; who is
   *  waiting is only good fresh (the model decides). */
  requests: { show: RfShow; at: number } | null;
  schedule: FppSchedule | null;
  /** Media file → tags (null: looked, none found). */
  meta: Readonly<Record<string, SongTags | null>>;
  /** Cover search term → art URL (null: no confident match). */
  covers: Readonly<Record<string, string | null>>;
}

export interface CoverWant {
  names: SongNames;
}

const META_TTL_MS = 7 * 24 * 3600_000;
const COVER_TTL_MS = 30 * 24 * 3600_000;
const RETRY_MS = 30_000;
/** Remote Falcon not answering before the show is no hurry. */
const IDLE_RETRY_MS = 5 * 60_000;
const EXTRAS_IN_FLIGHT = 2;

const isPlaying = (s: FppStatus | null | undefined) => {
  const n = (s?.status_name ?? '').toLowerCase();
  return n === 'playing' || n === 'paused';
};

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export class Feed {
  private state: FeedState;
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private due = { player: 0, systems: 0, schedule: 0, playlist: 0, remote: 0, requestPlaylist: 0, requests: 0 };
  private busy = { player: false, systems: false, schedule: false, playlist: false, requestPlaylist: false, requests: false };
  private requestsOn = false;
  /** The next player answer, or Remote Falcon answer, must not be the hub's
   *  cached copy: something just changed. */
  private fresh = { player: false, requests: false };
  /** Checks in a row made because a song was about to end. */
  private edgeChecks = 0;
  private wake: ReturnType<typeof setTimeout> | null = null;
  private remotesOut = 0;
  private remotesInFlight = new Set<string>();
  /** Boxes that missed once, and when to ask them again. */
  private retries = new Map<string, number>();
  private extrasOut = 0;
  private cursor = 0;
  private roots = new Set<Element>();
  private wantMedia: string[] = [];
  private wantCovers = new Map<string, SongNames>();
  private pendingExtras = new Set<string>();
  private coversOn = true;

  constructor(
    base: string,
    private fetcher: Fetcher,
    private cache: FeedCache | null = null,
    private now: () => number = Date.now,
    private requestsFetcher: RequestsFetcher | null = null,
  ) {
    this.state = {
      base, player: emptyReading(), playerFetchedAt: null, systems: null, remotes: {},
      showName: '', mainPlaylist: '', requestPlaylist: '', lastShowSequence: '', playlistName: '', playlist: null, requests: null, schedule: null, meta: {}, covers: {},
    };
  }

  getState = (): FeedState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  /** A mounted view's root, so the feed can tell when the wall is asleep. */
  attach(el: Element): () => void {
    this.roots.add(el);
    return () => this.roots.delete(el);
  }

  /** Whether Remote Falcon is connected (the plugin setting), so the feed
   *  knows to ask it during the show. */
  setRequests(on: boolean): void {
    if (on === this.requestsOn) return;
    this.requestsOn = on;
    this.due.requests = 0;
    if (!on && this.state.requests) this.set({ requests: null });
  }

  /** The playlist the family picked as their show ('' follows the schedule). */
  setMainPlaylist(name: string): void {
    if (name === this.state.mainPlaylist) return;
    const showName = name || showPlaylistName(this.state.player.status, this.state.requestPlaylist, '');
    this.due.playlist = 0;
    this.set({ mainPlaylist: name, showName, lastShowSequence: showName === this.state.showName ? this.state.lastShowSequence : '' });
  }

  /** Songs a view wants names for (current, next, first up, the cover grid). */
  wantSongs(media: string[]): void {
    this.wantMedia = media.filter(Boolean);
    let seeded = false;
    const meta = { ...this.state.meta };
    for (const m of this.wantMedia) {
      if (m in meta) continue;
      const hit = this.cache?.get(this.metaKey(m));
      if (hit !== undefined) { meta[m] = hit as SongTags | null; seeded = true; }
    }
    if (seeded) this.set({ meta });
  }

  /** Covers a view wants, by the names it shows. */
  wantCoversFor(list: SongNames[], enabled: boolean): void {
    this.coversOn = enabled;
    this.wantCovers.clear();
    if (!enabled) return;
    let seeded = false;
    const covers = { ...this.state.covers };
    for (const names of list) {
      const term = coverSearchTerm(names);
      if (!term) continue;
      this.wantCovers.set(term, names);
      if (term in covers) continue;
      const hit = this.cache?.get(this.coverKey(term));
      if (hit !== undefined) { covers[term] = hit as string | null; seeded = true; }
    }
    if (seeded) this.set({ covers });
  }

  private metaKey = (media: string) => `fpp-meta:${this.state.base}:${media}`;
  private coverKey = (term: string) => `fpp-cover:${term.toLowerCase()}`;

  private start(): void {
    // Coming back (a screen rotated in): ask the player straight away.
    this.due.player = 0;
    this.due.remote = 0;
    this.tick();
    this.timer = setInterval(() => this.tick(), 1000);
  }

  private stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.wake) clearTimeout(this.wake);
    this.wake = null;
  }

  /** The 1 s tick is too coarse for a song change; tick again right when
   *  the next player check is due. */
  private wakeIn(ms: number): void {
    if (!this.timer) return;
    if (this.wake) clearTimeout(this.wake);
    this.wake = setTimeout(() => { this.wake = null; this.tick(); }, ms);
  }

  private set(patch: Partial<FeedState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private asleep(): boolean {
    if (typeof document !== 'undefined' && document.hidden) return true;
    if (this.roots.size === 0) return false;
    for (const r of this.roots) if (!r.closest?.('[data-asleep]')) return false;
    return true;
  }

  private url(path: string): string {
    return `${this.state.base}${path}`;
  }

  /** Exposed for tests; the interval calls it once a second. */
  tick(): void {
    const now = this.now();
    const asleep = this.asleep();
    const status = this.state.player.status;
    const reachable = this.state.player.misses < OFFLINE_AFTER_MISSES;
    const live = isPlaying(status);

    if (!this.busy.player && now >= this.due.player) this.pollPlayer(asleep);
    if (!this.busy.systems && now >= this.due.systems) this.pollSystems();
    if (!asleep && !this.busy.schedule && now >= this.due.schedule) this.pollSchedule();

    if (!this.busy.requestPlaylist && now >= this.due.requestPlaylist) this.pollRequestPlaylist();
    if (this.requestsOn && this.requestsFetcher && !asleep && !this.busy.requests && now >= this.due.requests) this.pollRequests(live);

    const name = this.state.showName;
    if (name && !this.busy.playlist && (name !== this.state.playlistName || now >= this.due.playlist)) {
      this.pollPlaylist(name);
    }

    // Remotes: one at a time, spread over the round. A player that is not
    // answering does not stop them; the cards say what each box says.
    // The first round runs straight through so every card fills right after
    // load; after that each box is asked once per round.
    const remotes = controllersFrom(this.state.systems ?? []).filter((c) => !c.isPlayer);
    const round = remoteRoundMs(live, asleep);
    for (const [id, at] of this.retries) {
      if (now < at || this.remotesOut >= REMOTE_IN_FLIGHT || this.remotesInFlight.has(id)) continue;
      const c = remotes.find((r) => r.id === id);
      this.retries.delete(id);
      if (c) this.checkRemote(c.id, c.address, round, live);
    }
    while (remotes.length && now >= this.due.remote && this.remotesOut < REMOTE_IN_FLIGHT) {
      const firstRound = remotes.some((c) => !this.state.remotes[c.id] && !this.remotesInFlight.has(c.id));
      let c = null;
      for (let i = 0; i < remotes.length && !c; i++) {
        const next = remotes[this.cursor % remotes.length];
        this.cursor = (this.cursor + 1) % remotes.length;
        if (!this.remotesInFlight.has(next.id)) c = next;
      }
      if (!c) break;
      this.checkRemote(c.id, c.address, round, live);
      if (!firstRound) {
        // Step from the last due time, not from this tick, so the 1 s tick
        // does not stretch the round.
        const spacing = round / remotes.length;
        const from = this.due.remote > 0 && now - this.due.remote < spacing ? this.due.remote : now;
        this.due.remote = from + spacing;
        break;
      }
    }

    if (!asleep && reachable) this.fetchExtras();
  }

  private pollPlayer(asleep: boolean): void {
    this.busy.player = true;
    const before = this.state.player;
    const pace = (s: FppStatus | null, reachable: boolean) => {
      const n = (s?.status_name ?? '').toLowerCase();
      return playerEveryMs({ playing: n === 'playing', paused: n === 'paused', reachable, asleep });
    };
    const every = pace(before.status, before.misses < OFFLINE_AFTER_MISSES);
    const fresh = this.fresh.player;
    this.fresh.player = false;
    this.fetcher(this.url('/api/fppd/status'), fresh ? 0 : cacheTtlFor(every))
      .then((data) => {
        const s = data as FppStatus;
        const at = this.now();
        // A new song or playlist is when Remote Falcon's queue moves too.
        const was = before.status;
        if (isPlaying(s) && (s.current_sequence !== was?.current_sequence || s.current_playlist?.playlist !== was?.current_playlist?.playlist)) {
          this.due.requests = 0;
          this.fresh.requests = true;
        }
        const showName = this.state.mainPlaylist || showPlaylistName(s, this.state.requestPlaylist, this.state.showName);
        const onShow = isPlaying(s) && !!showName && s.current_playlist?.playlist === showName && !!s.current_sequence;
        this.set({
          player: applyCheck(this.state.player, { ok: true, status: s }, at, false), playerFetchedAt: at, showName,
          lastShowSequence: onShow ? s.current_sequence!.split('/').pop()! : showName === this.state.showName ? this.state.lastShowSequence : '',
        });
      })
      .catch(() => {
        this.set({ player: applyCheck(this.state.player, { ok: false }, this.now(), false) });
      })
      .finally(() => {
        this.busy.player = false;
        const p = this.state.player;
        const reachable = p.misses < OFFLINE_AFTER_MISSES;
        let next = { inMs: pace(p.status, reachable), fresh: false };
        // Awake and answering: catch the song change, or the show's start, as it happens.
        if (!asleep && reachable) next = playerNextMs(next.inMs, p.status, this.now());
        // A song that will not end (a stuck count) is not asked twice a second for long.
        this.edgeChecks = next.fresh && next.inMs <= EDGE_EVERY_MS ? this.edgeChecks + 1 : 0;
        if (this.edgeChecks > 20) next = { inMs: pace(p.status, reachable), fresh: false };
        this.due.player = this.now() + next.inMs;
        this.fresh.player = next.fresh;
        if (next.inMs % 1000 !== 0 || next.fresh) this.wakeIn(next.inMs);
      });
  }

  private pollSystems(): void {
    this.busy.systems = true;
    this.fetcher(this.url('/api/fppd/multiSyncSystems'), cacheTtlFor(SYSTEMS_EVERY_MS))
      .then((data) => {
        const systems = (data as { systems?: FppSystem[] })?.systems;
        if (!Array.isArray(systems)) throw new Error('no systems');
        this.set({ systems });
        this.due.systems = this.now() + SYSTEMS_EVERY_MS;
      })
      .catch(() => { this.due.systems = this.now() + RETRY_MS; })
      .finally(() => { this.busy.systems = false; });
  }

  private pollSchedule(): void {
    this.busy.schedule = true;
    this.fetcher(this.url('/api/fppd/schedule'), cacheTtlFor(SCHEDULE_EVERY_MS))
      .then((data) => {
        const schedule = (data as { schedule?: FppSchedule })?.schedule;
        if (!schedule || typeof schedule !== 'object') throw new Error('no schedule');
        this.set({ schedule });
        this.due.schedule = this.now() + SCHEDULE_EVERY_MS;
      })
      .catch(() => { this.due.schedule = this.now() + RETRY_MS; })
      .finally(() => { this.busy.schedule = false; });
  }

  /** Which playlist the player's Remote Falcon plugin plays requests from.
   *  A player without the plugin answers with an error, which is fine. */
  private pollRequestPlaylist(): void {
    this.busy.requestPlaylist = true;
    this.due.requestPlaylist = this.now() + REQUEST_PLAYLIST_EVERY_MS;
    this.fetcher(this.url('/api/plugin/remote-falcon/settings/remotePlaylist'), cacheTtlFor(REQUEST_PLAYLIST_EVERY_MS))
      .then((data) => {
        const name = (data as { remotePlaylist?: unknown })?.remotePlaylist;
        this.setRequestPlaylist(typeof name === 'string' ? name : '');
      })
      .catch(() => this.setRequestPlaylist(''))
      .finally(() => { this.busy.requestPlaylist = false; });
  }

  private setRequestPlaylist(name: string): void {
    if (name !== this.state.requestPlaylist) this.set({ requestPlaylist: name });
  }

  /** Every few seconds during the show, for who is waiting. Now and then
   *  the rest of the time, for the song names and covers. */
  private pollRequests(live: boolean): void {
    this.busy.requests = true;
    const fresh = this.fresh.requests;
    this.fresh.requests = false;
    // The show may start while this is out, so the next ask goes by how
    // things stand when the answer lands.
    const liveNow = () => isPlaying(this.state.player.status);
    this.requestsFetcher!(fresh ? 0 : cacheTtlFor(live ? REQUESTS_EVERY_MS : REQUESTS_IDLE_EVERY_MS))
      .then((data) => {
        if (!data || typeof data !== 'object') throw new Error('no show');
        if (this.requestsOn) this.set({ requests: { show: data as RfShow, at: this.now() } });
        this.due.requests = this.now() + (liveNow() ? REQUESTS_EVERY_MS : REQUESTS_IDLE_EVERY_MS);
      })
      // The last answer stays until it is too old to trust (the model decides).
      .catch(() => { this.due.requests = this.now() + (liveNow() ? RETRY_MS : IDLE_RETRY_MS); })
      .finally(() => { this.busy.requests = false; });
  }

  private pollPlaylist(name: string): void {
    this.busy.playlist = true;
    this.fetcher(this.url(`/api/playlist/${encodeURIComponent(name)}`), cacheTtlFor(PLAYLIST_EVERY_MS))
      .then((data) => {
        this.set({ playlist: data as FppPlaylist, playlistName: name });
        this.due.playlist = this.now() + PLAYLIST_EVERY_MS;
      })
      .catch(() => {
        this.set({ playlistName: name });
        this.due.playlist = this.now() + RETRY_MS;
      })
      .finally(() => { this.busy.playlist = false; });
  }

  private checkRemote(id: string, address: string, roundMs: number, playerPlaying: boolean): void {
    this.remotesOut++;
    this.remotesInFlight.add(id);
    timeout(this.fetcher(`${hostBaseUrl(address)}/api/fppd/status`, cacheTtlFor(roundMs)), REMOTE_MISS_AFTER_MS)
      .then(
        (data) => ({ ok: true as const, status: data as FppStatus }),
        () => ({ ok: false as const }),
      )
      .then((result) => {
        const reading = applyCheck(this.state.remotes[id], result, this.now(), playerPlaying);
        if (!result.ok && reading.misses === 1) this.retries.set(id, this.now() + RETRY_AFTER_MISS_MS);
        else this.retries.delete(id);
        this.set({ remotes: { ...this.state.remotes, [id]: reading } });
      })
      .finally(() => {
        this.remotesOut--;
        this.remotesInFlight.delete(id);
        // Still filling the first round: go on without waiting for the tick.
        if (this.timer && Object.keys(this.state.remotes).length < this.remoteCount()) setTimeout(() => this.tick(), 0);
      });
  }

  private remoteCount(): number {
    return controllersFrom(this.state.systems ?? []).filter((c) => !c.isPlayer).length;
  }

  private fetchExtras(): void {
    while (this.extrasOut < EXTRAS_IN_FLIGHT) {
      const media = this.wantMedia.find((m) => !(m in this.state.meta) && !this.pendingExtras.has(`m:${m}`));
      if (media) { this.fetchMeta(media); continue; }
      if (!this.coversOn) return;
      const term = [...this.wantCovers.keys()].find((t) => !(t in this.state.covers) && !this.pendingExtras.has(`c:${t}`));
      if (term) { this.fetchCover(term, this.wantCovers.get(term)!); continue; }
      return;
    }
  }

  private fetchMeta(media: string): void {
    const key = `m:${media}`;
    this.pendingExtras.add(key);
    this.extrasOut++;
    this.fetcher(this.url(`/api/media/${encodeURIComponent(media)}/meta`), 3600_000)
      .then((data) => {
        const t = tagsFromMeta(data);
        const tags = t.title || t.artist || t.album ? t : null;
        this.cache?.set(this.metaKey(media), tags, META_TTL_MS);
        this.set({ meta: { ...this.state.meta, [media]: tags } });
      })
      // A file FPP cannot read is named from its sequence; do not ask again this session.
      .catch(() => this.set({ meta: { ...this.state.meta, [media]: null } }))
      .finally(() => { this.extrasOut--; this.pendingExtras.delete(key); });
  }

  private fetchCover(term: string, names: SongNames): void {
    const key = `c:${term}`;
    this.pendingExtras.add(key);
    this.extrasOut++;
    const q = new URLSearchParams({ term, entity: 'song', media: 'music', limit: '8' });
    this.fetcher(`https://itunes.apple.com/search?${q.toString()}`, 24 * 3600_000)
      .then((data) => {
        const art = pickCover((data as { results?: ItunesTrack[] })?.results, names);
        this.cache?.set(this.coverKey(term), art, COVER_TTL_MS);
        this.set({ covers: { ...this.state.covers, [term]: art } });
      })
      // Apple busy or offline: no cover this session, the note tile stands in.
      .catch(() => this.set({ covers: { ...this.state.covers, [term]: null } }))
      .finally(() => { this.extrasOut--; this.pendingExtras.delete(key); });
  }
}

const feeds = new Map<string, Feed>();

/** The page's one feed for a player (created on first use). */
export function feedFor(base: string, make: (base: string) => Feed): Feed {
  let f = feeds.get(base);
  if (!f) {
    f = make(base);
    feeds.set(base, f);
  }
  return f;
}
