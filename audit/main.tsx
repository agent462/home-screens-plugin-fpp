/**
 * Audit harness: mounts the REAL plugin component against a fake show that
 * answers like the real one (fixtures read from the player on 2026-11-09), so
 * every view and state can be screenshotted beside the design mockup.
 *
 * URL: ?view=show|player|controllers|strip&scenario=live|wait|done|down&w=1080&h=1920
 *      &theme=linen|paper|mist|sandstone|vellum|bloom|charcoal|midnight|slate|aurora|obsidian|horizon
 * Power (plan 267): &power=1 links outlets through a fake Home Assistant;
 * &garage=off starts Garage with its outlet off, &garage=lost with the outlet
 * on but the controller dark; &ha=down|none; &panel=1 shows the settings
 * panel instead of the wall (&links=none for a first visit).
 * Request nights (plan 268): &rf=request|between|quiet|vote puts Remote
 * Falcon in that moment (a request playing with three waiting, a show song
 * with one waiting, nobody waiting, a voting night); &rf=alone plays a
 * request with Remote Falcon not connected; &rfpanel=new|on|bad shows that
 * part of the settings. &at=<ISO time> sets the clock without Playwright.
 * Your show: &keep=1 keeps the plugin's settings in the browser, so a name,
 * logo or controller name set in the panel (&panel=1&keep=1) shows on the
 * wall opened next; &keep=clear starts over. &main=<playlist> picks the main
 * show without the panel, and &scenario=pre runs a "Pre-show" playlist
 * before the show. &sub=hours|words|none&tagline=... sets the line under
 * the name.
 * Playwright installs the clock (opening night, or Nov 9 for "wait") and runs
 * it forward so the round robin, misses and offline labels happen for real.
 * Not part of the shipped bundle.
 */
import './clock';
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
import rfShow from '../test/fixtures/rf-show.json';

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
const KEEP = 'audit-fpp-settings';
if (q.get('keep') === 'clear') localStorage.removeItem(KEEP);
const kept = q.get('keep') ? JSON.parse(localStorage.getItem(KEEP) ?? '{}') as Record<string, unknown> : {};
const fppSettings: Record<string, unknown> = {
  ...(q.get('main') ? { show: { mainPlaylist: q.get('main') } } : {}),
  ...kept,
  remoteFalcon: ['request', 'between', 'quiet', 'vote'].includes(q.get('rf') ?? '') || q.get('rfpanel') === 'on',
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

// ── A fake Remote Falcon (the real song list, made-up requests) ──
const rf = q.get('rf') ?? '';
const rfPanel = q.get('rfpanel') ?? '';
const REQUEST_PLAYLIST = '2026-RF';
const rfSeq = (name: string) => rfShow.sequences.find((s) => s.name === name)!;
const TREE = 'Christmas Tree Farm - Taylor Swift';
const WAITING = ['Carol Of The Bells - Lindsey Sterling', 'Let It Go Frozen_Soundtrack', 'Grandma Got Run over by a Reindeer'];
function remoteFalcon(): Record<string, unknown> {
  const voting = rf === 'vote';
  const waiting = rf === 'request' ? WAITING : rf === 'between' ? WAITING.slice(0, 1) : [];
  return {
    ...rfShow,
    preferences: { ...rfShow.preferences, viewerControlMode: voting ? 'VOTING' : 'JUKEBOX' },
    requests: waiting.map((name, i) => ({ sequence: rfSeq(name), position: i + 1 })),
    votes: voting ? [
      { sequence: rfSeq('Tsunami - DVBBS & Borgeous'), votes: 4 },
      { sequence: rfSeq('The Fate of Ophelia - Taylor Swift'), votes: 12 },
      { sequence: rfSeq('Let It Go Frozen_Soundtrack'), votes: 7 },
    ] : [],
    playingNextFromSchedule: 'Youre a Mean One Mr Grinch',
  };
}
/** The player's status while Remote Falcon's playlist is slotted in. */
function requestStatus(live: Record<string, unknown>): Record<string, unknown> {
  const song = rf === 'vote' ? { seq: 'ordinary - alex warren', media: 'Ordinary.mp3', len: 186, at: 61 } : { seq: TREE, media: 'Christmas Tree Farm.mp3', len: 228, at: 94 };
  return {
    ...live,
    current_playlist: { playlist: REQUEST_PLAYLIST, index: '13', count: '53' },
    current_sequence: `${song.seq}.fseq`, current_song: song.media,
    seconds_played: String(song.at), seconds_remaining: String(song.len - song.at),
  };
}

function playerStatus(): Record<string, unknown> | null {
  const idle = ST['192.168.0.200'];
  if (scenario === 'down') return null;
  if (scenario === 'live') {
    const live = liveStatus(idle);
    // The wall first sees the show on song 7, then the request slots in.
    if (rf === 'request' || rf === 'vote' || rf === 'alone') {
      return Date.now() - t0 < 4000
        ? { ...live, current_playlist: { playlist: '2026', index: '7', count: '14' }, current_sequence: 'We Three Kings - Tommee Profitt & We The Kingdom.fseq', current_song: '02 - We Three Kings.mp3', seconds_played: '248', seconds_remaining: '2' }
        : requestStatus(live);
    }
    return live;
  }
  if (scenario === 'pre') {
    // Half an hour before opening night, a pre-show playlist is running.
    return {
      ...idle, status_name: 'playing', status: 1,
      current_playlist: { playlist: 'Pre-show', index: '1', count: '3' }, current_sequence: 'Tune To Sign.fseq', current_song: '',
      seconds_played: '20', seconds_remaining: '40',
      scheduler: { status: 'playing', currentPlaylist: { playlistName: 'Pre-show', scheduledEndTime: at('2026-11-27T17:00:00-06:00') }, nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-27T17:00:00-06:00') } },
    };
  }
  if (scenario === 'done') {
    return { ...idle, scheduler: { status: 'idle', nextPlaylist: { playlistName: '2026', scheduledStartTime: at('2026-11-28T17:00:00-06:00') } } };
  }
  return idle;
}

function liveStatus(idle: Record<string, unknown>): Record<string, unknown> {
  // Opening night, or the first request night when Remote Falcon is in play.
  const day = rf ? '2026-11-30' : '2026-11-27';
  const next = rf ? '2026-12-01' : '2026-11-28';
  return {
    ...idle, status_name: 'playing', status: 1,
    current_playlist: { playlist: '2026', index: '8', count: '14' },
    current_sequence: 'Youre a Mean One Mr Grinch.fseq', current_song: "01 - You're a Mean One, Mr. Grinch.mp3",
    seconds_played: '94', seconds_remaining: String(Math.round(257.525 - 94)),
    scheduler: { status: 'playing', currentPlaylist: { playlistName: '2026', scheduledEndTime: at(`${day}T23:00:00-06:00`) }, nextPlaylist: { playlistName: '2026', scheduledStartTime: at(`${next}T17:00:00-06:00`) } },
  };
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
  if (scenario === 'pre') return { ...s, status_name: 'playing', sequence_filename: 'Tune To Sign.fseq' };
  return s;
}

const json = (data: unknown) => Promise.resolve(new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } }));
const fail = () => Promise.resolve(new Response('', { status: 502 }));

