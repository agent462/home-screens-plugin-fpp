import React from 'react';
import type { ShowModel } from '../data/model';
import { clockText, dayText } from '../lib/format';
import { calendarDaysBetween } from '../lib/format';
import { untilText } from '../lib/schedule';
import { Bars, Icon, type IconName } from './icons';
import { Backdrop, Cover, LiveProgress, LiveSegments, Mosaic, Queue, Segments, type Env } from './parts';
import { C, clamp, E, ellipsis, kicker } from './tokens';

/** "Friday,\nNovember 27", or "Tonight" / "Tomorrow". */
export function nextDayWords(at: number, env: Env): string[] {
  const days = calendarDaysBetween(env.now, at, env.timeZone);
  if (days <= 0) return ['Tonight'];
  if (days === 1) return ['Tomorrow'];
  const full = dayText(at, env.timeZone, env.locale);
  const i = full.indexOf(', ');
  return i > 0 ? [`${full.slice(0, i + 1)}`, full.slice(i + 2)] : [full];
}

export function nextCount(at: number, env: Env): string {
  return `${clockText(at, env.timeZone, env.locale)} · ${untilText(at, env.now, env.timeZone)}`;
}

function HeroCard({ cover, compact, grow, children, style }: { cover?: string | null; compact?: boolean; grow?: boolean; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      position: 'relative', borderRadius: E(40), overflow: 'hidden', flex: grow ? '1 1 auto' : 'none', minHeight: 0,
      padding: compact ? `${E(28)} ${E(30)}` : `${E(34)} ${E(36)}`, display: 'flex', flexDirection: 'column', gap: E(compact ? 24 : 28),
      border: `1px solid rgba(255,255,255,.14)`, background: '#121527', color: '#f4f6ff', ...style,
    }}>
      <Backdrop url={cover ?? null} blur={E(70)} opacity={0.62} inset={E(-80)}
        shade="linear-gradient(180deg,rgba(10,12,26,.25) 0%,rgba(10,12,26,.55) 60%,rgba(10,12,26,.78) 100%)" />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 'inherit', flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

const Top = ({ children, gap }: { children: React.ReactNode; gap: number }) => (
  <div style={{ display: 'flex', gap: E(gap), alignItems: 'stretch', minWidth: 0 }}>{children}</div>
);

export function HeroPlaying({ m, env, compact }: { m: ShowModel; env: Env; compact?: boolean }) {
  const cur = m.current;
  const paused = m.phase.kind === 'playing' && m.phase.paused;
  const art = compact ? 300 : 356;
  const next = m.upNext[0];
  return (
    <HeroCard cover={cur?.cover} compact={compact} grow={compact}>
      <Top gap={compact ? 30 : 36}>
        <Cover url={cur?.cover ?? null} size={E(art)} radius={E(26)} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...kicker, fontSize: E(compact ? 19 : 21) }}>
            {paused ? <><Icon name="pause" size={E(22)} />Paused</> : <><Bars color={C.gold} height={E(20)} />Now playing</>}
          </div>
          <div style={{ fontSize: E(compact ? 50 : 60), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.06, marginTop: E(compact ? 14 : 18), ...clamp(2) }}>
            {cur?.names.title ?? 'Playing'}
          </div>
          {cur?.names.extra && <div style={{ fontSize: E(24), color: 'rgba(232,238,255,.66)', marginTop: E(10), fontWeight: 500, ...ellipsis }}>{cur.names.extra}</div>}
          {cur?.names.artist && <div style={{ fontSize: E(compact ? 28 : 32), opacity: 0.88, marginTop: E(compact ? 12 : 16), fontWeight: 550, ...ellipsis }}>{cur.names.artist}</div>}
          {cur?.names.album && <div style={{ fontSize: E(23), color: 'rgba(232,238,255,.42)', marginTop: E(8), ...ellipsis }}>{cur.names.album}</div>}
          {!compact && next && (
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: E(18), padding: `${E(16)} ${E(18)}`, borderRadius: E(22), background: 'rgba(255,255,255,.07)', border: '1px solid rgba(255,255,255,.09)' }}>
              <Cover url={next.cover} size={E(64)} radius={E(12)} shadow={false} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: E(18), fontWeight: 700, letterSpacing: '.12em', color: 'rgba(232,238,255,.42)', textTransform: 'uppercase' }}>Up next</div>
                <div style={{ fontSize: E(25), fontWeight: 600, marginTop: E(4), ...ellipsis }}>{next.names.title}</div>
              </div>
            </div>
          )}
        </div>
      </Top>
      <LiveProgress m={m} font={compact ? 22 : 24} />
      <LiveSegments m={m} font={compact ? 19 : 21} />
      {compact && <div style={{ marginTop: 'auto' }}><Queue label="Up next" songs={m.upNext.slice(0, 2)} art={60} title={24} sub={19} /></div>}
    </HeroCard>
  );
}

