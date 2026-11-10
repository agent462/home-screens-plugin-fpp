import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import systems from '../../test/fixtures/multiSyncSystems.json';
import statuses from '../../test/fixtures/statuses.json';
import schedule from '../../test/fixtures/schedule.json';
import playlist from '../../test/fixtures/playlist-2026.json';
import { Feed, type Fetcher } from './feed';

const ST = statuses as Record<string, unknown>;

/** A fake show: answers like the real one, with switches for dead boxes. */
function fakeShow() {
  const calls: Array<{ url: string; ttl: number }> = [];
  const dead = new Set<string>();
  let playerStatus: Record<string, unknown> = { ...(ST['192.168.0.200'] as object) };
  const fetcher: Fetcher = (url, ttl) => {
    calls.push({ url, ttl });
    const u = new URL(url);
    if (dead.has(u.hostname)) return new Promise(() => {}); // never answers
    if (u.hostname === '192.168.0.200') {
      if (u.pathname === '/api/fppd/status') return Promise.resolve(playerStatus);
      if (u.pathname === '/api/fppd/multiSyncSystems') return Promise.resolve(systems);
      if (u.pathname === '/api/fppd/schedule') return Promise.resolve(schedule);
      if (u.pathname.startsWith('/api/playlist/')) return Promise.resolve(playlist);
      if (u.pathname.startsWith('/api/media/')) return Promise.resolve({ format: { tags: { title: 'Snowman', artist: 'Sia' } } });
    }
    if (u.pathname === '/api/fppd/status' && ST[u.hostname]) return Promise.resolve(ST[u.hostname]);
    if (u.hostname === 'itunes.apple.com') {
      return Promise.resolve({ results: [{ trackName: 'Snowman', artistName: 'Sia', artworkUrl100: 'https://x/100x100bb.jpg' }] });
    }
    return Promise.reject(new Error(`unexpected ${url}`));
  };
  return { fetcher, calls, dead, setPlayer: (s: Record<string, unknown>) => { playerStatus = s; } };
}

let now = Date.parse('2026-11-27T19:42:00-06:00');
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

const settle = async (ms: number) => {
  for (let t = 0; t < ms; t += 250) {
    now += 250;
    await vi.advanceTimersByTimeAsync(250);
  }
};

