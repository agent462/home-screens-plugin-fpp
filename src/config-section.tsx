import React from 'react';
import type { PluginConfigSectionProps } from './hs-plugin';
import type { FppStatus, FppSystem } from './lib/fpp-types';
import { playerBaseUrl } from './lib/poll';
import { arrangeControllers, type ControllerPrefs } from './lib/show';
import { controllersFrom, type Controller } from './lib/systems';
import { proxyFetch, readConfig, requestsConnected, savedControllerPrefs } from './config';
import { ControllersSettings } from './controllers-settings';
import { PowerSettings } from './power-settings';
import { RequestsSettings } from './requests-settings';
import { ShowSettingsPanel } from './show-settings';
import { ThemePicker } from './theme-picker';

// This section replaces the manifest's schema renderer, so it draws every
// setting itself.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 4 };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', marginTop: 4, lineHeight: 1.4 };

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; version: string; controllers: Controller[]; playlists: string[] | null }
  | { state: 'fail'; message: string };

async function checkPlayer(address: string): Promise<Check> {
  const base = playerBaseUrl(address);
  if (!base) return { state: 'fail', message: 'Type the address of the FPP player that runs your show.' };
  try {
    const status = (await proxyFetch(`${base}/api/fppd/status`, 0)) as FppStatus;
    if (!status || typeof status !== 'object' || !('status_name' in status)) {
      return { state: 'fail', message: 'Something answered there, but it is not an FPP player.' };
    }
    // The status alone is enough to save; the lists fill in what they can.
    const [controllers, playlists] = await Promise.all([
      proxyFetch(`${base}/api/fppd/multiSyncSystems`, 0).then((sys) => controllersFrom((sys as { systems?: FppSystem[] })?.systems ?? []), () => [] as Controller[]),
      proxyFetch(`${base}/api/playlists`, 0).then(
        (list) => (Array.isArray(list) ? list.filter((p): p is string => typeof p === 'string' && !!p).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })) : null),
        () => null,
      ),
    ]);
    return { state: 'ok', version: status.version ?? '', controllers, playlists };
  } catch {
    return { state: 'fail', message: "Couldn't reach it. Check the address, and that this hub can reach the show network." };
  }
}