function pluginFetch(id: string, { url, payload }: { url: string; payload?: string }) {
  if (id === 'home-assistant') return homeAssistant({ url, payload });
  const u = new URL(url);
  if (u.hostname === 'remotefalcon.com') {
    if (rfPanel === 'bad' && !fppSettings.remoteFalcon) return Promise.resolve(new Response('', { status: 401 }));
    return json(remoteFalcon());
  }
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
    if (u.pathname === '/api/playlists') return json(['2026', REQUEST_PLAYLIST, 'Pre-show', 'Test']);
    if (u.pathname.startsWith('/api/playlist/')) return decodeURIComponent(u.pathname).endsWith('/2026') ? json(playlist) : json({ name: 'Pre-show', mainPlaylist: [{ type: 'sequence', enabled: 1, sequenceName: 'Tune To Sign.fseq', duration: 60 }] });
    if (u.pathname === '/api/plugin/remote-falcon/settings/remotePlaylist') return json({ status: 'OK', remotePlaylist: REQUEST_PLAYLIST });
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
  setPluginSettings: async (_id: string, updates: Record<string, unknown>) => {
    // The hub keeps a plugin's settings in 32 KB, and so does this.
    if (JSON.stringify({ ...fppSettings, ...updates }).length > 32 * 1024) return { ok: false, error: 'Settings payload too large' };
    Object.assign(fppSettings, updates);
    if (q.get('keep')) localStorage.setItem(KEEP, JSON.stringify({ show: fppSettings.show, controllers: fppSettings.controllers }));
    return { ok: true };
  },
} as unknown as NonNullable<Window['__HS_SDK__']>;

const wall = document.getElementById('wall')!;
wall.style.width = `${W}px`;
wall.style.height = `${H}px`;
const root = document.getElementById('root')!;
root.style.width = '100%';
root.style.height = '100%';

const style = { fontSize: 16, fontFamily: 'inter', textColor: '#f4f6ff', backgroundColor: 'rgba(7, 9, 20, 0.5)', borderRadius: 0, padding: 24, opacity: 1, backdropBlur: 26 };
const config = {
  playerAddress: q.get('player') ?? '192.168.0.200', view, theme: q.get('theme') ?? undefined, songNames: 'tags', covers: true, hiddenControllers: [],
  subtitle: q.get('sub') ?? undefined, tagline: q.get('tagline') ?? undefined,
};
// The hub's secret store, for the settings panel's Connect and Disconnect.
const realFetch = window.fetch.bind(window);
window.fetch = (input, init) => (String(input).startsWith('/api/plugins/secrets/')
  ? Promise.resolve(new Response('{"ok":true}', { status: 200 }))
  : realFetch(input, init));

if (q.get('panel') === '1' || rfPanel) {
  // The editor's settings panel, at its real width.
  wall.style.cssText = 'width:300px;padding:16px;background:#0e0e0f;border:1px solid #262626;border-radius:10px;font:13px/1.4 Inter,system-ui;color:#e5e5e5;margin:20px';
  // Holds the module's own settings the way the editor does.
  const Panel = () => {
    const [cfg, setCfg] = React.useState<Record<string, unknown>>(config);
    return <ConfigSection config={cfg} onChange={(u) => setCfg((c) => ({ ...c, ...u }))} moduleId="m" screenId="s" />;
  };
  createRoot(root).render(<Panel />);
} else {
  createRoot(root).render(<LightShow config={config} style={style} />);
}
