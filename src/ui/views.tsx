import React from 'react';
import type { ControllerView, ShowModel } from '../data/model';
import { namesSentence } from '../lib/health';
import { Hero, HeroMessage, nextCount, nextDayWords } from './hero';
import { useNow } from './hooks';
import { Bars, BrandMark, Icon } from './icons';
import {
  Card, Cover, gridShape, Header, headerSub, LargeCard, listNames, liveElapsed, LiveProgress, playlistWords, LiveSegments, Mosaic, nextList, Pill, playingTag, Queue, Segments, showPill, StatTiles, Tag, voteLeader, type Env,
} from './parts';
import { C, clamp, E, ellipsis, kicker, outline, tnum } from './tokens';

export type ViewName = 'show' | 'player' | 'controllers' | 'strip';
export type Orientation = 'portrait' | 'landscape';

/** The size each arrangement was designed at (the mockup frame less the
 *  default 24 px module padding). The fit scale maps it onto the real box. */
export function naturalSize(view: ViewName, o: Orientation): [number, number] {
  if (view === 'strip') return [952, 164];
  return o === 'landscape' ? [1872, 1032] : [1032, 1872];
}

export function fitScale(view: ViewName, o: Orientation, w: number, h: number): number {
  const [nw, nh] = naturalSize(view, o);
  if (!w || !h) return 1;
  return Math.max(0.2, Math.min(4, Math.min(w / nw, h / nh)));
}

interface ViewProps {
  m: ShowModel;
  env: Env;
  o: Orientation;
  onOpen: (id: string) => void;
}

const col: React.CSSProperties = { display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 };

function SectionHead() {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flex: 'none', padding: `0 ${E(4)}` }}>
      <h3 style={{ fontSize: E(30), fontWeight: 720, letterSpacing: '-.01em', margin: 0 }}>Controllers</h3>
      <span style={{ fontSize: E(21), color: C.ink3, fontWeight: 550 }}>Tap one for details</span>
    </div>
  );
}

function CardGrid({ items, env, onOpen, cols, minRows, gap, large, pad }: {
  items: ControllerView[]; env: Env; onOpen: (id: string) => void; cols: number; minRows: number; gap: number; large?: boolean; pad?: number[];
}) {
  const shape = gridShape(items.length, cols, minRows);
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: `repeat(${shape.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${shape.rows}, minmax(0, 1fr))`,
      gap: E(gap), flex: '1 1 0', minHeight: 0,
    }}>
      {items.map((v) => large
        ? <LargeCard key={v.c.id} v={v} env={env} onOpen={onOpen} statFont={shape.cols >= 4 ? 20 : 21} />
        : <Card key={v.c.id} v={v} env={env} onOpen={onOpen} pad={pad} />)}
    </div>
  );
}

function NoControllers({ m }: { m: ShowModel }) {
  return (
    <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.ink3, fontSize: E(24), textAlign: 'center', padding: E(40) }}>
      {m.hasData ? 'Looking for controllers…' : ''}
    </div>
  );
}

// ── Show ────────────────────────────────────────────────────────────────────

export function ShowView({ m, env, o, onOpen }: ViewProps) {
  const grid = (cols: number, minRows: number, pad?: number[]) => m.controllers.length
    ? <CardGrid items={m.controllers} env={env} onOpen={onOpen} cols={cols} minRows={minRows} gap={12} pad={pad} />
    : <NoControllers m={m} />;
  if (o === 'landscape') {
    return (
      <div style={{
        display: 'grid', gridTemplateColumns: `${E(800)} minmax(0, 1fr)`, gridTemplateRows: 'auto minmax(0, 1fr)',
        columnGap: E(32), rowGap: E(20), padding: `${E(12)} ${E(20)}`, height: '100%', boxSizing: 'border-box',
      }}>
        <div style={{ gridColumn: '1 / -1' }}><Header sub={headerSub(env)} pill={showPill(m, env)} /></div>
        <div style={{ ...col, gap: E(18) }}>
          <Hero m={m} env={env} compact />
          <StatTiles m={m} env={env} style={{ gap: E(14) }} />
        </div>
        <div style={{ ...col, gap: E(12) }}>
          <SectionHead />
          {grid(3, 7, [11, 18, 10, 20])}
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...col, gap: E(22), padding: `${E(18)} ${E(20)} ${E(16)}`, height: '100%', boxSizing: 'border-box' }}>
      <Header sub={headerSub(env)} pill={showPill(m, env)} />
      <Hero m={m} env={env} />
      <StatTiles m={m} env={env} />
      <SectionHead />
      {grid(3, 7)}
    </div>
  );
}

