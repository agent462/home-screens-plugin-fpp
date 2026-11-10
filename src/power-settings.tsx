import React from 'react';
import { OUTLETS_SETTING, PLUGIN_ID, savedLinks } from './config';
import { HaError, haUrl, listOutlets } from './lib/ha';
import { mainOutlets, outletGroups, sharedWith, suggestLinks, type Links, type Outlet } from './lib/power';
import type { Controller } from './lib/systems';

// The "Power" part of the module settings: which Home Assistant outlet feeds
// which controller. Saved in the plugin's own settings, not this module's, so
// every Light Show module and wall shares one set of links.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 6 };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', lineHeight: 1.45 };
const under: React.CSSProperties = { fontSize: 11, color: '#8a8a8a', textAlign: 'right', margin: '-3px 0 2px' };
const SHOW_ALL = '__all__';

type Ha =
  | { state: 'loading' }
  | { state: 'none' }
  | { state: 'down' }
  | { state: 'ok'; outlets: Outlet[] };

function Status({ color, text }: { color: string; text: string }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 12, color: '#b5b5b5', marginBottom: 10 }}>
      <i style={{ width: 7, height: 7, borderRadius: '50%', background: color, flex: 'none', transform: 'translateY(-1px)' }} />
      <span>{text}</span>
    </div>
  );
}

