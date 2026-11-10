import React from 'react';
import type { PluginConfigSectionProps } from './hs-plugin';
import type { FppStatus, FppSystem } from './lib/fpp-types';
import { playerBaseUrl } from './lib/poll';
import { controllersFrom, type Controller } from './lib/systems';
import { proxyFetch, readConfig } from './config';
import { PowerSettings } from './power-settings';

// This section replaces the manifest's schema renderer, so it draws every
// setting itself.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 4 };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', marginTop: 4, lineHeight: 1.4 };

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'ok'; version: string; controllers: Controller[] }
  | { state: 'fail'; message: string };

async function checkPlayer(address: string): Promise<Check> {
  const base = playerBaseUrl(address);
  if (!base) return { state: 'fail', message: 'Type the address of the FPP player that runs your show.' };
  try {
    const status = (await proxyFetch(`${base}/api/fppd/status`, 0)) as FppStatus;
    if (!status || typeof status !== 'object' || !('status_name' in status)) {
      return { state: 'fail', message: 'Something answered there, but it is not an FPP player.' };
    }
    let controllers: Controller[] = [];
    try {
      const sys = (await proxyFetch(`${base}/api/fppd/multiSyncSystems`, 0)) as { systems?: FppSystem[] };
      controllers = controllersFrom(sys.systems ?? []);
    } catch { /* the status alone is enough to save */ }
    return { state: 'ok', version: status.version ?? '', controllers };
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
  const hidden = new Set(cfg.hiddenControllers);
  const setHidden = (id: string, hide: boolean) => {
    const next = new Set(hidden);
    if (hide) next.add(id); else next.delete(id);
    onChange({ hiddenControllers: [...next] });
  };

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

      <label>
        <span style={label}>View</span>
        <select className={inputClass} value={cfg.view} onChange={(e) => onChange({ view: e.target.value })}>
          <option value="show">Show: player, health and every controller</option>
          <option value="player">Player: what's playing, big</option>
          <option value="controllers">Controllers: every box in detail</option>
          <option value="strip">Now Playing strip: for a normal home screen</option>
        </select>
      </label>

      <label>
        <span style={label}>Song names from</span>
        <select className={inputClass} value={cfg.songNames} onChange={(e) => onChange({ songNames: e.target.value })}>
          <option value="tags">The music file (title and artist tags)</option>
          <option value="sequence">The sequence name</option>
        </select>
        <div style={help}>Use the sequence name if some music files carry the wrong tags.</div>
      </label>

      {Toggle
        ? <Toggle label="Look up album covers" checked={cfg.covers} onChange={(v) => onChange({ covers: v })} />
        : (
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <input type="checkbox" checked={cfg.covers} onChange={(e) => onChange({ covers: e.target.checked })} />Look up album covers
          </label>
        )}
      <div style={{ ...help, marginTop: -8 }}>Covers come from Apple's free music search. Only the song title and artist are sent.</div>

      {check.state === 'ok' && check.controllers.length > 0 && (
        <div>
          <span style={label}>Controllers to show</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
            {check.controllers.map((c) => (
              <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                <input type="checkbox" checked={!hidden.has(c.id)} onChange={(e) => setHidden(c.id, !e.target.checked)} />
                <span>{c.name}</span>
                <span style={{ color: '#8a8a8a', marginLeft: 'auto', fontVariantNumeric: 'tabular-nums' }}>{c.address}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {check.state === 'ok' && check.controllers.length > 0 && <PowerSettings controllers={check.controllers} />}
    </div>
  );
}