// ── Player ──────────────────────────────────────────────────────────────────

function trouble(m: ShowModel): string {
  const off = m.summary.offlineNames;
  if (off.length) return namesSentence(off, 'are offline');
  return '';
}

function PlayerFoot({ m }: { m: ShowModel }) {
  const t = trouble(m);
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: E(16), marginTop: 'auto', paddingTop: E(16) }}>
      {m.volume !== null
        ? <span style={chip}><Icon name="vol" size={E(22)} />Volume {m.volume}%</span>
        : <span />}
      {t && <span style={{ ...chip, color: '#ffc4c4', borderColor: 'rgba(255,107,107,.4)', background: 'rgba(255,107,107,.1)' }}>
        <span style={{ width: E(12), height: E(12), borderRadius: '50%', background: C.bad }} />{t}
      </span>}
    </div>
  );
}

const chip: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: E(10), height: E(46), padding: `0 ${E(18)}`, borderRadius: 999,
  background: 'rgba(255,255,255,.08)', ...outline('rgba(255,255,255,.09)'), fontSize: E(21), color: 'rgba(232,238,255,.66)', fontWeight: 550, whiteSpace: 'nowrap',
};

function PlayerMeta({ m, big }: { m: ShowModel; big: number }) {
  const cur = m.current;
  const paused = m.phase.kind === 'playing' && m.phase.paused;
  const tag = playingTag(m);
  return (
    <div style={{ minWidth: 0 }}>
      <div style={kicker}>{paused ? <><Icon name="pause" size={E(22)} />Paused</> : <><Bars color={C.gold} height={E(20)} />Now playing</>}{tag && <Tag text={tag} />}</div>
      <div style={{ fontSize: E(big), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.06, marginTop: E(12), ...clamp(2) }}>{cur?.names.title ?? 'Playing'}</div>
      {cur?.names.artist && <div style={{ fontSize: E(big > 68 ? 38 : 34), opacity: 0.88, marginTop: E(14), fontWeight: 550, ...ellipsis }}>{cur.names.artist}</div>}
      {cur?.names.album && <div style={{ fontSize: E(26), color: 'rgba(232,238,255,.42)', marginTop: E(8), ...ellipsis }}>{cur.names.album}</div>}
    </div>
  );
}

