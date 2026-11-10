import React from 'react';
import { CONTROLLERS_SETTING, PLUGIN_ID } from './config';
import { arrangeControllers, moveController, NAME_MAX, type ControllerPrefs } from './lib/show';
import type { Controller } from './lib/systems';

// The "Controllers" part of the module settings: which ones this module
// shows, and what each is called and where it sits. The names and order are
// saved in the plugin's own settings, so every Light Show module and wall
// shares them; which ones show is this module's own.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 6 };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', lineHeight: 1.45 };
const arrow: React.CSSProperties = { width: 22, height: 22, flex: 'none', padding: 0, borderRadius: 5, background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', fontSize: 11, lineHeight: 1, cursor: 'pointer' };
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: '#d4d4d4', textDecoration: 'underline', fontSize: 12, cursor: 'pointer' };

interface Props {
  /** The controllers as the player lists them, with their own names. */
  controllers: Controller[];
  hidden: readonly string[];
  onHidden: (ids: string[]) => void;
  prefs: ControllerPrefs;
  /** The parent keeps the prefs so the Power list below shows the same names. */
  onPrefs: (prefs: ControllerPrefs) => void;
}

export function ControllersSettings({ controllers, hidden, onHidden, prefs, onPrefs }: Props) {
  const sdk = window.__HS_SDK__;
  const inputClass = sdk?.INPUT_CLASS ?? '';
  const [saveFailed, setSaveFailed] = React.useState(false);
  const shown = arrangeControllers(controllers, prefs);
  const own = new Map(controllers.map((c) => [c.id, c.name]));
  const hiddenSet = new Set(hidden);

  const save = async (next: ControllerPrefs) => {
    const before = prefs;
    onPrefs(next);
    setSaveFailed(false);
    const result = await sdk?.setPluginSettings?.(PLUGIN_ID, { [CONTROLLERS_SETTING]: { names: next.names, order: next.order } });
    if (!result?.ok) { onPrefs(before); setSaveFailed(true); }
  };

  const setHidden = (id: string, hide: boolean) => {
    const next = new Set(hiddenSet);
    if (hide) next.add(id); else next.delete(id);
    onHidden([...next]);
  };

  const rename = (id: string, value: string) => {
    const name = value.trim().slice(0, NAME_MAX);
    const names = { ...prefs.names };
    // Their own name back again is no rename at all.
    if (name && name !== own.get(id)) names[id] = name; else delete names[id];
    if ((names[id] ?? '') !== (prefs.names[id] ?? '')) void save({ ...prefs, names });
  };

  return (
    <div>
      <span style={label}>Controllers</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 320, overflowY: 'auto' }}>
        {shown.map((c, i) => {
          const original = own.get(c.id) ?? c.name;
          return (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" aria-label={`Show ${c.name}`} checked={!hiddenSet.has(c.id)} onChange={(e) => setHidden(c.id, !e.target.checked)} style={{ flex: 'none' }} />
              <input
                // Remounts when the saved name changes, so the box always shows what is saved.
                key={prefs.names[c.id] ?? ''}
                className={inputClass}
                aria-label={`Name for ${original}`}
                title={`${original} · ${c.address}`}
                defaultValue={prefs.names[c.id] ?? ''}
                placeholder={original}
                maxLength={NAME_MAX}
                onBlur={(e) => rename(c.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ flex: 1, minWidth: 0, fontSize: 12, opacity: hiddenSet.has(c.id) ? 0.55 : 1 }}
              />
              <button type="button" style={{ ...arrow, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} aria-label={`Move ${c.name} up`} onClick={() => void save({ ...prefs, order: moveController(shown, c.id, -1) })}>▲</button>
              <button type="button" style={{ ...arrow, opacity: i === shown.length - 1 ? 0.35 : 1 }} disabled={i === shown.length - 1} aria-label={`Move ${c.name} down`} onClick={() => void save({ ...prefs, order: moveController(shown, c.id, 1) })}>▼</button>
            </div>
          );
        })}
      </div>
      {saveFailed && <div style={{ ...help, color: '#f59e0b', marginTop: 8 }}>That wasn't saved. Try it again.</div>}
      <div style={{ ...help, marginTop: 8 }}>
        Untick one to leave it out of this module. Type a name to call it something else, and use the arrows to put the ones you care about first. Names and order are shared by every Light Show module.
        {prefs.order.length > 0 && <> <button type="button" style={link} onClick={() => void save({ ...prefs, order: [] })}>Back to the usual order</button></>}
      </div>
    </div>
  );
}
