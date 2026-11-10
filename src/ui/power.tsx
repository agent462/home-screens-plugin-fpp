import React from 'react';
import type { ControllerView } from '../data/model';
import { RESTART_OFF_MS, SHUTDOWN_MS, type PowerJob } from '../data/power';
import { clockText } from '../lib/format';
import type { OutletReading } from '../lib/power';
import { useNow } from './hooks';
import { Icon, type IconName } from './icons';
import { C, E, ellipsis, tnum, goldTint, tv } from './tokens';

/** How long a first tap keeps a button armed. */
const ARMED_MS = 4000;

/** A controller's outlet and what can be done with it, for the detail sheet. */
export interface PowerLink {
  entity: string;
  reading: OutletReading;
  job: PowerJob | null;
  /** Other controllers on the same outlet. */
  shared: string[];
  turnOn: () => Promise<void>;
  turnOff: () => Promise<void>;
  restart: () => Promise<void>;
}

interface Zone { timeZone: string; locale: string }

function both(names: string[]): string {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.length} other controllers`;
}

const strong: React.CSSProperties = { color: tv('ink', '#fff'), fontWeight: 700 };

function Button({ icon, text, look, onTap, landscape }: {
  icon: IconName; text: string; look: 'plain' | 'primary' | 'dimmed' | 'danger' | 'gold'; onTap?: () => void; landscape: boolean;
}) {
  const looks: Record<typeof look, React.CSSProperties> = {
    plain: { background: tv('fill', 'rgba(255,255,255,.09)'), borderColor: C.line2 },
    dimmed: { background: tv('fill', 'rgba(255,255,255,.09)'), borderColor: C.line2, opacity: 0.32 },
    primary: { background: C.gold, borderColor: C.gold, color: C.onGold },
    danger: { background: 'rgba(255,107,107,.26)', borderColor: '#ff8585', color: tv('ink', '#fff'), boxShadow: `0 0 0 ${E(5)} rgba(255,107,107,.14)` },
    gold: { background: goldTint(22), borderColor: C.gold, color: tv('ink', '#fff3d6'), boxShadow: `0 0 0 ${E(5)} ${goldTint(12)}` },
  };
  return (
    <button type="button" onClick={onTap} disabled={!onTap} style={{
      flex: 1, minWidth: 0, height: E(landscape ? 88 : 96), borderRadius: E(26), display: 'flex', alignItems: 'center', justifyContent: 'center',
      gap: E(landscape ? 10 : 14), font: 'inherit', color: 'inherit',
      borderWidth: 1, borderStyle: 'solid', cursor: onTap ? 'pointer' : 'default', padding: `0 ${E(12)}`, whiteSpace: 'nowrap', ...looks[look],
    }}>
      <Icon name={icon} size={E(landscape ? 28 : 32)} />
      <span style={{ fontSize: E(landscape ? 24 : 28), fontWeight: 700, ...ellipsis }}>{text}</span>
    </button>
  );
}

function Progress({ icon, text, count, pct }: { icon: IconName; text: string; count: string; pct: number }) {
  return (
    <div style={{
      position: 'relative', marginTop: E(24), height: E(96), borderRadius: E(26), background: tv('fill2', 'rgba(255,255,255,.06)'), border: `1px solid ${C.line2}`,
      overflow: 'hidden', display: 'flex', alignItems: 'center', gap: E(16), padding: `0 ${E(30)}`, fontSize: E(28), fontWeight: 700,
    }}>
      <i style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${Math.max(0, Math.min(100, pct))}%`, background: goldTint(16), borderRight: `2px solid ${goldTint(50)}` }} />
      <Icon name={icon} size={E(32)} color={C.gold} style={{ position: 'relative' }} />
      <span style={{ position: 'relative', minWidth: 0, ...ellipsis }}>{text}</span>
      <span style={{ position: 'relative', marginLeft: 'auto', color: C.gold, flex: 'none', ...tnum }}>{count}</span>
    </div>
  );
}