export function PlayerView({ m, env, o }: ViewProps) {
  const playing = m.reachable && m.phase.kind === 'playing';
  const header = <Header sub={headerSub(env)} pill={showPill(m, env)} />;
  if (!playing) {
    // Before or after the show the player view is the next show, big.
    if (m.reachable && m.phase.kind === 'waiting') {
      const at = m.phase.nextAt;
      const art = o === 'landscape' ? 880 : 720;
      const info = (
        <div style={{ minWidth: 0 }}>
          <div style={{ ...kicker, color: C.ice }}><Icon name="cal" size={E(24)} />Next show</div>
          <div style={{ fontSize: E(72), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.05, marginTop: E(14) }}>{nextDayWords(at, env).map((w, i) => <div key={i}>{w}</div>)}</div>
          <div style={{ fontSize: E(38), fontWeight: 650, color: C.gold, marginTop: E(14) }}>{nextCount(at, env)}</div>
          {(m.cadence || m.through) && <div style={{ fontSize: E(26), color: 'rgba(232,238,255,.66)', marginTop: E(16), lineHeight: 1.45 }}>{m.cadence && <div>{m.cadence}</div>}{m.through && <div>{m.through}</div>}</div>}
          <div style={{ marginTop: E(34) }}><Segments m={m} index={-1} elapsed={0} upcoming /></div>
        </div>
      );
      return o === 'landscape' ? (
        <div style={{ display: 'grid', gridTemplateColumns: `${E(art)} minmax(0,1fr)`, columnGap: E(70), padding: `${E(76)} ${E(66)} ${E(76)} ${E(76)}`, height: '100%', boxSizing: 'border-box', color: '#f4f6ff' }}>
          <Mosaic songs={m.grid} size={E(art)} gap={E(12)} radius={E(40)} />
          <div style={{ ...col }}>{header}<div style={{ marginTop: E(40) }}>{info}</div><div style={{ marginTop: 'auto' }}><Queue label="First up" songs={m.firstUp} /></div></div>
        </div>
      ) : (
        <div style={{ ...col, alignItems: 'stretch', padding: `${E(36)} ${E(40)} ${E(30)}`, height: '100%', boxSizing: 'border-box', color: '#f4f6ff' }}>
          {header}
          <div style={{ alignSelf: 'center', marginTop: E(40) }}><Mosaic songs={m.grid} size={E(art)} gap={E(12)} radius={E(36)} /></div>
          <div style={{ marginTop: E(52) }}>{info}</div>
          <div style={{ marginTop: 'auto' }}><Queue label="First up" songs={m.firstUp} /></div>
        </div>
      );
    }
    return (
      <div style={{ ...col, gap: E(40), padding: `${E(36)} ${E(40)} ${E(30)}`, height: '100%', boxSizing: 'border-box', justifyContent: 'flex-start' }}>
        {header}
        <HeroMessage m={m} env={env} />
      </div>
    );
  }
  const cur = m.current;
  const list = nextList(m, o === 'landscape' ? 2 : 3);
  if (o === 'landscape') {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `${E(880)} minmax(0,1fr)`, columnGap: E(70), padding: `${E(76)} ${E(66)} ${E(76)} ${E(76)}`, height: '100%', boxSizing: 'border-box', color: '#f4f6ff' }}>
        <Cover url={cur?.cover ?? null} size={E(880)} radius={E(40)} />
        <div style={{ ...col }}>
          {header}
          <div style={{ marginTop: E(34) }}><PlayerMeta m={m} big={64} /></div>
          <div style={{ marginTop: E(34) }}><LiveProgress m={m} /></div>
          <div style={{ marginTop: E(22) }}><LiveSegments m={m} /></div>
          <div style={{ marginTop: E(30) }}><Queue label={list.label} right={list.right} songs={list.songs} /></div>
          <PlayerFoot m={m} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ ...col, alignItems: 'stretch', padding: `${E(36)} ${E(40)} ${E(30)}`, height: '100%', boxSizing: 'border-box', color: '#f4f6ff' }}>
      {header}
      <div style={{ alignSelf: 'center', marginTop: E(40) }}><Cover url={cur?.cover ?? null} size={E(720)} radius={E(36)} /></div>
      <div style={{ marginTop: E(52) }}><PlayerMeta m={m} big={72} /></div>
      <div style={{ marginTop: E(40) }}><LiveProgress m={m} /></div>
      <div style={{ marginTop: E(26) }}><LiveSegments m={m} /></div>
      <div style={{ marginTop: E(40) }}><Queue label={list.label} right={list.right} songs={list.songs} /></div>
      <PlayerFoot m={m} />
    </div>
  );
}

// ── Controllers ─────────────────────────────────────────────────────────────

export function ControllersView({ m, env, o, onOpen }: ViewProps) {
  const s = m.summary;
  const parts = [`${s.online} of ${s.total} online`];
  if (s.warningNames.length) parts.push(s.warningNames.length === 1 ? '1 warning' : `${s.warningNames.length} warnings`);
  parts.push(m.phase.kind === 'playing' ? 'show is playing' : m.phase.kind === 'waiting' ? 'waiting for the show' : 'show is off');
  const off = s.offlineNames.length;
  const pill = !m.hasData ? null
    : off ? <Pill tone="bad" text={`${off} offline`} />
    : s.warningNames.length ? <Pill tone="warn" text={s.warningNames.length === 1 ? '1 warning' : `${s.warningNames.length} warnings`} />
    : <Pill tone="ok" text="All online" />;
  const landscape = o === 'landscape';
  return (
    <div style={{ ...col, gap: E(landscape ? 20 : 22), padding: landscape ? `${E(12)} ${E(20)}` : `${E(18)} ${E(20)} ${E(16)}`, height: '100%', boxSizing: 'border-box' }}>
      <Header sub={m.controllers.length ? parts.join(' · ') : headerSub(env)} pill={pill} />
      {m.controllers.length
        ? <CardGrid items={m.controllers} env={env} onOpen={onOpen} cols={landscape ? 4 : 2} minRows={landscape ? 5 : 10} gap={14} large />
        : <NoControllers m={m} />}
    </div>
  );
}

