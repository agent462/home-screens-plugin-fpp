import React from 'react';
import type { ControllerView, ShowModel, SongView } from '../data/model';
import { clockText, mmss, temperature, uptimeText, type Units } from '../lib/format';
import { namesSentence } from '../lib/health';
import { readingNames } from '../lib/sensors';
import { namesFromFile } from '../lib/songs';
import { BrandMark, Icon } from './icons';
import { useNow } from './hooks';
import { PowerSection, type PowerLink } from './power';
import { C, clamp, E, ellipsis, kicker, mix, outline, tnum, TONE, type ToneName } from './tokens';

export interface Env {
  units: Units;
  timeZone: string;
  locale: string;
  now: number;
  address: string;
}

// ── Header and pill ─────────────────────────────────────────────────────────

export function Header({ sub, pill }: { sub: string; pill: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: E(20), minHeight: E(84), flex: 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: E(18), minWidth: 0 }}>
        <BrandMark width={E(78)} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: E(40), fontWeight: 750, letterSpacing: '-.02em', lineHeight: 1 }}>Light Show</div>
          <div style={{ fontSize: E(23), color: C.ink2, marginTop: E(7), fontWeight: 500, ...ellipsis }}>{sub}</div>
        </div>
      </div>
      {pill}
    </div>
  );
}

export function Pill({ tone, text, small }: { tone: ToneName; text: string; small?: boolean }) {
  const t = TONE[tone];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: E(12), height: E(small ? 46 : 56), padding: `0 ${E(small ? 18 : 24)}`,
      borderRadius: 999, fontSize: E(small ? 20 : 24), fontWeight: 650, whiteSpace: 'nowrap', flex: 'none',
      background: t.bg, border: `1px solid ${t.border}`, color: t.text,
    }}>
      <span style={{
        width: E(small ? 11 : 14), height: E(small ? 11 : 14), borderRadius: '50%', background: t.dot,
        boxShadow: tone === 'ok' ? `0 0 0 ${E(6)} rgba(94,224,143,.18), 0 0 ${E(18)} rgba(94,224,143,.8)` : undefined,
      }} />
      {text}
    </span>
  );
}

/** The header pill for the show views. */
export function showPill(m: ShowModel, env: Env, small = false): React.ReactNode {
  if (!m.hasData) return null;
  if (!m.reachable) return <Pill tone="bad" text="Not answering" small={small} />;
  const p = m.phase;
  if (p.kind === 'playing') {
    if (p.paused) return <Pill tone="gold" text="Paused" small={small} />;
    return <Pill tone="ok" text={p.endsAt && !small ? `Live until ${clockText(p.endsAt, env.timeZone, env.locale)}` : 'Live'} small={small} />;
  }
  if (p.kind === 'waiting') {
    const today = new Date(p.nextAt).toDateString() === new Date(env.now).toDateString();
    const when = today
      ? clockText(p.nextAt, env.timeZone, env.locale)
      : new Intl.DateTimeFormat(env.locale, { timeZone: env.timeZone, month: 'short', day: 'numeric' }).format(p.nextAt);
    return <Pill tone="gold" text={`Starts ${when}`} small={small} />;
  }
  if (p.kind === 'done') return <Pill tone="unknown" text="Done for tonight" small={small} />;
  return <Pill tone="unknown" text="No show scheduled" small={small} />;
}

export function headerSub(env: Env): string {
  try {
    const day = new Intl.DateTimeFormat(env.locale, { timeZone: env.timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(env.now);
    return `${day} · ${clockText(env.now, env.timeZone, env.locale)}`;
  } catch {
    return '';
  }
}

// ── Covers ──────────────────────────────────────────────────────────────────

export function Cover({ url, size, radius, shadow = true, style }: { url: string | null; size: string; radius: string; shadow?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, flex: 'none', backgroundSize: 'cover', backgroundPosition: 'center',
      backgroundImage: url ? `url("${url}")` : 'linear-gradient(140deg,#3b2a6b,#1c3d6e 55%,#0f5a5a)',
      boxShadow: shadow ? `0 ${E(26)} ${E(60)} rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.10)` : '0 0 0 1px rgba(255,255,255,.1)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,.85)', ...style,
    }}>
      {!url && <Icon name="music" size="42%" />}
    </div>
  );
}