export function ConfigSection({ config, onChange }: PluginConfigSectionProps) {
  const sdk = window.__HS_SDK__;
  const cfg = readConfig(config ?? {});
  const [draft, setDraft] = React.useState(cfg.playerAddress);
  const [check, setCheck] = React.useState<Check>({ state: 'idle' });
  React.useEffect(() => setDraft(cfg.playerAddress), [cfg.playerAddress]);

  const inputClass = sdk?.INPUT_CLASS ?? '';
  // Saved on leaving the field, not per keystroke, so half-typed addresses
  // never start a poller.
  const commit = React.useCallback(async () => {
    const value = draft.trim();
    if (value !== cfg.playerAddress) onChange({ playerAddress: value });
    if (!value) { setCheck({ state: 'idle' }); return; }
    setCheck({ state: 'checking' });
    setCheck(await checkPlayer(value));
  }, [draft, cfg.playerAddress, onChange]);

  React.useEffect(() => {
    if (cfg.playerAddress) {
      let live = true;
      checkPlayer(cfg.playerAddress).then((c) => { if (live) setCheck(c); });
      return () => { live = false; };
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the saved address
  }, []);

  const Toggle = sdk?.Toggle;
  // Names and order are the plugin's; kept here so the Controllers list and
  // the Power list below show the same names.
  const [prefs, setPrefs] = React.useState<ControllerPrefs>(() => savedControllerPrefs());
  // With Remote Falcon connected its song names and covers come first.
  const [requestsOn, setRequestsOn] = React.useState(() => requestsConnected());
  const [tagline, setTagline] = React.useState(cfg.tagline);
  React.useEffect(() => setTagline(cfg.tagline), [cfg.tagline]);
  const found = check.state === 'ok' ? check.controllers : [];
  const coversLabel = requestsOn ? 'Look up missing covers' : 'Look up album covers';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <span style={label}>Show player</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            className={inputClass}
            value={draft}
            placeholder="192.168.0.200 or fpp.local"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            spellCheck={false}
          />
        </div>
        <div style={help}>
          {check.state === 'checking' && 'Checking…'}
          {check.state === 'ok' && `Found it: FPP ${check.version || ''}${check.controllers.length ? `, ${check.controllers.length} controllers` : ''}.`}
          {check.state === 'fail' && <span style={{ color: '#f59e0b' }}>{check.message}</span>}
          {check.state === 'idle' && 'The FPP player that runs your show. Every controller is found through it.'}
        </div>
      </div>

      <ShowSettingsPanel playlists={check.state === 'ok' ? check.playlists : null} />

      <label>
        <span style={label}>View</span>
        <select className={inputClass} value={cfg.view} onChange={(e) => onChange({ view: e.target.value })}>
          <option value="show">Show: player, health and every controller</option>
          <option value="player">Player: what's playing, big</option>
          <option value="controllers">Controllers: every box in detail</option>
          <option value="strip">Now Playing strip: for a normal home screen</option>
        </select>
      </label>

      <div>
        <label>
          <span style={label}>Under the name</span>
          <select className={inputClass} value={cfg.subtitle} onChange={(e) => onChange({ subtitle: e.target.value })}>
            <option value="date">Today's date and time</option>
            <option value="hours">When the show runs</option>
            <option value="words">Your own words</option>
            <option value="none">Nothing</option>
          </select>
        </label>
        {cfg.subtitle === 'words' && (
          <input
            className={inputClass}
            aria-label="Your own words"
            value={tagline}
            maxLength={80}
            placeholder="Tune to 88.5 FM"
            onChange={(e) => setTagline(e.target.value)}
            onBlur={() => { if (tagline.trim() !== cfg.tagline) onChange({ tagline: tagline.trim() }); }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ marginTop: 6 }}
          />
        )}
        <div style={help}>The small line under your show's name. The Controllers view keeps its own count there.</div>
      </div>

      <ThemePicker value={cfg.theme} onChange={(theme) => onChange({ theme })} />

      {requestsOn
        ? (
          <div>
            <span style={label}>Song names</span>
            <div style={{ ...help, marginTop: 0 }}>Names and covers come from Remote Falcon, the way you set them up there. A song it does not have is named from its music file.</div>
          </div>
        )
        : (
          <label>
            <span style={label}>Song names from</span>
            <select className={inputClass} value={cfg.songNames} onChange={(e) => onChange({ songNames: e.target.value })}>
              <option value="tags">The music file (title and artist tags)</option>
              <option value="sequence">The sequence name</option>
            </select>
            <div style={help}>Use the sequence name if some music files carry the wrong tags.</div>
          </label>
        )}

      {Toggle
        ? <Toggle label={coversLabel} checked={cfg.covers} onChange={(v) => onChange({ covers: v })} />
        : (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={cfg.covers} onChange={(e) => onChange({ covers: e.target.checked })} />{coversLabel}
          </label>
        )}
      <div style={{ ...help, marginTop: -8 }}>
        {requestsOn
          ? "For songs with no cover in Remote Falcon. They come from Apple's free music search; only the song title and artist are sent."
          : "Covers come from Apple's free music search. Only the song title and artist are sent."}
      </div>

      {found.length > 0 && (
        <ControllersSettings
          controllers={found}
          hidden={cfg.hiddenControllers}
          onHidden={(ids) => onChange({ hiddenControllers: ids })}
          prefs={prefs}
          onPrefs={setPrefs}
        />
      )}

      {found.length > 0 && <PowerSettings controllers={arrangeControllers(found, prefs)} />}

      <RequestsSettings playerBase={check.state === 'ok' ? playerBaseUrl(cfg.playerAddress) : ''} onConnected={setRequestsOn} />
    </div>
  );
}