export function HeroWaiting({ m, env, compact }: { m: ShowModel; env: Env; compact?: boolean }) {
  if (m.phase.kind !== 'waiting') return null;
  const at = m.phase.nextAt;
  const words = nextDayWords(at, env);
  const firstNames = m.firstUp.slice(0, 2).map((s) => s.names.title);
  const more = m.songs.length - firstNames.length;
  return (
    <HeroCard cover={m.grid[Math.min(5, m.grid.length - 1)]?.cover} compact={compact} grow={compact}>
      <Top gap={compact ? 30 : 36}>
        {m.grid.length ? <Mosaic songs={m.grid} size={E(compact ? 300 : 356)} /> : <IconTile name="cal" size={compact ? 300 : 356} />}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ ...kicker, color: C.ice, fontSize: E(compact ? 19 : 21) }}><Icon name="cal" size={E(24)} />Next show</div>
          <div style={{ fontSize: E(compact ? 50 : 64), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.05, marginTop: E(compact ? 14 : 18) }}>
            {words.map((w, i) => <div key={i}>{w}</div>)}
          </div>
          <div style={{ fontSize: E(compact ? 28 : 34), fontWeight: 650, color: C.gold, marginTop: E(compact ? 10 : 14) }}>{nextCount(at, env)}</div>
          {(m.cadence || m.through) && (
            <div style={{ fontSize: E(compact ? 21 : 24), color: 'rgba(232,238,255,.66)', marginTop: E(compact ? 10 : 16), lineHeight: 1.45 }}>
              {m.cadence && <div>{m.cadence}</div>}
              {m.through && <div>{m.through}</div>}
            </div>
          )}
        </div>
      </Top>
      <Segments m={m} index={-1} elapsed={0} upcoming font={compact ? 19 : 21} />
      {compact
        ? <div style={{ marginTop: 'auto' }}><Queue label="First up" songs={m.firstUp} art={60} title={24} sub={19} /></div>
        : firstNames.length > 0 && (
          <div style={{ display: 'flex' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: E(10), minHeight: E(46), padding: `${E(6)} ${E(18)}`, borderRadius: 999, background: 'rgba(255,255,255,.08)', border: '1px solid rgba(255,255,255,.09)', fontSize: E(21), color: 'rgba(232,238,255,.66)', fontWeight: 550, maxWidth: '100%', ...ellipsis }}>
              <Icon name="music" size={E(22)} />{firstNames.join(', ')}{more > 0 ? `, and ${more} more` : ''}
            </span>
          </div>
        )}
    </HeroCard>
  );
}

function IconTile({ name, size, tone }: { name: IconName; size: number; tone?: 'bad' }) {
  return (
    <div style={{
      width: E(size), height: E(size), borderRadius: E(26), flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: tone ? 'rgba(255,107,107,.08)' : 'rgba(255,255,255,.06)', border: `1px solid ${tone ? 'rgba(255,107,107,.3)' : 'rgba(255,255,255,.09)'}`,
      color: tone ? '#ffb3b3' : 'rgba(232,238,255,.85)',
    }}>
      <Icon name={name} size={E(Math.round(size * 0.36))} />
    </div>
  );
}

/** Done for tonight, nothing scheduled, can't reach the player, connecting. */
export function HeroMessage({ m, env, compact }: { m: ShowModel; env: Env; compact?: boolean }) {
  let icon: IconName = 'moon';
  let tone: 'bad' | undefined;
  let kick = '';
  let big = '';
  let sub = '';
  if (m.connecting) {
    icon = 'plug'; kick = 'Connecting'; big = 'Finding the show player'; sub = `Asking ${env.address} how the show is doing.`;
  } else if (!m.reachable) {
    icon = 'unplug'; tone = 'bad'; kick = 'Not answering'; big = "Can't reach the show player";
    sub = m.lastHeardAt
      ? `Trying ${env.address} again every 30 seconds. Last heard at ${clockText(m.lastHeardAt, env.timeZone, env.locale)}.`
      : `Trying ${env.address} every 30 seconds. Check the address in this module's settings, and that this hub can reach the show network.`;
  } else if (m.phase.kind === 'done') {
    kick = 'Done for tonight';
    big = m.phase.nextAt ? `Back ${calendarDaysBetween(env.now, m.phase.nextAt, env.timeZone) === 1 ? 'tomorrow' : nextDayWords(m.phase.nextAt, env).join(' ')}\nat ${clockText(m.phase.nextAt, env.timeZone, env.locale)}` : 'That was the last show';
    sub = m.cadence ? `Tonight's show: ${m.cadence.replace(/^Every night /, '')}` : '';
  } else if (m.phase.kind === 'idle') {
    kick = 'No show scheduled'; big = 'The player is on and waiting'; sub = 'Nothing is on its schedule right now.';
  }
  const size = compact ? 300 : 372;
  return (
    <HeroCard compact={compact} grow={compact} style={tone ? { background: '#1a1420', borderColor: 'rgba(255,107,107,.35)' } : undefined}>
      <Top gap={compact ? 30 : 36}>
        <IconTile name={icon} size={size} tone={tone} />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ ...kicker, color: tone ? '#ff9b9b' : 'rgba(232,238,255,.42)', fontSize: E(compact ? 19 : 21) }}>{kick}</div>
          <div style={{ fontSize: E(compact ? 46 : 56), fontWeight: 760, letterSpacing: '-.025em', lineHeight: 1.05, marginTop: E(18), whiteSpace: 'pre-line' }}>{big}</div>
          {sub && <div style={{ fontSize: E(compact ? 21 : 24), color: 'rgba(232,238,255,.66)', marginTop: E(16), lineHeight: 1.45 }}>{sub}</div>}
        </div>
      </Top>
    </HeroCard>
  );
}

export function Hero({ m, env, compact }: { m: ShowModel; env: Env; compact?: boolean }) {
  if (m.reachable && m.phase.kind === 'playing') return <HeroPlaying m={m} env={env} compact={compact} />;
  if (m.reachable && m.phase.kind === 'waiting') return <HeroWaiting m={m} env={env} compact={compact} />;
  return <HeroMessage m={m} env={env} compact={compact} />;
}
