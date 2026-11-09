import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { Feed, feedFor, type FeedState } from './data/feed';
import { proxyFetch, readConfig, sdk } from './config';
import { buildModel, wantedCoverNames, wantedMedia } from './data/model';
import { playerBaseUrl } from './lib/poll';
import { useBox, useNow } from './ui/hooks';
import { Backdrop, Sheet, type Env } from './ui/parts';
import { designPx } from './ui/tokens';
import { ControllersView, fitScale, PlayerView, SetupView, ShowView, StripView, type Orientation } from './ui/views';

export { ConfigSection } from './config-section';
export { PLUGIN_ID } from './config';

function makeFeed(base: string): Feed {
  return new Feed(base, proxyFetch, {
    get: (key) => {
      const hit = sdk()?.displayCache?.get(key);
      return hit ? hit.data : undefined;
    },
    set: (key, value, ttl) => sdk()?.displayCache?.set(key, value, ttl),
  });
}

const noSubscribe = () => () => {};
const noState = (): FeedState | null => null;

function useHost() {
  const host = sdk()?.getHostSettings?.();
  let zone = host?.timezone;
  if (!zone || zone === 'UTC') {
    try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || zone; } catch { /* keep */ }
  }
  return { units: host?.units === 'metric' ? 'metric' as const : 'imperial' as const, timeZone: zone || 'UTC', locale: sdk()?.locale || 'en-US' };
}

export default function LightShow({ config, style }: PluginComponentProps) {
  const cfg = readConfig(config ?? {});
  const base = playerBaseUrl(cfg.playerAddress);
  const feed = React.useMemo(() => (base ? feedFor(base, makeFeed) : null), [base]);
  const state = React.useSyncExternalStore(feed ? feed.subscribe : noSubscribe, feed ? feed.getState : noState, noState);

  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const boxRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => (feed && rootRef.current ? feed.attach(rootRef.current) : undefined), [feed]);
  const box = useBox(boxRef);
  const o: Orientation = box.w > box.h ? 'landscape' : 'portrait';
  const k = fitScale(cfg.view, o, box.w, box.h);

  // Clock and "Offline · 6 min" words: a slow tick. The progress bar keeps
  // its own one-second tick.
  const now = useNow(15_000);
  const host = useHost();
  const env: Env = { ...host, now, address: cfg.playerAddress.trim() };

  const hiddenKey = cfg.hiddenControllers.join('|');
  const model = React.useMemo(() => (state ? buildModel(state, {
    songNames: cfg.songNames, covers: cfg.covers, hidden: cfg.hiddenControllers, timeZone: host.timeZone, locale: host.locale, now,
    formatNumber: (n) => n.toLocaleString(host.locale),
  }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenKey stands for the array
  [state, now, cfg.songNames, cfg.covers, hiddenKey, host.timeZone, host.locale]);

  // Ask the feed for the tags and covers of the songs on screen.
  const mediaKey = model ? wantedMedia(model).join('\n') : '';
  React.useEffect(() => { if (feed && mediaKey) feed.wantSongs(mediaKey.split('\n')); }, [feed, mediaKey]);
  const coverNames = model && state ? wantedCoverNames(model, state.meta) : [];
  const coverKey = coverNames.map((n) => `${n.title}\u0001${n.artist}`).join('\n');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- coverKey stands for coverNames
  React.useEffect(() => { feed?.wantCoversFor(coverNames, cfg.covers); }, [feed, coverKey, cfg.covers]);

  const [openId, setOpenId] = React.useState<string | null>(null);
  const close = React.useCallback(() => setOpenId(null), []);
  const open = model?.controllers.find((v) => v.c.id === openId) ?? null;

  const props = model ? { m: model, env, o, onOpen: setOpenId } : null;
  let body: React.ReactNode = null;
  if (!base) body = <SetupView view={cfg.view} />;
  else if (props) {
    body = cfg.view === 'player' ? <PlayerView {...props} />
      : cfg.view === 'controllers' ? <ControllersView {...props} />
      : cfg.view === 'strip' ? <StripView {...props} />
      : <ShowView {...props} />;
  }

  // The player and strip views put the cover behind the whole module.
  const cover = model && (cfg.view === 'player' || cfg.view === 'strip')
    ? model.current?.cover ?? (model.phase.kind === 'waiting' ? model.grid[Math.min(5, model.grid.length - 1)]?.cover ?? null : null)
    : null;
  const hostFont = Number.isFinite(style?.fontSize) && style.fontSize > 0 ? style.fontSize : 16;
  const d = designPx(k, hostFont);
  const px = (n: number) => `${Math.round(n * k * (hostFont / 16))}px`;

  return (
    <div ref={rootRef} style={{ ...hostFrameStyle(style), position: 'relative' }}>
      {base && (cfg.view === 'player' || cfg.view === 'strip') && (
        <Backdrop url={cover} blur={px(cfg.view === 'strip' ? 50 : 90)} opacity={cfg.view === 'strip' ? 0.5 : 0.75} inset={px(cfg.view === 'strip' ? -60 : -120)}
          shade={cfg.view === 'strip'
            ? 'linear-gradient(90deg,rgba(8,10,22,.2),rgba(8,10,22,.6))'
            : o === 'landscape'
              ? 'linear-gradient(90deg,rgba(8,10,22,.35),rgba(8,10,22,.6) 50%,rgba(8,10,22,.85))'
              : 'linear-gradient(180deg,rgba(8,10,22,.35),rgba(8,10,22,.55) 50%,rgba(8,10,22,.88))'} />
      )}
      <div ref={boxRef} style={{ position: 'relative', width: '100%', height: '100%', ['--d' as string]: d }}>
        {body}
      </div>
      {open && model && (
        <div style={{ position: 'absolute', inset: 0, ['--d' as string]: d }}>
          <Sheet v={open} m={model} env={env} landscape={o === 'landscape'} onClose={close} />
        </div>
      )}
    </div>
  );
}