/** The Power section at the bottom of a linked controller's detail sheet. */
export function PowerSection({ v, link, zone, landscape, onHold }: {
  v: ControllerView; link: PowerLink; zone: Zone; landscape: boolean; onHold: (hold: boolean) => void;
}) {
  const [armed, setArmed] = React.useState<'off' | 'restart' | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const name = v.c.name;
  const job = link.job;
  // "Power is back" stays up until the controller answers again.
  const starting = job?.phase === 'starting' && (v.reading.lastOkAt ?? 0) < job.since;
  const running = !!job && (job.phase !== 'starting' || starting);
  const now = useNow(1000, running);

  React.useEffect(() => {
    if (!armed) return undefined;
    const t = setTimeout(() => setArmed(null), ARMED_MS);
    return () => clearTimeout(t);
  }, [armed]);
  // The sheet's auto-close waits while a button is armed or a job runs.
  const hold = armed !== null || running || sending;
  React.useEffect(() => { onHold(hold); }, [hold, onHold]);
  React.useEffect(() => () => onHold(false), [onHold]);

  const run = (action: () => Promise<void>) => {
    setArmed(null);
    setFailed(false);
    setSending(true);
    action().catch(() => setFailed(true)).finally(() => setSending(false));
  };
  const tap = (which: 'off' | 'restart') => () => {
    if (sending) return;
    if (armed !== which) { setFailed(false); setArmed(which); return; }
    run(which === 'off' ? link.turnOff : link.restart);
  };

  const state = job?.phase === 'off' ? 'off' : link.reading.state;
  const since = link.reading.changedAt;
  const stateText = state === 'on' ? 'On'
    : state === 'na' ? "Isn't answering"
    : since && !job ? `Off since ${clockText(since, zone.timeZone, zone.locale)}` : 'Off';
  const stateColor = state === 'off' ? tv('ink2', '#c5cede') : state === 'na' ? C.warnText : undefined;
  const dot: React.CSSProperties = state === 'on' ? { background: C.ok }
    : state === 'na' ? { background: C.warn }
    : { borderWidth: E(3), borderStyle: 'solid', borderColor: C.idle };

  const others = link.shared;
  const total = others.length + 1;
  let body: React.ReactNode;
  let note: React.ReactNode = null;
  let noteColor: string = C.ink2;

  if (job?.phase === 'shutdown') {
    body = <Progress icon="power" text="Shutting the player down safely" count="Then power off" pct={((now - job.since) / SHUTDOWN_MS) * 100} />;
  } else if (job?.phase === 'off') {
    const left = Math.max(0, Math.ceil(((job.onAt ?? now) - now) / 1000));
    body = <Progress icon="rotate" text="Power is off" count={left > 0 ? `Back on in ${left} s` : 'Turning back on'} pct={((now - job.since) / RESTART_OFF_MS) * 100} />;
  } else if (starting) {
    body = <Progress icon="rotate" text="Power is back on" count={`Waiting for ${name}`} pct={100} />;
  } else if (state === 'off') {
    body = <div style={{ display: 'flex', gap: E(16), marginTop: E(24) }}><Button icon="power" text="Turn on" look="primary" landscape={landscape} onTap={sending ? undefined : () => run(link.turnOn)} /></div>;
    note = `${name}'s lights come back about a minute after the power does.`;
  } else if (state === 'na') {
    body = (
      <div style={{ display: 'flex', gap: E(16), marginTop: E(24) }}>
        <Button icon="rotate" text="Restart power" look="dimmed" landscape={landscape} />
        <Button icon="power" text="Turn off" look="dimmed" landscape={landscape} />
      </div>
    );
    note = "Home Assistant can't reach this outlet right now.";
    noteColor = C.warnText;
  } else {
    const lost = v.health.offline;
    body = (
      <div style={{ display: 'flex', gap: E(16), marginTop: E(24) }}>
        <Button icon="rotate" landscape={landscape} onTap={tap('restart')}
          text={armed === 'restart' ? 'Tap again to restart' : 'Restart power'}
          look={armed === 'restart' ? 'gold' : armed === 'off' ? 'dimmed' : lost ? 'primary' : 'plain'} />
        <Button icon="power" landscape={landscape} onTap={tap('off')}
          text={armed === 'off' ? (total === 2 ? 'Tap again to turn off both' : total > 2 ? `Tap again to turn off all ${total}` : 'Tap again to turn off') : 'Turn off'}
          look={armed === 'off' ? 'danger' : armed === 'restart' ? 'dimmed' : 'plain'} />
      </div>
    );
    const alsoPowers = others.length ? <>This outlet also powers <b style={strong}>{both(others)}</b>. </> : null;
    if (armed && v.c.isPlayer && !lost) {
      noteColor = C.warnText;
      note = armed === 'restart'
        ? <><b style={strong}>This stops the show.</b> The player shuts down safely first, then loses power for 10 seconds. Back in about 2 minutes.</>
        : <><b style={strong}>This stops the show.</b> The player shuts down safely first, then stays off until someone turns it back on.</>;
    } else if (armed === 'off') {
      note = others.length
        ? <>{alsoPowers}{total === 2 ? 'Both go' : 'They all go'} dark until someone turns it back on.</>
        : `${name}'s lights go dark until someone turns it back on.`;
    } else if (armed === 'restart') {
      note = <>{alsoPowers}Off for 10 seconds, then back on. {others.length ? (total === 2 ? 'Both go' : 'They all go') : `${name} goes`} dark for about a minute.</>;
    } else if (lost) {
      note = `The outlet is on but ${name} is not answering. Restarting its power often brings it back.`;
    }
  }
  if (failed) {
    note = "That didn't go through: Home Assistant didn't answer. Nothing was changed.";
    noteColor = C.badText;
  }

  return (
    <div style={{ marginTop: E(landscape ? 24 : 30), paddingTop: E(landscape ? 22 : 28), borderTop: `1px solid ${C.line}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: E(18), minWidth: 0 }}>
        <b style={{ fontSize: E(20), fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: C.ink3, flex: 'none' }}>Power</b>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: E(10), fontSize: E(25), fontWeight: 700, whiteSpace: 'nowrap', color: stateColor, flex: 'none' }}>
          <i style={{ width: E(14), height: E(14), borderRadius: '50%', boxSizing: 'border-box', ...dot }} />{stateText}
        </span>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: E(10), fontSize: E(22), color: C.ink2, fontWeight: 550, minWidth: 0 }}>
          <Icon name="plug" size={E(24)} style={{ opacity: 0.7 }} />
          <span style={ellipsis}>{link.reading.name}</span>
        </span>
      </div>
      {body}
      {note && <div style={{ fontSize: E(22), color: noteColor, marginTop: E(18), lineHeight: 1.42 }}>{note}</div>}
    </div>
  );
}