export function Mosaic({ songs, size, gap = E(8), radius = E(26) }: { songs: SongView[]; size: string; gap?: string; radius?: string }) {
  // Nine different covers from across the playlist; plain tiles only when
  // there are not enough (songs share albums, some have no cover).
  const covers = [...new Set(songs.map((s) => s.cover).filter((u): u is string => !!u))];
  const tiles = Array.from({ length: 9 }, (_, i) => covers[i] ?? null);
  return (
    <div style={{
      width: size, height: size, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap,
      borderRadius: radius, overflow: 'hidden', boxShadow: `0 ${E(26)} ${E(60)} rgba(0,0,0,.5)`,
    }}>
      {tiles.map((u, i) => (
        <i key={i} style={{
          display: 'block', backgroundSize: 'cover', backgroundPosition: 'center',
          backgroundImage: u ? `url("${u}")` : `linear-gradient(${140 + i * 25}deg,#3b2a6b,#1c3d6e 55%,#0f5a5a)`,
        }} />
      ))}
    </div>
  );
}

/** The cover, blurred, behind a card or the whole module. A still layer. */
export function Backdrop({ url, blur, opacity, shade, inset }: { url: string | null; blur: string; opacity: number; shade: string; inset: string }) {
  return (
    <>
      {url && (
        <div aria-hidden="true" style={{
          position: 'absolute', inset, backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center',
          filter: `blur(${blur}) saturate(1.5)`, opacity, pointerEvents: 'none',
        }} />
      )}
      <div aria-hidden="true" style={{ position: 'absolute', inset: 0, background: shade, pointerEvents: 'none' }} />
    </>
  );
}

// ── Song progress ───────────────────────────────────────────────────────────

/** Seconds into the current song right now: the last status plus the time
 *  since it arrived, so the bar moves between polls. */
export function liveElapsed(m: ShowModel, now: number): number {
  if (m.phase.kind !== 'playing' || m.phase.paused || m.statusAt === null) return m.elapsed;
  return Math.min(m.duration || Infinity, m.elapsed + Math.max(0, now - m.statusAt) / 1000);
}

/** Only these re-render every second while a song plays; the rest of the
 *  view refreshes on the slow tick. */
export function LiveProgress({ m, barH, font }: { m: ShowModel; barH?: number; font?: number }) {
  const now = useNow(1000, m.phase.kind === 'playing' && !m.phase.paused);
  return <Progress elapsed={liveElapsed(m, now)} duration={m.duration} barH={barH} font={font} />;
}

export function LiveSegments({ m, font }: { m: ShowModel; font?: number }) {
  const now = useNow(1000, m.phase.kind === 'playing' && !m.phase.paused);
  // While a request plays the bar waits at the show's next song.
  if (m.requests.playing) return <Segments m={m} index={m.showIndex} elapsed={0} hold font={font} />;
  return <Segments m={m} index={m.current?.index ?? -1} elapsed={liveElapsed(m, now)} font={font} />;
}

// ── Request and voting nights ───────────────────────────────────────────────

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The tag beside "Now playing" for a song that is not the show's own. */
export function playingTag(m: ShowModel): string | null {
  if (!m.requests.playing) return null;
  return m.requests.connected && m.requests.mode === 'voting' ? 'Voted in' : 'Request';
}

/** "Requests open · 3 waiting", or null when Remote Falcon is not saying. */
export function requestsNote(m: ShowModel): string | null {
  const r = m.requests;
  if (!r.connected || !r.open) return null;
  if (r.mode === 'voting') return r.totalVotes ? `Voting open · ${plural(r.totalVotes, 'vote')}` : 'Voting open';
  return r.waiting ? `Requests open · ${r.waiting} waiting` : 'Requests open';
}

/** The song ahead in the vote, when there is one. */
export const voteLeader = (m: ShowModel): SongView | null =>
  (m.requests.connected && m.requests.mode === 'voting' ? m.requests.standings[0] ?? null : null);

/** What the "Up next" list shows: the vote on a voting night, otherwise the
 *  real order (waiting requests, then the show's songs). */
export function nextList(m: ShowModel, rows: number): { label: string; right?: string; songs: SongView[] } {
  if (voteLeader(m)) return { label: 'The vote so far', right: plural(m.requests.totalVotes, 'vote'), songs: m.requests.standings.slice(0, rows) };
  return { label: 'Up next', right: m.requests.waiting ? `${plural(m.requests.waiting, 'request')} waiting` : undefined, songs: m.upNext.slice(0, rows) };
}