export function PowerSettings({ controllers }: { controllers: Controller[] }) {
  const sdk = window.__HS_SDK__;
  const inputClass = sdk?.INPUT_CLASS ?? '';
  const [ha, setHa] = React.useState<Ha>({ state: 'loading' });
  const [links, setLinks] = React.useState<Links>(() => savedLinks());
  const [showAll, setShowAll] = React.useState(false);
  const [saveFailed, setSaveFailed] = React.useState(false);

  React.useEffect(() => {
    if (!haUrl()) { setHa({ state: 'none' }); return undefined; }
    let live = true;
    listOutlets().then(
      (outlets) => { if (live) setHa({ state: 'ok', outlets }); },
      (err) => { if (live) setHa({ state: err instanceof HaError && err.problem === 'notSetUp' ? 'none' : 'down' }); },
    );
    return () => { live = false; };
  }, []);

  const save = React.useCallback(async (next: Links) => {
    setLinks(next);
    setSaveFailed(false);
    const result = await sdk?.setPluginSettings?.(PLUGIN_ID, { [OUTLETS_SETTING]: next });
    if (!result?.ok) setSaveFailed(true);
  }, [sdk]);

  if (ha.state === 'loading') {
    return <div><span style={label}>Power</span><div style={help}>Looking for Home Assistant…</div></div>;
  }
  if (ha.state === 'none') {
    return (
      <div>
        <span style={label}>Power</span>
        <div style={help}>Connect the Home Assistant plugin to turn controllers off and on from the wall. Light Show uses the plugs you already have there.</div>
      </div>
    );
  }
  if (ha.state === 'down') {
    return (
      <div>
        <span style={label}>Power</span>
        <Status color="#f59e0b" text="Home Assistant isn't answering." />
        <div style={help}>Your links are kept. The wall hides the power buttons until it is back.</div>
      </div>
    );
  }

  const all = ha.outlets;
  const main = mainOutlets(all);
  const offered = showAll ? all : main;
  if (!offered.length && !Object.keys(links).length) {
    return (
      <div>
        <span style={label}>Power</span>
        <Status color="#34d399" text="Connected to Home Assistant." />
        {all.length > 0 && !showAll ? (
          <>
            <div style={{ ...help, marginBottom: 10 }}>No Tapo or Kasa plugs found there yet. Using another brand?</div>
            <button type="button" onClick={() => setShowAll(true)} style={{ background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer' }}>Show every switch</button>
          </>
        ) : <div style={help}>Home Assistant has no switches yet. Add your smart plugs there first.</div>}
      </div>
    );
  }

  const byId = new Map(all.map((o) => [o.id, o]));
  const groups = outletGroups(all, showAll);
  const suggested = suggestLinks(controllers, offered, links);
  const suggestedCount = Object.keys(suggested).length;
  // What each outlet is already linked to, for the picker.
  const usedBy = new Map<string, string[]>();
  for (const c of controllers) {
    const entity = links[c.id];
    if (entity) usedBy.set(entity, [...(usedBy.get(entity) ?? []), c.name]);
  }

  const pick = (id: string, value: string) => {
    if (value === SHOW_ALL) { setShowAll(true); return; }
    const next: Record<string, string> = { ...links };
    if (value) next[id] = value; else delete next[id];
    void save(next);
  };

  // The picked outlet shows as just its name; the list adds what helps choose.
  const optionText = (o: Outlet, forId: string, picked: boolean) => {
    if (picked) return o.name;
    const others = (usedBy.get(o.id) ?? []).filter((n) => n !== controllers.find((c) => c.id === forId)?.name);
    const state = o.state === 'na' ? 'not answering' : o.state;
    return `${o.name} · ${state}${others.length === 1 ? ` · ${others[0]}` : others.length > 1 ? ` · ${others.length} controllers` : ''}`;
  };

  return (
    <div>
      <span style={label}>Power</span>
      <Status color="#34d399" text={`Connected to Home Assistant. ${offered.length === 1 ? '1 outlet' : `${offered.length} outlets`} found.`} />
      {suggestedCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(59,130,246,.10)', border: '1px solid rgba(59,130,246,.35)', borderRadius: 8, padding: '8px 10px', fontSize: 12, color: '#cfe0ff', marginBottom: 10 }}>
          <span style={{ flex: 1 }}>{suggestedCount === 1 ? '1 outlet matches a controller by name.' : `${suggestedCount} outlets match a controller by name.`}</span>
          <button type="button" onClick={() => void save({ ...links, ...suggested })} style={{ background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, padding: '5px 9px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', flex: 'none' }}>
            {suggestedCount === 1 ? 'Use it' : 'Use them'}
          </button>
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
        {controllers.map((c) => {
          const linked = links[c.id];
          const hint = !linked ? suggested[c.id] : undefined;
          const gone = !!linked && !byId.has(linked);
          const shared = sharedWith(links, c.id, controllers);
          const border = hint ? '1px dashed #3b82f6' : gone ? '1px solid rgba(245,158,11,.6)' : undefined;
          return (
            <React.Fragment key={c.id}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontSize: 13 }}>
                <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                <select
                  className={inputClass}
                  aria-label={`Outlet for ${c.name}`}
                  value={linked ?? hint ?? ''}
                  onChange={(e) => pick(c.id, e.target.value)}
                  style={{ width: 150, flex: 'none', fontSize: 12, border, color: hint ? '#cfe0ff' : gone ? '#fcd34d' : !linked ? '#777' : undefined }}
                >
                  <option value="">No outlet</option>
                  {gone && <option value={linked}>{linked}</option>}
                  {groups.map((g) => (
                    <optgroup key={g.id} label={g.label}>
                      {g.items.map((o) => <option key={o.id} value={o.id}>{optionText(o, c.id, o.id === (linked ?? hint))}</option>)}
                    </optgroup>
                  ))}
                  {!showAll && all.length > main.length && <option value={SHOW_ALL}>Show every switch in Home Assistant</option>}
                </select>
              </label>
              {hint && <div style={{ ...under, color: '#7fb0ff' }}>Suggested by name</div>}
              {gone && (
                <div style={{ ...under, color: '#f59e0b' }}>
                  Not in Home Assistant any more
                  <button type="button" onClick={() => pick(c.id, '')} style={{ background: 'none', border: 'none', padding: 0, marginLeft: 6, color: '#d4d4d4', textDecoration: 'underline', fontSize: 11, cursor: 'pointer' }}>Clear</button>
                </div>
              )}
              {!gone && shared.length > 0 && <div style={under}>Also powers {shared.length <= 2 ? shared.join(' and ') : `${shared.length} others`}</div>}
            </React.Fragment>
          );
        })}
      </div>
      {saveFailed && <div style={{ ...help, color: '#f59e0b', marginTop: 8 }}>That link wasn't saved. Try it again.</div>}
      <div style={{ ...help, marginTop: 12 }}>A linked controller gets Turn off, Turn on and Restart power on the wall. These links are shared by every Light Show module.</div>
    </div>
  );
}
