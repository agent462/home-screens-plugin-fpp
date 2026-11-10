import React from 'react';
import { fetchRequests, PLUGIN_ID, proxyFetch, requestsConnected, RequestsError, REQUESTS_SETTING } from './config';
import { remoteFalconKey } from './lib/jwt';
import { RF_SECRET, rfView, type RfShow, type RfView } from './lib/remote-falcon';

// The "Remote Falcon" part of the module settings. The access token and
// secret key are turned into one signed key here in the editor; only that key
// is saved, as a hub secret, so neither the secret nor the key ever reaches a
// wall. Saved once for the plugin: every Light Show module shares it.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 6 };
const sub: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', margin: '10px 0 4px' };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', lineHeight: 1.45 };
const button: React.CSSProperties = { background: '#2563eb', color: '#fff', border: 0, borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 600, marginTop: 12, cursor: 'pointer' };
const ghost: React.CSSProperties = { ...button, background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', fontWeight: 500 };

type State =
  | { kind: 'checking' }
  | { kind: 'off'; problem?: 'refused' | 'down' | 'save' }
  | { kind: 'on'; view: RfView }
  /** Connected, but Remote Falcon did not answer just now. */
  | { kind: 'quiet' };

const secretsUrl = `/api/plugins/secrets/${encodeURIComponent(PLUGIN_ID)}`;
const secretCall = (method: 'PUT' | 'DELETE', body: Record<string, string>) =>
  fetch(secretsUrl, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.ok, () => false);

/** "Requests are open, 3 waiting." in the words the wall uses. */
export function summary(v: RfView): string {
  if (!v.open) return 'Requests are closed right now.';
  if (v.mode === 'voting') return v.totalVotes ? `Voting is open, ${v.totalVotes} ${v.totalVotes === 1 ? 'vote' : 'votes'} so far.` : 'Voting is open.';
  return v.queue.length ? `Requests are open, ${v.queue.length} waiting.` : 'Requests are open.';
}

function Status({ color, text, textColor = '#d4d4d4' }: { color: string; text: string; textColor?: string }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 12, color: textColor, marginBottom: 8 }}>
      <i style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: 'none', transform: 'translateY(-1px)' }} />
      <span>{text}</span>
    </div>
  );
}

/** `onConnected` tells the rest of the settings when the connection is made
 *  or dropped, since some of them step aside for Remote Falcon. */
export function RequestsSettings({ playerBase, onConnected }: { playerBase: string; onConnected?: (on: boolean) => void }) {
  const sdk = window.__HS_SDK__;
  const inputClass = sdk?.INPUT_CLASS ?? '';
  const [state, setState] = React.useState<State>(() => (requestsConnected() ? { kind: 'checking' } : { kind: 'off' }));
  const [token, setToken] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [hasPlugin, setHasPlugin] = React.useState(false);

  const test = React.useCallback(async (): Promise<State> => {
    try {
      return { kind: 'on', view: rfView((await fetchRequests(0)) as RfShow) };
    } catch (err) {
      const refused = err instanceof RequestsError && (err.status === 401 || err.status === 403);
      return refused ? { kind: 'off', problem: 'refused' } : { kind: 'quiet' };
    }
  }, []);

  React.useEffect(() => {
    if (!requestsConnected()) return undefined;
    let live = true;
    test().then((s) => { if (live) setState(s.kind === 'off' ? { kind: 'quiet' } : s); });
    return () => { live = false; };
  }, [test]);

  // Does the show player run Remote Falcon's plugin? Only to offer the hint.
  React.useEffect(() => {
    if (!playerBase) { setHasPlugin(false); return undefined; }
    let live = true;
    proxyFetch(`${playerBase}/api/plugin/remote-falcon/settings/remotePlaylist`, 60_000).then(
      (data) => { if (live) setHasPlugin(!!(data as { remotePlaylist?: string })?.remotePlaylist); },
      () => { if (live) setHasPlugin(false); },
    );
    return () => { live = false; };
  }, [playerBase]);

  const connect = async () => {
    if (!token.trim() || !secret.trim() || busy) return;
    setBusy(true);
    try {
      if (!(await secretCall('PUT', { key: RF_SECRET, value: remoteFalconKey(token.trim(), secret.trim()) }))) {
        setState({ kind: 'off', problem: 'save' });
        return;
      }
      const result = await test();
      if (result.kind !== 'on') {
        // Not a working key: do not leave it behind.
        await secretCall('DELETE', { key: RF_SECRET });
        setState({ kind: 'off', problem: result.kind === 'off' ? 'refused' : 'down' });
        return;
      }
      const saved = await sdk?.setPluginSettings?.(PLUGIN_ID, { [REQUESTS_SETTING]: true });
      if (!saved?.ok) { setState({ kind: 'off', problem: 'save' }); return; }
      setToken('');
      setSecret('');
      setState(result);
      onConnected?.(true);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sdk?.setPluginSettings?.(PLUGIN_ID, { [REQUESTS_SETTING]: false });
      await secretCall('DELETE', { key: RF_SECRET });
      setState({ kind: 'off' });
      onConnected?.(false);
    } finally {
      setBusy(false);
    }
  };

  if (state.kind === 'checking') {
    return <div><span style={label}>Remote Falcon</span><div style={help}>Asking Remote Falcon…</div></div>;
  }
  if (state.kind === 'on' || state.kind === 'quiet') {
    return (
      <div>
        <span style={label}>Remote Falcon</span>
        {state.kind === 'on'
          ? <Status color="#34d399" text={`Connected. ${summary(state.view)}`} />
          : <Status color="#f59e0b" text="Remote Falcon isn't answering right now." textColor="#fcd34d" />}
        <div style={help}>
          {state.kind === 'on'
            ? 'Your key is kept on the hub, never on the wall. Every Light Show module shares this connection.'
            : 'Your connection is kept. The wall shows requests again when Remote Falcon is back.'}
        </div>
        <button type="button" style={ghost} disabled={busy} onClick={disconnect}>Disconnect</button>
      </div>
    );
  }

  const problem = {
    refused: "Remote Falcon didn't accept that. Check both and try again.",
    down: "Couldn't reach Remote Falcon. Nothing was saved. Try again in a moment.",
    save: "Couldn't save the connection on the hub. Try again.",
  }[state.problem ?? 'save'];
  return (
    <div>
      <span style={label}>Remote Falcon</span>
      {state.problem
        ? <Status color="#f59e0b" text={problem} textColor="#fcd34d" />
        : hasPlugin && (
          <div style={{ background: 'rgba(59,130,246,.10)', border: '1px solid rgba(59,130,246,.35)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#cfe0ff', lineHeight: 1.45, marginBottom: 4 }}>
            Your show player runs Remote Falcon. Connect it here to see requests and votes on the wall.
          </div>
        )}
      <label>
        <span style={sub}>API access token</span>
        <input className={inputClass} value={token} placeholder="Paste the token" onChange={(e) => setToken(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <label>
        <span style={sub}>API secret key</span>
        <input className={inputClass} type="password" value={secret} placeholder="Paste the secret key" onChange={(e) => setSecret(e.target.value)} spellCheck={false} autoComplete="off" />
      </label>
      <button type="button" style={{ ...button, opacity: busy || !token.trim() || !secret.trim() ? 0.5 : 1 }} disabled={busy} onClick={connect}>
        {busy ? 'Connecting…' : 'Connect'}
      </button>
      <div style={{ ...help, marginTop: 10 }}>
        In Remote Falcon open Account Settings, then Account, and press Request API Access. The secret key is only shown once.
      </div>
    </div>
  );
}