export const votesText = (s: SongView) => plural(s.votes ?? 0, 'vote');

export function Tag({ text, small }: { text: string; small?: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', height: E(small ? 24 : 30), padding: `0 ${E(small ? 10 : 13)}`, borderRadius: 999, marginLeft: E(6),
      fontSize: E(small ? 13 : 16), fontWeight: 780, letterSpacing: '.1em', textTransform: 'uppercase', color: '#06202e', background: C.ice, whiteSpace: 'nowrap', flex: 'none',
    }}>{text}</span>
  );
}


export function Progress({ elapsed, duration, barH = 12, font = 24 }: { elapsed: number; duration: number; barH?: number; font?: number }) {
  const pct = duration > 0 ? Math.min(100, (elapsed / duration) * 100) : 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: E(14) }}>
      <div style={{ height: E(barH), borderRadius: 99, background: 'rgba(255,255,255,.16)', overflow: 'hidden' }}>
        <i style={{ display: 'block', height: '100%', width: `${pct}%`, borderRadius: 99, background: 'linear-gradient(90deg,#fff2cf,#ffffff)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: E(font), color: C.ink2, fontWeight: 550, ...tnum }}>
        <span>{mmss(elapsed)}</span>
        <span>-{mmss(Math.max(0, duration - elapsed))}</span>
      </div>
    </div>
  );
}

/** "2026" → "2026 playlist"; a name that already says playlist stays. */
export const playlistWords = (name: string) => (/playlist/i.test(name) ? name : `${name} playlist`);