describe('Feed', () => {
  it('asks the player for status, controllers and schedule first, then every remote once', async () => {
    const show = fakeShow();
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(10_000);
    const paths = show.calls.map((c) => c.url);
    expect(paths.slice(0, 3)).toEqual([
      'http://192.168.0.200/api/fppd/status',
      'http://192.168.0.200/api/fppd/multiSyncSystems',
      'http://192.168.0.200/api/fppd/schedule',
    ]);
    expect(paths.some((p) => p.includes('/api/system/status'))).toBe(false); // never the PHP fan-out
    const s = feed.getState();
    expect(Object.keys(s.remotes)).toHaveLength(18);
    expect(s.playlistName).toBe('2026');
    off();
  });

  it('spreads the remotes over a minute when idle, so each is asked about once', async () => {
    const show = fakeShow();
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(10_000); // first round
    const before = show.calls.length;
    await settle(60_000);
    const remoteCalls = show.calls.slice(before).filter((c) => !c.url.includes('192.168.0.200'));
    expect(remoteCalls.length).toBeGreaterThanOrEqual(17);
    expect(remoteCalls.length).toBeLessThanOrEqual(19);
    // Player while idle: every 5 s, cached by the hub for just under that.
    const playerCalls = show.calls.slice(before).filter((c) => c.url.endsWith('192.168.0.200/api/fppd/status'));
    expect(playerCalls.length).toBeGreaterThanOrEqual(11);
    expect(playerCalls.length).toBeLessThanOrEqual(13);
    expect(playerCalls[0].ttl).toBe(4250);
    off();
  });

  it('asks the player every 2 s while a song plays', async () => {
    const show = fakeShow();
    show.setPlayer({ status_name: 'playing', current_sequence: 'Snowman - Sia.fseq', current_playlist: { playlist: '2026' }, seconds_played: '10', seconds_remaining: '150' });
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(3_000);
    const before = show.calls.filter((c) => c.url.endsWith('200/api/fppd/status')).length;
    await settle(10_000);
    const after = show.calls.filter((c) => c.url.endsWith('200/api/fppd/status')).length;
    expect(after - before).toBeGreaterThanOrEqual(4);
    expect(after - before).toBeLessThanOrEqual(6);
    off();
  });

  it('marks a dead box offline after two misses without stalling the others', async () => {
    const show = fakeShow();
    show.dead.add('192.168.0.110'); // garage
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(10_000);
    const others = Object.entries(feed.getState().remotes).filter(([, r]) => r.status);
    expect(others.length).toBe(17);
    await settle(70_000);
    const garage = Object.values(feed.getState().remotes).find((r) => r.misses >= 2);
    expect(garage).toBeDefined();
    off();
  });

  it('asks a box again 10 s after a miss, so a dead one reads Offline in seconds', async () => {
    const show = fakeShow();
    show.dead.add('192.168.0.113'); // quad props, down from the start
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(25_000);
    const quad = Object.entries(feed.getState().remotes).find(([, r]) => r.misses >= 2);
    expect(quad).toBeDefined();
    const calls = show.calls.filter((c) => c.url.includes('192.168.0.113')).length;
    expect(calls).toBe(2);
    off();
  });

  it('stops polling when the last view goes away', async () => {
    const show = fakeShow();
    const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
    const off = feed.subscribe(() => {});
    await settle(2_000);
    off();
    const n = show.calls.length;
    await settle(60_000);
    expect(show.calls.length).toBe(n);
  });

  it('fetches tags and covers once for the songs a view wants, using the cache first', async () => {
    const show = fakeShow();
    const store = new Map<string, unknown>([['fpp-meta:http://192.168.0.200:02 - All I Want for Christmas Is You.mp3', { title: 'All I Want for Christmas Is You' }]]);
    const cache = { get: (k: string) => store.get(k), set: (k: string, v: unknown) => { store.set(k, v); } };
    const feed = new Feed('http://192.168.0.200', show.fetcher, cache, () => now);
    const off = feed.subscribe(() => {});
    feed.wantSongs(['03 - Snowman.mp3', '02 - All I Want for Christmas Is You.mp3']);
    await settle(3_000);
    const metaCalls = show.calls.filter((c) => c.url.includes('/api/media/'));
    expect(metaCalls).toHaveLength(1);
    expect(feed.getState().meta['03 - Snowman.mp3']).toEqual({ title: 'Snowman', artist: 'Sia', album: undefined });
    feed.wantCoversFor([{ title: 'Snowman', extra: '', artist: 'Sia', album: '' }], true);
    await settle(3_000);
    expect(feed.getState().covers['Snowman Sia']).toBe('https://x/600x600bb.jpg');
    expect(store.get('fpp-cover:snowman sia')).toBe('https://x/600x600bb.jpg');
    off();
  });

  describe('request nights', () => {
    const live = (playlistName: string, sequence: string) => ({
      ...(ST['192.168.0.200'] as object), status_name: 'playing',
      current_playlist: { playlist: playlistName, index: '8', count: '14' }, current_sequence: sequence,
      seconds_played: '10', seconds_remaining: '200',
      scheduler: { status: 'playing', currentPlaylist: { playlistName: '2026' } },
    });

    it('keeps the show playlist while a request playlist is slotted in', async () => {
      const show = fakeShow();
      show.setPlayer(live('2026', 'Youre a Mean One Mr Grinch.fseq'));
      const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now);
      const off = feed.subscribe(() => {});
      await settle(5_000);
      expect(feed.getState()).toMatchObject({ showName: '2026', playlistName: '2026', lastShowSequence: 'Youre a Mean One Mr Grinch.fseq' });

      show.setPlayer(live('2026-RF', 'Christmas Tree Farm - Taylor Swift.fseq'));
      await settle(5_000);
      expect(feed.getState()).toMatchObject({ showName: '2026', playlistName: '2026', lastShowSequence: 'Youre a Mean One Mr Grinch.fseq' });
      expect(show.calls.some((c) => c.url.includes('/api/playlist/2026-RF'))).toBe(false);
      off();
    });

    it('catches a song change as it happens, with a fresh answer from the player and Remote Falcon', async () => {
      const show = fakeShow();
      const ending = { ...live('2026', 'Youre a Mean One Mr Grinch.fseq'), seconds_played: '256', seconds_remaining: '1' };
      show.setPlayer(ending);
      const asked: number[] = [];
      const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now, (ttl) => { asked.push(ttl); return Promise.resolve({}); });
      const off = feed.subscribe(() => {});
      feed.setRequests(true);
      await settle(1_000);
      const before = show.calls.length;
      const requestsBefore = asked.length;

      // The song ends: the next check lands about 1.3 s after the last one, uncached.
      show.setPlayer(live('2026-RF', 'Christmas Tree Farm - Taylor Swift.fseq'));
      await settle(1_500);
      const status = show.calls.slice(before).filter((c) => c.url.endsWith('192.168.0.200/api/fppd/status'));
      expect(status.length).toBeGreaterThanOrEqual(1);
      expect(status[0].ttl).toBe(0);
      expect(feed.getState().player.status?.current_sequence).toBe('Christmas Tree Farm - Taylor Swift.fseq');
      await settle(1_000);
      // Remote Falcon is asked again straight away, past the hub's cache.
      expect(asked.slice(requestsBefore)).toContain(0);
      off();
    });

    it('asks Remote Falcon only when connected and the show is playing, every five seconds', async () => {
      const show = fakeShow();
      let asked = 0;
      const requests = () => { asked++; return Promise.resolve({ preferences: { viewerControlEnabled: true } }); };
      const feed = new Feed('http://192.168.0.200', show.fetcher, null, () => now, requests);
      const off = feed.subscribe(() => {});
      feed.setRequests(true);
      await settle(15_000);
      expect(asked).toBe(0); // connected, but nothing is playing

      show.setPlayer(live('2026', 'Youre a Mean One Mr Grinch.fseq'));
      await settle(40_000);
      expect(asked).toBeGreaterThanOrEqual(6);
      expect(asked).toBeLessThanOrEqual(9);
      expect(feed.getState().requests?.show.preferences?.viewerControlEnabled).toBe(true);

      feed.setRequests(false);
      const before = asked;
      await settle(25_000);
      expect(asked).toBe(before);
      expect(feed.getState().requests).toBeNull();
      off();
    });
  });
});
