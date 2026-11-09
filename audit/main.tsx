/**
 * Audit harness: mounts the REAL plugin component against a fake show that
 * answers like the real one (fixtures read from the player on 2026-11-09), so
 * every view and state can be screenshotted beside the design mockup.
 *
 * URL: ?view=show|player|controllers|strip&scenario=live|wait|done|down&w=1080&h=1920
 * Playwright installs the clock (opening night, or Nov 9 for "wait") and runs
 * it forward so the round robin, misses and offline labels happen for real.
 * Not part of the shipped bundle.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import LightShow from '../src/index';
import systems from '../test/fixtures/multiSyncSystems.json';
import statuses from '../test/fixtures/statuses.json';
import schedule from '../test/fixtures/schedule.json';
import playlist from '../test/fixtures/playlist-2026.json';
import tags from '../test/fixtures/song-tags.json';

const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'show';
const scenario = q.get('scenario') ?? 'live';
const W = Number(q.get('w') ?? 1080);
const H = Number(q.get('h') ?? 1920);
const t0 = Date.now();

const ST = statuses as Record<string, Record<string, unknown>>;
const at = (iso: string) => Date.parse(iso) / 1000;

function playerStatus(): Record<string, unknown> | null {
  const idle = ST['192.168.0.200'];
  if (scenario === 'down') return null;
  if (scenario === 'live') {
    return {
      ...idle, status_name: 'playing', status: 1,
      current_playlist: { playlist: '2026', index: '8', count: '14' },
      current_sequence: 'Youre a Mean One Mr Grinch.fseq', current_song: "01 - You're a Mean One, Mr. Grinch.mp3",
      seconds_played: '94', seconds_remaining: String(Math.round(257.525 - 94)),
      scheduler: { status: 'playing', currentPlaylist: { playlistName: '2026', scheduledEndTime: at('2026-11-27T23:00:00-06:00') }, nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-28T17:00:00-06:00') } },
    };
  }
  if (scenario === 'done') {
    return { ...idle, scheduler: { status: 'idle', nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-28T17:00:00-06:00') } } };
  }
  return idle;
}

function remoteStatus(ip: string): Record<string, unknown> | null {
  const s = ST[ip];
  if (!s) return null;
  // Garage answers for its first ten seconds, then goes dark.
  if (scenario === 'live' && ip === '192.168.0.110' && Date.now() - t0 > 10_000) return null;
  if (scenario === 'live') return { ...s, status_name: 'playing', sequence_filename: 'Youre a Mean One Mr Grinch.fseq' };
  return s;
}

const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const fail = () => Promise.resolve(new Response('', { status: 502 }));

function pluginFetch(_id: string, { url }: { url: string }) {
  const u = new URL(url);
  if (u.hostname === 'itunes.apple.com') {
    const term = u.searchParams.get('term') ?? '';
    // Apple's answer for each song, as recorded from the real search.
    const sq = (x: string) => x.toLowerCase().replace(/\(.*$/, '').replace(/[^a-z0-9]/g, '');
    const hit = tags.find((t) => t.art && sq(t.title || t.itunesTrack) && sq(term).startsWith(sq(t.title || t.itunesTrack)));
    return json({ results: hit ? [{ trackName: hit.itunesTrack, artistName: hit.itunesArtist, artworkUrl100: `${location.origin}${location.pathname.replace(/[^/]*$/, '')}art/${hit.art}/100x100bb.jpg` }] : [] });
  }
  if (u.hostname === '192.168.0.200') {
    if (u.pathname === '/api/fppd/status') { const s = playerStatus(); return s ? json(s) : fail(); }
    if (scenario === 'down') return fail();
    if (u.pathname === '/api/fppd/multiSyncSystems') return json(systems);
    if (u.pathname === '/api/fppd/schedule') return json(schedule);
    if (u.pathname.startsWith('/api/playlist/')) return json(playlist);
    if (u.pathname.startsWith('/api/media/')) {
      const file = decodeURIComponent(u.pathname.slice('/api/media/'.length).replace(/\/meta$/, ''));
      const t = tags.find((x) => x.media === file);
      return t ? json({ format: { tags: { title: t.title, artist: t.artist, album: t.album } } }) : fail();
    }
  }
  if (u.pathname === '/api/fppd/status') { const s = remoteStatus(u.hostname); return s ? json(s) : fail(); }
  return fail();
}

const cache = new Map<string, { data: unknown; stale: boolean; fetchedAt: number }>();
(window as unknown as { React: typeof React }).React = React;
window.__HS_SDK__ = {
  pluginFetch,
  displayCache: {
    get: (k: string) => cache.get(k) ?? null,
    set: (k: string, data: unknown) => { cache.set(k, { data, stale: false, fetchedAt: Date.now() }); },
    prefetch: async () => {},
  },
  getHostSettings: () => ({ timezone: 'America/Chicago', units: 'imperial', latitude: null, longitude: null, displayWidth: W, displayHeight: H, appVersion: 'harness' }),
  locale: 'en-US',
} as unknown as NonNullable<Window['__HS_SDK__']>;

const wall = document.getElementById('wall')!;
wall.style.width = `${W}px`;
wall.style.height = `${H}px`;
const root = document.getElementById('root')!;
root.style.width = '100%';
root.style.height = '100%';

const style = { fontSize: 16, fontFamily: 'inter', textColor: '#f4f6ff', backgroundColor: 'rgba(7, 9, 20, 0.5)', borderRadius: 0, padding: 24, opacity: 1, backdropBlur: 26 };
createRoot(root).render(
  <LightShow config={{ playerAddress: '192.168.0.200', view, songNames: 'tags', covers: true, hiddenControllers: [] }} style={style} />,
);
