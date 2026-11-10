import React from 'react';
import type { PluginComponentProps } from './hs-plugin';
import { hostFrameStyle } from './host-style';
import { Feed, feedFor, type FeedState } from './data/feed';
import { fetchRequests, proxyFetch, readConfig, requestsConnected, savedControllerPrefs, savedLinks, savedShow, sdk } from './config';
import { buildModel, wantedCoverNames, wantedMedia } from './data/model';
import { PowerStore, powerStore } from './data/power';
import { haApi } from './lib/ha';
import type { OutletPower } from './lib/health';
import { sharedWith } from './lib/power';
import { arrangeControllers, readControllerPrefs, titleOf } from './lib/show';
import { controllersFrom } from './lib/systems';
import type { PowerLink } from './ui/power';
import { playerBaseUrl } from './lib/poll';
import { useBox, useNow } from './ui/hooks';
import { Backdrop, Sheet, type Brand, type Env } from './ui/parts';
import { designPx } from './ui/tokens';
import { STAGE, stageAccentOf, themeById, themeCard, themePage, themeVars } from './ui/theme';
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
  }, undefined, fetchRequests);
}

const storage = () => { try { return window.localStorage; } catch { return null; } };
const makePower = () => new PowerStore(haApi, proxyFetch, storage());

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
  // The show's name, logo and main playlist, and the controllers' names and
  // order: saved once for the plugin and re-read on the slow tick, like the
  // outlet links below, so a change in the editor reaches a wall on its own.
  const show = savedShow();
  const brand = React.useMemo<Brand>(
    () => ({ title: titleOf(show), logo: show.logo, subtitle: cfg.subtitle, tagline: cfg.tagline }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the fields stand for `show`
    [show.name, show.logo, cfg.subtitle, cfg.tagline],
  );
  const env: Env = { ...host, now, address: cfg.playerAddress.trim(), brand };
  React.useEffect(() => { feed?.setMainPlaylist(show.mainPlaylist); }, [feed, show.mainPlaylist]);
  const prefsKey = JSON.stringify(savedControllerPrefs());
  const prefs = React.useMemo(() => readControllerPrefs(JSON.parse(prefsKey)), [prefsKey]);

  // Outlets: the saved links are re-read on the slow tick, so a link made in
  // the editor reaches a wall without a reload.
  const power = React.useMemo(() => powerStore(makePower), []);
  const powerState = React.useSyncExternalStore(power.subscribe, power.getState, power.getState);
  const linksKey = JSON.stringify(savedLinks());
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is the re-read tick
  const links = React.useMemo(() => savedLinks(), [linksKey, now]);
  React.useEffect(() => { power.setLinked(Object.values(JSON.parse(linksKey) as Record<string, string>)); }, [power, linksKey]);
  const outletPower = React.useMemo(() => {
    const out: Record<string, OutletPower> = {};
    if (powerState.ha !== 'ok') return out;
    for (const [id, entity] of Object.entries(JSON.parse(linksKey) as Record<string, string>)) {
      const r = powerState.outlets[entity];
      if (r) out[id] = { off: r.state === 'off', since: r.changedAt };
    }
    return out;
  }, [powerState, linksKey]);

  // Remote Falcon: connected in the editor, noticed here on the slow tick.
  const requestsOn = requestsConnected();
  React.useEffect(() => { feed?.setRequests(requestsOn); }, [feed, requestsOn]);

  const hiddenKey = cfg.hiddenControllers.join('|');
  const model = React.useMemo(() => (state ? buildModel(state, {
    songNames: cfg.songNames, covers: cfg.covers, hidden: cfg.hiddenControllers, timeZone: host.timeZone, locale: host.locale, now,
    formatNumber: (n) => n.toLocaleString(host.locale), power: outletPower, controllers: prefs,
  }) : null),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hiddenKey stands for the array
  [state, now, cfg.songNames, cfg.covers, hiddenKey, host.timeZone, host.locale, outletPower, prefs]);

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
  React.useEffect(() => (openId ? power.watchClosely() : undefined), [power, openId]);

  // The open controller's outlet, when it has one Home Assistant can see.
  let openPower: PowerLink | null = null;
  const openEntity = open ? links[open.c.id] : undefined;
  const openReading = openEntity && powerState.ha === 'ok' ? powerState.outlets[openEntity] : null;
  if (open && openEntity && openReading && state) {
    // Every controller counts for "also powers", even ones this module hides.
    const everyone = arrangeControllers(controllersFrom(state.systems ?? []), prefs);
    // Only the show player shuts down first, and only while it can hear us.
    const shutDown = open.c.isPlayer && !open.health.offline ? base : undefined;
    openPower = {
      entity: openEntity, reading: openReading, job: powerState.jobs[openEntity] ?? null,
      shared: sharedWith(links, open.c.id, everyone),
      turnOn: () => power.turnOn(openEntity),
      turnOff: () => power.turnOff(openEntity, shutDown),
      restart: () => power.restart(openEntity, shutDown),
    };
  }

  const props = model ? { m: model, env, o, onOpen: setOpenId } : null;
  let body: React.ReactNode = null;
  if (!base) body = <SetupView view={cfg.view} brand={brand} />;
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

  // A theme paints its own page (or, for the strip, its own card) in place of
  // the host's glass. The player view is all cover, so there a theme only
  // lends its accent.
  const theme = themeById(cfg.theme);
  const stage = cfg.view === 'player';
  const themed: React.CSSProperties | null = !theme ? null
    : stage ? { ['--ls-stage-accent' as string]: stageAccentOf(theme) }
    : { ...themeVars(theme), ...(cfg.view === 'strip' ? themeCard(theme) : themePage(theme)), opacity: undefined, backdropFilter: undefined, WebkitBackdropFilter: undefined };

  return (
    <div ref={rootRef} style={{ ...hostFrameStyle(style), position: 'relative', ...themed }}>
      {base && (stage || (cfg.view === 'strip' && !theme)) && (
        <Backdrop url={cover} blur={px(cfg.view === 'strip' ? 50 : 90)} opacity={cfg.view === 'strip' ? 0.5 : 0.75} inset={px(cfg.view === 'strip' ? -60 : -120)}
          shade={cfg.view === 'strip'
            ? 'linear-gradient(90deg,rgba(8,10,22,.2),rgba(8,10,22,.6))'
            : o === 'landscape'
              ? 'linear-gradient(90deg,rgba(8,10,22,.35),rgba(8,10,22,.6) 50%,rgba(8,10,22,.85))'
              : 'linear-gradient(180deg,rgba(8,10,22,.35),rgba(8,10,22,.55) 50%,rgba(8,10,22,.88))'} />
      )}
      <div ref={boxRef} style={{ position: 'relative', width: '100%', height: '100%', ['--d' as string]: d, ...(stage && theme ? STAGE : null) }}>
        {body}
      </div>
      {open && model && (
        <div style={{ position: 'absolute', inset: 0, ['--d' as string]: d }}>
          <Sheet v={open} m={model} env={env} landscape={o === 'landscape'} power={openPower} onClose={close} />
        </div>
      )}
    </div>
  );
}