/** The playlist as segments, each sized to its song. */
export function Segments({ m, index, elapsed, upcoming, hold, font = 21 }: { m: ShowModel; index: number; elapsed: number; upcoming?: boolean; hold?: boolean; font?: number }) {
  if (m.songs.length === 0) return null;
  const total = m.songs.reduce((t, s) => t + s.duration, 0);
  const done = m.songs.slice(0, Math.max(0, index)).reduce((t, s) => t + s.duration, 0) + (index >= 0 ? elapsed : 0);
  const left = Math.max(0, Math.round((total - done) / 60));
  const note = upcoming ? null : requestsNote(m);
  const strong: React.CSSProperties = { color: C.ink2, fontWeight: 650 };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: E(12) }}>
      <div style={{ display: 'flex', gap: E(5), height: E(16) }}>
        {m.songs.map((s, i) => {
          const state = upcoming ? 'up' : i < index ? 'done' : i === index ? (hold ? 'hold' : 'cur') : 'up';
          return (
            <span key={i} style={{
              flex: Math.max(1, Math.round(s.duration)), borderRadius: E(5), position: 'relative', overflow: 'hidden',
              background: state === 'done' ? 'rgba(255,255,255,.52)' : state === 'hold' ? 'rgba(143,216,255,.18)' : state === 'cur' ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.14)',
              boxShadow: state === 'hold' ? `inset 0 0 0 ${E(2)} ${C.ice}` : undefined,
            }}>
              {state === 'cur' && <b style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(100, (elapsed / Math.max(1, s.duration)) * 100)}%`, background: C.gold }} />}
            </span>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: E(16), fontSize: E(font), color: C.ink3, fontWeight: 550, ...tnum }}>
        <span style={ellipsis}>
          {hold
            ? <><b style={strong}>{playingTag(m) === 'Voted in' ? 'Vote winner playing' : 'Request playing'}</b>{index >= 0 ? (font < 21 && note ? ` · then song ${index + 1} of ${m.songs.length}` : ` · the show picks up at song ${index + 1} of ${m.songs.length}`) : ''}</>
            : upcoming || index < 0
              ? <><b style={strong}>{m.playlistName ? playlistWords(m.playlistName) : 'Playlist'}</b> · {m.songs.length} songs</>
              : <><b style={strong}>Song {index + 1} of {m.songs.length}</b>{m.playlistName ? ` · ${playlistWords(m.playlistName)}` : ''}</>}
        </span>
        {note
          ? (
            <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: E(10), color: '#bfe8ff', fontWeight: 600 }}>
              <i style={{ width: E(10), height: E(10), borderRadius: '50%', background: C.ice, boxShadow: `0 0 0 ${E(5)} rgba(143,216,255,.16)` }} />{note}
            </span>
          )
          // Requests slot in between songs, so "until it starts over" would not hold.
          : !hold && <span style={{ flex: 'none' }}>{upcoming || index < 0 ? `${Math.round(total / 60)} min` : `${left} min until it starts over`}</span>}
      </div>
    </div>
  );
}

export function Queue({ label, right, songs, art = 72, title = 28, sub = 21 }: { label: string; right?: string; songs: SongView[]; art?: number; title?: number; sub?: number }) {
  if (songs.length === 0) return null;
  const compact = art < 72;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: E(16), marginBottom: E(8) }}>
        <span style={{ fontSize: E(compact ? 17 : 20), fontWeight: 700, letterSpacing: '.14em', textTransform: 'uppercase', color: C.ink3 }}>{label}</span>
        {right && <span style={{ fontSize: E(compact ? 18 : 21), fontWeight: 600, color: '#bfe8ff', ...tnum }}>{right}</span>}
      </div>
      {songs.map((s, i) => (
        <div key={`${i}-${s.index}-${s.song.sequence}`} style={{ display: 'flex', alignItems: 'center', gap: E(20), padding: `${E(12)} 0`, borderTop: `1px solid ${C.line}` }}>
          <Cover url={s.cover} size={E(art)} radius={E(14)} shadow={false} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: E(title), fontWeight: 620, ...ellipsis }}>{s.names.title}</div>
            {s.names.artist && <div style={{ fontSize: E(sub), color: C.ink3, marginTop: E(3), ...ellipsis }}>{s.names.artist}</div>}
          </div>
          {s.request && (
            <span style={{
              fontSize: E(compact ? 14 : 16), fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ice, flex: 'none', whiteSpace: 'nowrap',
              padding: `${E(compact ? 4 : 5)} ${E(compact ? 10 : 12)}`, borderRadius: 999, background: 'rgba(143,216,255,.1)', ...outline('rgba(143,216,255,.4)'),
            }}>Request</span>
          )}
          {s.votes !== undefined
            ? <span style={{ fontSize: E(compact ? 21 : 23), fontWeight: 650, color: i === 0 ? C.gold : C.ink2, flex: 'none', ...tnum }}>{votesText(s)}</span>
            : s.song.duration > 0 && <span style={{ fontSize: E(compact ? 21 : 23), color: C.ink3, fontWeight: 550, flex: 'none', ...tnum }}>{mmss(s.song.duration)}</span>}
        </div>
      ))}
    </div>
  );
}

// ── Health tiles ────────────────────────────────────────────────────────────

/** "Quad Props", "Quad Props and Roof", "3 controllers". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} controllers`;
}

export function StatTiles({ m, env, style }: { m: ShowModel; env: Env; style?: React.CSSProperties }) {
  const s = m.summary;
  const live = m.phase.kind === 'playing';
  const remotes = m.controllers.filter((c) => !c.c.isPlayer).length;
  const offline = s.offlineNames.length;
  const syncShort = live && s.remotesPlaying < s.remotesOnline;
  const tiles: Array<{ v: React.ReactNode; of?: string; l: string; n: string; tone?: 'ok' | 'warn' | 'bad' }> = [
    {
      v: s.online, of: `/ ${s.total}`, l: s.online === s.total ? 'All online' : 'Online',
      n: offline ? `${listNames(s.offlineNames)} offline`
        : s.poweredOffNames.length ? `${listNames(s.poweredOffNames)} switched off`
        : s.online < s.total ? 'Still checking' : 'Every controller',
      tone: offline ? 'bad' : s.online === s.total ? 'ok' : undefined,
    },
    live
      ? { v: s.remotesPlaying, of: `/ ${s.remotesOnline}`, l: 'In sync', n: 'With the player', tone: syncShort ? 'warn' : 'ok' }
      : { v: s.remotesOnline, of: `/ ${remotes}`, l: 'Ready', n: 'For the show', tone: offline ? 'warn' : s.remotesOnline === remotes ? 'ok' : undefined },
    { v: s.warningNames.length, l: s.warningNames.length === 1 ? 'Warning' : s.warningNames.length ? 'Warnings' : 'No warnings', n: s.warningNames.length ? listNames(s.warningNames) : 'All clear', tone: s.warningNames.length ? 'warn' : undefined },
    { v: s.warmest ? `${temperature(s.warmest.celsius, env.units)}°` : '–', l: 'Warmest', n: s.warmest?.name ?? '' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: E(16), flex: 'none', ...style }}>
      {tiles.map((t, i) => {
        const tone = t.tone === 'warn' ? TONE.warn : t.tone === 'bad' ? TONE.bad : null;
        return (
          <div key={i} style={{
            borderRadius: E(26), background: tone ? tone.bg : C.glass, border: `1px solid ${tone ? tone.border : C.line}`,
            padding: `${E(16)} ${E(20)}`, display: 'flex', flexDirection: 'column', gap: E(6), minWidth: 0, justifyContent: 'center',
          }}>
            <div style={{ fontSize: E(42), fontWeight: 760, letterSpacing: '-.02em', lineHeight: 1.05, display: 'flex', alignItems: 'baseline', gap: E(6), color: t.tone === 'ok' ? C.okText : tone?.text, ...tnum }}>
              {t.v}{t.of && <small style={{ fontSize: E(26), color: C.ink3, fontWeight: 650 }}>{t.of}</small>}
            </div>
            <div style={{ fontSize: E(20), color: C.ink2, fontWeight: 600, ...ellipsis }}>{t.l}</div>
            <div style={{ fontSize: E(19), color: C.ink3, fontWeight: 550, marginTop: E(-4), ...ellipsis }}>{t.n}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Controller cards ────────────────────────────────────────────────────────

const toneOf = (v: ControllerView): ToneName => v.health.tone === 'unknown' ? 'unknown' : v.health.tone;

function Dot({ v, size = 13 }: { v: ControllerView; size?: number }) {
  const t = TONE[toneOf(v)];
  // Switched off at the outlet: a hollow grey ring, not a red alarm.
  if (v.health.poweredOff) {
    return <span style={{ width: E(size), height: E(size), borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: `${E(3)} solid ${C.idle}` }} />;
  }
  return <span style={{
    width: E(size), height: E(size), borderRadius: '50%', flex: 'none', background: t.dot,
    boxShadow: v.health.offline ? `0 0 0 ${E(5)} rgba(255,107,107,.18)` : undefined,
  }} />;
}

function cardFrame(v: ControllerView): React.CSSProperties {
  const h = v.health;
  const base: React.CSSProperties = {
    position: 'relative', borderRadius: E(22), background: C.glass, ...outline(C.line), minWidth: 0, minHeight: 0,
    overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', cursor: 'pointer',
    textAlign: 'left', color: 'inherit', font: 'inherit',
  };
  if (h.poweredOff) return { ...base, background: mix(3) };
  if (h.offline) return { ...base, background: 'rgba(255,107,107,.07)', borderColor: 'rgba(255,107,107,.40)' };
  if (h.tone === 'warn') return { ...base, borderColor: h.reason === 'warning' ? 'rgba(251,191,36,.42)' : 'rgba(251,191,36,.30)' };
  if (v.c.isPlayer) return { ...base, background: 'linear-gradient(135deg, rgba(255,207,107,.13), rgba(255,207,107,.04))', borderColor: 'rgba(255,207,107,.30)' };
  return base;
}

const Badge = () => (
  <span style={{ fontSize: E(15), fontWeight: 750, letterSpacing: '.1em', textTransform: 'uppercase', color: '#1a1408', background: C.gold, borderRadius: 99, padding: `${E(3)} ${E(9)}`, flex: 'none' }}>Player</span>
);

function Label({ v }: { v: ControllerView }) {
  if (!v.health.label) return null;
  const t = TONE[toneOf(v)];
  return <span style={{ fontSize: E(19), fontWeight: 700, whiteSpace: 'nowrap', color: v.health.poweredOff ? '#c5cede' : t.text, flex: 'none' }}>{v.health.label}</span>;
}

function lastHeard(v: ControllerView, env: Env): string {
  if (v.health.poweredOff) {
    return v.health.offSince ? `Off since ${clockText(v.health.offSince, env.timeZone, env.locale)}` : 'Switched off at the outlet';
  }
  const at = v.reading.lastOkAt;
  return at ? `Last heard ${clockText(at, env.timeZone, env.locale)}` : 'Not heard from yet';
}

export function Card({ v, env, onOpen, pad = [14, 18, 13, 20] }: { v: ControllerView; env: Env; onOpen: (id: string) => void; pad?: number[] }) {
  const s = v.health.sensors;
  const checking = !v.reading.status && !v.health.offline;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(v.c.id)} style={{ ...cardFrame(v), padding: pad.map(E).join(' ') }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: E(12), minWidth: 0 }}>
          <Dot v={v} />
          <span style={{ fontSize: E(26), fontWeight: 660, letterSpacing: '-.01em', flex: 1, minWidth: 0, opacity: v.health.poweredOff ? 0.7 : undefined, ...ellipsis }}>{v.c.name}</span>
          {v.c.isPlayer && <Badge />}
          <Label v={v} />
        </div>
        <div style={{ fontSize: E(19), color: C.ink3, marginTop: E(2), paddingLeft: E(25), fontWeight: 500, ...ellipsis, ...tnum }}>
          {v.c.address} · {v.c.cape}
        </div>
      </div>
      <div style={{ display: 'flex', gap: E(16), paddingLeft: E(25), fontSize: E(20), color: C.ink2, fontWeight: 600, whiteSpace: 'nowrap', opacity: v.health.poweredOff ? 0.7 : undefined, ...tnum }}>
        {v.health.offline ? <span>{lastHeard(v, env)}</span>
          : checking ? <span style={{ color: C.ink3 }}>Checking…</span>
          : <>
            {s.hottest !== null && <Metric icon="therm" text={`${temperature(s.hottest, env.units)}°`} warn={s.hot} />}
            {s.lowestSupply !== null && <Metric icon="zap" text={`${s.lowestSupply.toFixed(1)} V`} warn={s.lowPower} />}
          </>}
      </div>
    </div>
  );
}

function Metric({ icon, text, warn }: { icon: 'therm' | 'zap'; text: string; warn: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: E(6), color: warn ? '#ffd56b' : undefined }}>
      <Icon name={icon} size={E(19)} style={{ opacity: warn ? 1 : 0.75 }} />{text}
    </span>
  );
}

export function LargeCard({ v, env, onOpen, statFont = 21 }: { v: ControllerView; env: Env; onOpen: (id: string) => void; statFont?: number }) {
  const s = v.health.sensors;
  const up = v.reading.status?.uptimeTotalSeconds;
  const stat = (label: string, value: string, warn = false) => (
    <span key={label} style={{ color: warn ? '#ffd56b' : undefined }}>
      <em style={{ fontStyle: 'normal', color: C.ink3, fontWeight: 550, marginRight: E(7) }}>{label}</em>{value}
    </span>
  );
  const checking = !v.reading.status && !v.health.offline;
  return (
    <div role="button" tabIndex={0} onClick={() => onOpen(v.c.id)} style={{ ...cardFrame(v), padding: `${E(18)} ${E(22)} ${E(16)} ${E(24)}`, borderRadius: E(24) }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: E(12), minWidth: 0 }}>
          <Dot v={v} />
          <span style={{ fontSize: E(29), fontWeight: 660, letterSpacing: '-.01em', flex: 1, minWidth: 0, opacity: v.health.poweredOff ? 0.7 : undefined, ...ellipsis }}>{v.c.name}</span>
          {v.c.isPlayer && <Badge />}
          <Label v={v} />
        </div>
        <div style={{ fontSize: E(20), color: C.ink3, marginTop: E(2), paddingLeft: E(25), display: 'flex', justifyContent: 'space-between', gap: E(16), fontWeight: 500 }}>
          <span style={ellipsis}>{v.c.cape} · {v.c.boardShort}</span>
          <span style={{ flex: 'none', ...tnum }}>{v.c.address}</span>
        </div>
      </div>
      {v.health.warnings[0] && (
        <div style={{ paddingLeft: E(25), fontSize: E(19), color: C.warnText, lineHeight: 1.3, ...ellipsis }}>{v.health.warnings[0]}</div>
      )}
      <div style={{ display: 'flex', gap: E(statFont < 21 ? 16 : 22), paddingLeft: E(25), fontSize: E(statFont), fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', ...tnum }}>
        {v.health.poweredOff ? <span style={{ color: C.ink2, fontWeight: 600, opacity: 0.7 }}>{lastHeard(v, env)}</span>
          : v.health.offline
          ? v.reading.lastOkAt
            ? [stat('Last heard', clockText(v.reading.lastOkAt, env.timeZone, env.locale)), typeof up === 'number' ? stat('Was up', uptimeText(up)) : null]
            : <span style={{ color: C.ink2, fontWeight: 600 }}>Not heard from yet</span>
          : checking ? <span style={{ color: C.ink3, fontWeight: 550 }}>Checking…</span>
          : [s.chip !== null ? stat('Chip', `${temperature(s.chip, env.units)}°`, s.chip >= 75) : null,
             s.board !== null ? stat('Board', `${temperature(s.board, env.units)}°`, s.board >= 75) : null,
             s.lowestSupply !== null ? stat('Power', `${s.lowestSupply.toFixed(1)} V`, s.lowPower) : null]}
      </div>
    </div>
  );
}

/** Columns and rows for N cards: the mockup's grid for up to 21 boxes, more
 *  columns for bigger shows, and never fewer rows than the mockup so a small
 *  show keeps full-size cards. */
export function gridShape(n: number, cols: number, minRows: number): { cols: number; rows: number } {
  let c = cols;
  while (Math.ceil(n / c) > minRows && c < cols + 2) c++;
  return { cols: c, rows: Math.max(minRows, Math.ceil(n / c)) };
}

// ── Detail sheet ────────────────────────────────────────────────────────────

function statusLine(v: ControllerView, m: ShowModel, env: Env): string {
  if (v.health.poweredOff) {
    const at = v.reading.lastOkAt;
    return at ? `Power is off · last heard ${clockText(at, env.timeZone, env.locale)}` : 'Power is off';
  }
  if (v.health.offline) {
    const at = v.reading.lastOkAt;
    return at ? `${v.health.label.replace('Offline · ', 'Offline for ')} · last heard ${clockText(at, env.timeZone, env.locale)}` : 'Has not answered yet';
  }
  if (!v.reading.status) return 'Checking…';
  const playing = (v.reading.status.status_name ?? '') === 'playing';
  const live = m.phase.kind === 'playing';
  let line = v.c.isPlayer ? (live ? 'Playing the show' : 'Waiting for the show') : live ? (playing ? 'In sync' : 'Not playing') : 'Ready';
  if (v.health.warnings.length) line += v.health.warnings.length > 1 ? ` · has ${v.health.warnings.length} warnings` : ' · has a warning';
  else if (v.health.label && v.health.reason !== 'notPlaying') line += ` · ${v.health.label.toLowerCase()}`;
  return line;
}

export function Sheet({ v, m, env, landscape, power, onClose }: { v: ControllerView; m: ShowModel; env: Env; landscape: boolean; power?: PowerLink | null; onClose: () => void }) {
  // Closes itself after 20 s, but not while a power button is armed or a
  // restart is running.
  const [hold, setHold] = React.useState(false);
  React.useEffect(() => {
    if (hold) return undefined;
    const t = setTimeout(onClose, 20_000);
    return () => clearTimeout(t);
  }, [onClose, v.c.id, hold]);
  const powerSection = power ? <PowerSection key={v.c.id} v={v} link={power} zone={env} landscape={landscape} onHold={setHold} /> : null;
  const st = v.reading.status;
  const playing = st && (st.status_name ?? '') === 'playing' ? namesFromFile(st.sequence_filename || st.current_sequence || '').title : '';
  const up = st?.uptimeTotalSeconds;
  const facts: Array<[string, string]> = [
    ['Board', v.c.cape === v.c.board ? v.c.board : `${v.c.cape} on ${v.c.board}`],
    ['Address', v.c.address],
    ['FPP version', st?.version || v.c.version || 'Unknown'],
    [v.health.offline ? 'Was up for' : 'Up for', typeof up === 'number' ? uptimeText(up) : 'Unknown'],
    ['Channels', v.c.rangeText || 'None'],
    ['Playing', v.health.offline ? 'Nothing' : playing || 'Nothing'],
  ];
  const names = readingNames(v.health.sensors.readings);
  const chips = v.health.offline ? [] : v.health.sensors.readings.map((r, i) => (
    <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: E(6), height: E(46), padding: `0 ${E(16)}`, borderRadius: E(14), background: 'rgba(255,255,255,.06)', fontSize: E(22), color: C.ink2, fontWeight: 600, whiteSpace: 'nowrap' }}>
      <em style={{ fontStyle: 'normal', color: C.ink3, fontWeight: 550 }}>{names[i]}</em>
      {r.kind === 'power' ? `${r.value.toFixed(1)} V` : `${temperature(r.value, env.units)}°`}
    </span>
  ));
  const tone = TONE[toneOf(v)];
  const warnings = v.health.warnings.slice(0, 3).map((w, i) => (
    <div key={i} style={{ marginTop: i ? E(12) : 0, borderRadius: E(22), background: 'rgba(251,191,36,.10)', border: '1px solid rgba(251,191,36,.35)', padding: `${E(20)} ${E(24)}`, display: 'flex', gap: E(16) }}>
      <Icon name="warn" size={E(32)} color="#ffd56b" style={{ marginTop: E(2) }} />
      <div>
        <div style={{ fontSize: E(20), fontWeight: 700, color: '#ffd56b', letterSpacing: '.06em', textTransform: 'uppercase' }}>Warning from the controller</div>
        <div style={{ fontSize: E(25), marginTop: E(6), lineHeight: 1.35, color: '#fff4d6' }}>{w}</div>
      </div>
    </div>
  ));
  const factGrid = landscape ? (
    <div style={{ display: 'grid', gap: E(8) }}>
      {facts.map(([k, val]) => (
        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: E(20), padding: `${E(14)} ${E(22)}`, borderRadius: E(16), background: 'rgba(255,255,255,.05)' }}>
          <span style={{ fontSize: E(19), color: C.ink3, fontWeight: 600 }}>{k}</span>
          <span style={{ fontSize: E(24), fontWeight: 650, textAlign: 'right', ...ellipsis }}>{val}</span>
        </div>
      ))}
    </div>
  ) : (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: E(14), marginTop: E(34) }}>
      {facts.map(([k, val]) => (
        <div key={k} style={{ background: 'rgba(255,255,255,.05)', borderRadius: E(20), padding: `${E(18)} ${E(22)}`, minWidth: 0 }}>
          <div style={{ fontSize: E(19), color: C.ink3, fontWeight: 600 }}>{k}</div>
          <div style={{ fontSize: E(28), fontWeight: 650, marginTop: E(6), ...clamp(2) }}>{val}</div>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(4,5,12,.62)' }} />
      <div role="dialog" aria-label={v.c.name} style={{
        position: 'absolute', left: landscape ? '13%' : E(60), right: landscape ? '13%' : E(60), top: landscape ? (power ? '11.1%' : '17.5%') : '15.6%',
        borderRadius: E(40), background: '#161a2b', border: `1px solid ${C.line2}`, boxShadow: `0 ${E(40)} ${E(120)} rgba(0,0,0,.6)`,
        padding: `${E(40)} ${E(44)}`, color: '#f4f6ff',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: E(18) }}>
          <span style={v.health.poweredOff
            ? { width: E(18), height: E(18), borderRadius: '50%', flex: 'none', boxSizing: 'border-box', border: `${E(4)} solid ${C.idle}` }
            : { width: E(18), height: E(18), borderRadius: '50%', background: tone.dot, flex: 'none' }} />
          <h4 style={{ fontSize: E(46), fontWeight: 760, letterSpacing: '-.02em', flex: 1, margin: 0, ...ellipsis }}>{v.c.name}</h4>
          <button type="button" aria-label="Close" onClick={onClose} style={{ width: E(76), height: E(76), borderRadius: '50%', background: 'rgba(255,255,255,.08)', border: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flex: 'none' }}>
            <Icon name="x" size={E(34)} />
          </button>
        </div>
        <div style={{ fontSize: E(24), color: C.ink2, marginTop: E(10), paddingLeft: E(36) }}>{statusLine(v, m, env)}</div>
        {landscape ? (
          <div style={{ display: 'grid', gridTemplateColumns: power ? '1.2fr 1fr' : '1fr 1.15fr', gap: E(28), marginTop: E(30), alignItems: 'start' }}>
            <div style={{ minWidth: 0 }}>{warnings}{chips.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: E(8), marginTop: warnings.length ? E(18) : 0 }}>{chips}</div>}{powerSection}</div>
            {factGrid}
          </div>
        ) : (
          <>
            {warnings.length > 0 && <div style={{ marginTop: E(22) }}>{warnings}</div>}
            {factGrid}
            {chips.length > 0 && <div style={{ display: 'flex', flexWrap: 'wrap', gap: E(8), marginTop: E(18) }}>{chips}</div>}
            {powerSection}
          </>
        )}
      </div>
    </div>
  );
}

export { kicker };