// ── Strip ───────────────────────────────────────────────────────────────────

export function StripView({ m, env }: ViewProps) {
  const s = m.summary;
  const off = s.offlineNames.length;
  const side = (big: string, lab: string, tone: 'ok' | 'bad', extra?: string, pill?: React.ReactNode) => (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: E(10), flex: 'none', textAlign: 'right' }}>
      {pill}
      <span style={{ fontSize: E(40), fontWeight: 760, color: tone === 'bad' ? '#ffc4c4' : C.okText, ...tnum }}>{big}</span>
      <span style={{ fontSize: E(19), color: 'rgba(232,238,255,.66)', fontWeight: 550 }}>{lab}</span>
      {extra && <span style={{ fontSize: E(19), color: C.warnText, fontWeight: 550 }}>{extra}</span>}
    </div>
  );
  const count = `${s.online}/${s.total}`;
  const warn = s.warningNames.length ? (s.warningNames.length === 1 ? '1 warning' : `${s.warningNames.length} warnings`) : undefined;
  const wrap = (children: React.ReactNode) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: E(26), height: '100%', paddingRight: E(6), color: '#f4f6ff', minWidth: 0 }}>{children}</div>
  );
  const info = (k: React.ReactNode, title: string, sub: React.ReactNode, rest?: React.ReactNode) => (
    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ ...kicker, fontSize: E(17) }}>{k}</div>
      <div style={{ fontSize: E(38), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.06, marginTop: E(8), ...ellipsis }}>{title}</div>
      <div style={{ fontSize: E(24), marginTop: E(6), fontWeight: 550, ...ellipsis }}>{sub}</div>
      {rest}
    </div>
  );
  if (m.reachable && m.phase.kind === 'playing') {
    const cur = m.current;
    return wrap(<>
      <Cover url={cur?.cover ?? null} size={E(164)} radius={E(22)} />
      {info(<>{m.phase.paused ? <><Icon name="pause" size={E(18)} />Paused</> : <><Bars color={C.gold} height={E(16)} />Now playing</>}{playingTag(m) && <Tag text={playingTag(m)!} small />}</>,
        cur?.names.title ?? 'Playing', <span style={{ opacity: 0.88 }}>{cur?.names.artist}</span>,
        <StripBar m={m} />)}
      {side(count, off ? listNames(s.offlineNames) + (off === 1 ? ' offline' : ' are offline') : 'Controllers online', off ? 'bad' : 'ok', warn,
        <Pill tone={m.phase.paused ? 'gold' : 'ok'} text={m.phase.paused ? 'Paused' : 'Live'} small />)}
    </>);
  }
  if (m.reachable && m.phase.kind === 'waiting') {
    return wrap(<>
      <Mosaic songs={m.grid} size={E(164)} gap={E(4)} radius={E(22)} />
      {info(<span style={{ color: C.ice }}>Next show</span>, nextDayWords(m.phase.nextAt, env).join(' ').replace(/,$/, ''),
        <span style={{ color: C.gold }}>{nextCount(m.phase.nextAt, env)}</span>,
        m.songs.length ? <div style={{ fontSize: E(19), color: 'rgba(232,238,255,.66)', marginTop: E(12), fontWeight: 550 }}>{playlistWords(m.playlistName)} · {m.songs.length} songs · {Math.round(m.songs.reduce((t, x) => t + x.duration, 0) / 60)} min</div> : null)}
      {side(count, off ? `${listNames(s.offlineNames)} offline` : 'Controllers ready', off ? 'bad' : 'ok', warn)}
    </>);
  }
  const tile = (name: 'moon' | 'unplug' | 'plug', bad?: boolean) => (
    <div style={{ width: E(164), height: E(164), borderRadius: E(22), flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bad ? 'rgba(255,107,107,.08)' : 'rgba(255,255,255,.06)', border: `1px solid ${bad ? 'rgba(255,107,107,.3)' : 'rgba(255,255,255,.09)'}`, color: bad ? '#ffb3b3' : 'inherit' }}>
      <Icon name={name} size={E(72)} />
    </div>
  );
  if (m.connecting) return wrap(<>{tile('plug')}{info(<span style={{ color: C.ink3 }}>Connecting</span>, 'Finding the show player', <span style={{ color: 'rgba(232,238,255,.66)' }}>{env.address}</span>)}</>);
  if (!m.reachable) return wrap(<>{tile('unplug', true)}{info(<span style={{ color: '#ff9b9b' }}>Not answering</span>, "Can't reach the show player", <span style={{ color: 'rgba(232,238,255,.66)' }}>Trying again every 30 seconds</span>)}</>);
  if (m.phase.kind === 'done') {
    return wrap(<>
      {tile('moon')}
      {info(<span style={{ color: 'rgba(232,238,255,.42)' }}>Done for tonight</span>,
        m.phase.nextAt ? `Back ${nextDayWords(m.phase.nextAt, env).join(' ').toLowerCase().replace(/,$/, '')} at ${new Intl.DateTimeFormat(env.locale, { timeZone: env.timeZone, hour: 'numeric', minute: '2-digit' }).format(m.phase.nextAt)}` : 'That was the last show',
        <span style={{ color: 'rgba(232,238,255,.66)' }}>{m.cadence ?? ''}</span>)}
      {side(count, 'Controllers online', off ? 'bad' : 'ok')}
    </>);
  }
  return wrap(<>{tile('moon')}{info(<span style={{ color: 'rgba(232,238,255,.42)' }}>No show scheduled</span>, 'The player is on and waiting', <span style={{ color: 'rgba(232,238,255,.66)' }}>Nothing on its schedule</span>)}{side(count, 'Controllers online', off ? 'bad' : 'ok')}</>);
}

