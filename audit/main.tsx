/**
 * Audit harness: mounts the REAL plugin component against a fake show that
 * answers like the real one (fixtures read from the player on 2026-11-09), so
 * every view and state can be screenshotted beside the design mockup.
 *
 * URL: ?view=show|player|controllers|strip&scenario=live|wait|done|down&w=1080&h=1920
 * Power (plan 267): &power=1 links outlets through a fake Home Assistant;
 * &garage=off starts Garage with its outlet off, &garage=lost with the outlet
 * on but the controller dark; &ha=down|none; &panel=1 shows the settings
 * panel instead of the wall (&links=none for a first visit).
 * Playwright installs the clock (opening night, or Nov 9 for "wait") and runs
 * it forward so the round robin, misses and offline labels happen for real.
 * Not part of the shipped bundle.
 */
import React from 'react';
import { createRoot } from 'react-dom/client';
import LightShow, { ConfigSection } from '../src/index';
import { controllersFrom } from '../src/lib/systems';
import type { FppSystem } from '../src/lib/fpp-types';
import haSample from '../test/fixtures/ha-outlets.sample.json';
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

// ── A fake Home Assistant (made-up outlets) ──
const withPower = q.get('power') === '1' || q.get('panel') === '1';
const haMode = q.get('ha') ?? 'ok';
const garageMode = q.get('garage') ?? '';
const GARAGE_PLUG = 'switch.garage_plug';
const plugs = new Map<string, { state: string; changed: number }>(
  haSample.rows.map((r) => [r.id, { state: r.state, changed: Date.now() / 1000 - 6 * 60 }]),
);
if (garageMode === 'off') plugs.get(GARAGE_PLUG)!.state = 'off';
let garageBackAt = 0;
const idOf = (host: string) => controllersFrom((systems as { systems: FppSystem[] }).systems).find((c) => c.hostname === host)?.id ?? host;
const fppSettings: Record<string, unknown> = {
  outlets: !withPower || q.get('links') === 'none' ? {} : {
    [idOf('player')]: 'switch.show_player_plug',
    [idOf('arches-left')]: 'switch.arches_strip_socket_1',
    [idOf('arches-right')]: 'switch.arches_strip_socket_1',
    [idOf('garage')]: GARAGE_PLUG,
    [idOf('quad-props')]: 'switch.quad_props_plug',
    ...(q.get('panel') === '1' ? { [idOf('illusion')]: 'switch.illusion_plug' } : {}),
  },
};
const text = (body: string) => Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'text/plain' } }));
function homeAssistant({ url, payload }: { url: string; payload?: string }) {
  if (haMode === 'down') return Promise.resolve(new Response('', { status: 502 }));
  const u = new URL(url);
  const body = JSON.parse(payload ?? '{}') as { template?: string; entity_id?: string };
  if (u.pathname === '/api/template') {
    if ((body.template ?? '').includes('integration_entities')) {
      return text(JSON.stringify(haSample.rows.map((r) => ({ ...r, state: plugs.get(r.id)!.state }))));
    }
    const ids = [...(body.template ?? '').matchAll(/'(switch\.[a-z0-9_]+)'/g)].map((m) => m[1]);
    return text(JSON.stringify(ids.map((id) => {
      const p = plugs.get(id);
      const row = haSample.rows.find((r) => r.id === id);
      return { id, state: p?.state ?? null, name: row?.name ?? null, changed: p?.changed ?? null };
    })));
  }
  const m = /^\/api\/services\/switch\/turn_(on|off)$/.exec(u.pathname);
  if (m && body.entity_id && plugs.has(body.entity_id)) {
    plugs.set(body.entity_id, { state: m[1], changed: Date.now() / 1000 });
    // A controller takes a few seconds to answer after its power is back.
    if (body.entity_id === GARAGE_PLUG && m[1] === 'on') garageBackAt = Date.now() + 6000;
    return text('[]');
  }
  return Promise.resolve(new Response('', { status: 404 }));
}
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
  if (withPower && ip === '192.168.0.110') {
    // Garage answers while its outlet is on (and it has had time to start).
    if (garageMode === 'lost' || plugs.get(GARAGE_PLUG)!.state !== 'on' || Date.now() < garageBackAt) return null;
  } else if (scenario === 'live' && ip === '192.168.0.110' && Date.now() - t0 > 10_000) {
    // Garage answers for its first ten seconds, then goes dark.
    return null;
  }
  if (scenario === 'live') return { ...s, status_name: 'playing', sequence_filename: 'Youre a Mean One Mr Grinch.fseq' };
  return s;
}

const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const fail = () => Promise.resolve(new Response('', { status: 502 }));

function pluginFetch(id: string, { url, payload }: { url: string; payload?: string }) {
  if (id === 'home-assistant') return homeAssistant({ url, payload });
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
  INPUT_CLASS: 'hs-input',
  getPluginSettings: (id: string) => (id === 'fpp' ? structuredClone(fppSettings)
    : id === 'home-assistant' && withPower && haMode !== 'none' ? { haUrl: 'http://homeassistant.local:8123' } : {}),
  setPluginSettings: async (_id: string, updates: Record<string, unknown>) => { Object.assign(fppSettings, updates); return { ok: true }; },
} as unknown as NonNullable<Window['__HS_SDK__']>;

const wall = document.getElementById('wall')!;
wall.style.width = `${W}px`;
wall.style.height = `${H}px`;
const root = document.getElementById('root')!;
root.style.width = '100%';
root.style.height = '100%';

const style = { fontSize: 16, fontFamily: 'inter', textColor: '#f4f6ff', backgroundColor: 'rgba(7, 9, 20, 0.5)', borderRadius: 0, padding: 24, opacity: 1, backdropBlur: 26 };
const config = { playerAddress: '192.168.0.200', view, songNames: 'tags', covers: true, hiddenControllers: [] };
if (q.get('panel') === '1') {
  // The editor's settings panel, at its real width.
  wall.style.cssText = 'width:300px;padding:16px;background:#0e0e0f;border:1px solid #262626;border-radius:10px;font:13px/1.4 Inter,system-ui;color:#e5e5e5;margin:20px';
  createRoot(root).render(<ConfigSection config={config} onChange={() => {}} moduleId="m" screenId="s" />);
} else {
  createRoot(root).render(<LightShow config={config} style={style} />);
}