function StripBar({ m }: { m: ShowModel }) {
  const now = useNow(1000, m.phase.kind === 'playing' && !m.phase.paused);
  const elapsed = liveElapsed(m, now);
  const pct = m.duration ? Math.min(100, (elapsed / m.duration) * 100) : 0;
  const cur = m.current;
  // The middle of the time line: where the show is, and who is waiting.
  const leader = voteLeader(m);
  const waiting = m.requests.waiting ? `${m.requests.waiting} ${m.requests.waiting === 1 ? 'request' : 'requests'} waiting` : '';
  const middle = leader ? `Leading: ${leader.names.title}`
    : [cur && cur.index >= 0 ? `Song ${cur.index + 1} of ${m.songs.length}` : '', waiting].filter(Boolean).join(' · ');
  return (
    <>
      <div style={{ height: E(9), borderRadius: 99, background: 'rgba(255,255,255,.16)', overflow: 'hidden', marginTop: E(18) }}>
        <i style={{ display: 'block', height: '100%', width: `${pct}%`, background: 'linear-gradient(90deg,#fff2cf,#fff)' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: E(19), color: 'rgba(232,238,255,.66)', marginTop: E(8), fontWeight: 550, ...tnum }}>
        <span>{fmt(elapsed)}</span>{middle && <span style={ellipsis}>{middle}</span>}<span>-{fmt(Math.max(0, m.duration - elapsed))}</span>
      </div>
    </>
  );
}

const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, '0')}`;

// ── Not set up yet ──────────────────────────────────────────────────────────

export function SetupView({ view }: { view: ViewName }) {
  const strip = view === 'strip';
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: strip ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', gap: E(strip ? 28 : 30), textAlign: strip ? 'left' : 'center', padding: E(40), boxSizing: 'border-box' }}>
      <BrandMark width={E(strip ? 150 : 220)} />
      <div style={{ maxWidth: E(760) }}>
        <div style={{ fontSize: E(strip ? 38 : 56), fontWeight: 760, letterSpacing: '-.02em' }}>Light Show</div>
        <div style={{ fontSize: E(strip ? 22 : 28), color: C.ink2, marginTop: E(12), lineHeight: 1.4 }}>
          Add your show player's address in this module's settings, like 192.168.0.200 or fpp.local. The controllers are found through it.
        </div>
      </div>
    </div>
  );
}
