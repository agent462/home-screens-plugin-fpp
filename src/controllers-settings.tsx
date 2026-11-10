import React from 'react';
import { CONTROLLERS_SETTING, PLUGIN_ID } from './config';
import { controllerList, GROUP_NAME_MAX, moveItem, NAME_MAX, orderAndGroups, type ControllerPrefs, type GroupStyle, type ListItem } from './lib/show';
import type { Controller } from './lib/systems';

// The "Controllers" part of the module settings: which ones this module
// shows, what each is called, where it sits and which group it is in. A group
// is a line in the list, and a controller belongs to the group it sits under.
// The names, order and groups are saved in the plugin's own settings, so every
// Light Show module and wall shares them; which ones show, and how the groups
// are drawn, are this module's own.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 6 };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', lineHeight: 1.45 };
const arrow: React.CSSProperties = { width: 22, height: 22, flex: 'none', padding: 0, borderRadius: 5, background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', fontSize: 11, lineHeight: 1, cursor: 'pointer' };
const link: React.CSSProperties = { background: 'none', border: 'none', padding: 0, color: '#d4d4d4', textDecoration: 'underline', fontSize: 12, cursor: 'pointer' };
const ghost: React.CSSProperties = { background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer', marginTop: 10 };
const groupName: React.CSSProperties = { flex: 1, minWidth: 0, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', background: '#1b2030', borderColor: '#3a4566', color: '#dbe4ff' };

interface Props {
  /** The controllers as the player lists them, with their own names. */
  controllers: Controller[];
  hidden: readonly string[];
  onHidden: (ids: string[]) => void;
  prefs: ControllerPrefs;
  /** The parent keeps the prefs so the Power list below shows the same names. */
  onPrefs: (prefs: ControllerPrefs) => void;
  /** How this module draws the groups. */
  groupStyle: GroupStyle;
  onGroupStyle: (style: GroupStyle) => void;
}

export function ControllersSettings({ controllers, hidden, onHidden, prefs, onPrefs, groupStyle, onGroupStyle }: Props) {
  const sdk = window.__HS_SDK__;
  const inputClass = sdk?.INPUT_CLASS ?? '';
  const [saveFailed, setSaveFailed] = React.useState(false);
  // The group that was just added, so its name box takes the cursor.
  const [fresh, setFresh] = React.useState(-1);
  const items = controllerList(controllers, prefs);
  const own = new Map(controllers.map((c) => [c.id, c.name]));
  const hiddenSet = new Set(hidden);
  const grouped = prefs.groups.length > 0;
  // A group with nothing under it yet (a new one starts that way).
  const empty = items.some((item, i) => item.kind === 'group' && items[i + 1]?.kind !== 'controller');

  const save = async (next: ControllerPrefs) => {
    const before = prefs;
    onPrefs(next);
    setSaveFailed(false);
    const result = await sdk?.setPluginSettings?.(PLUGIN_ID, { [CONTROLLERS_SETTING]: { names: next.names, order: next.order, groups: next.groups } });
    if (!result?.ok) { onPrefs(before); setSaveFailed(true); }
  };
  const saveList = (list: ListItem[]) => save({ ...prefs, ...orderAndGroups(list) });

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

  const renameGroup = (index: number, value: string) => {
    const item = items[index];
    const name = value.trim().slice(0, GROUP_NAME_MAX);
    if (item.kind !== 'group' || name === item.name) return;
    void saveList(items.map((it, i) => (i === index ? { ...item, name } : it)));
  };

  const addGroup = () => {
    setFresh(items.length);
    void saveList([...items, { kind: 'group', name: '', away: [] }]);
  };

  const arrows = (i: number, what: string) => (
    <>
      <button type="button" style={{ ...arrow, opacity: i === 0 ? 0.35 : 1 }} disabled={i === 0} aria-label={`Move ${what} up`} onClick={() => { setFresh(-1); void saveList(moveItem(items, i, -1)); }}>▲</button>
      <button type="button" style={{ ...arrow, opacity: i === items.length - 1 ? 0.35 : 1 }} disabled={i === items.length - 1} aria-label={`Move ${what} down`} onClick={() => { setFresh(-1); void saveList(moveItem(items, i, 1)); }}>▼</button>
    </>
  );

  // Which group each line is, counting from the top, so its key holds still
  // while it is renamed.
  let groupNo = 0;
  return (
    <div>
      <span style={label}>Controllers</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 360, overflowY: 'auto' }}>
        {items.map((item, i) => {
          if (item.kind === 'group') {
            const what = item.name ? `the ${item.name} group` : 'the new group';
            return (
              <div key={`group-${groupNo++}`} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: i === 0 ? 0 : 9 }}>
                <i style={{ width: 13, height: 1, flex: 'none', background: '#3a4566' }} />
                <input
                  // Remounts when the saved name changes, so the box always shows what is saved.
                  key={item.name}
                  className={inputClass}
                  aria-label={item.name ? `Name of the ${item.name} group` : 'Name of the new group'}
                  defaultValue={item.name}
                  placeholder="Name this group"
                  maxLength={GROUP_NAME_MAX}
                  autoFocus={i === fresh}
                  onBlur={(e) => renameGroup(i, e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  style={item.name ? groupName : { ...groupName, textTransform: 'none', letterSpacing: 0, fontSize: 12, fontWeight: 500 }}
                />
                {arrows(i, what)}
                <button type="button" style={arrow} aria-label={`Take ${what} away`} onClick={() => { setFresh(-1); void saveList(items.filter((_, k) => k !== i)); }}>✕</button>
              </div>
            );
          }
          const c = item.c;
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
              {arrows(i, c.name)}
            </div>
          );
        })}
      </div>
      <button type="button" style={ghost} onClick={addGroup}>Add a group</button>
      {saveFailed && <div style={{ ...help, color: '#f59e0b', marginTop: 8 }}>That wasn't saved. Try it again.</div>}
      {empty && <div style={{ ...help, marginTop: 8, color: '#cfe0ff' }}>A new group starts at the bottom, empty. Name it, then move its line up to take controllers in.</div>}
      <div style={{ ...help, marginTop: 8 }}>
        {grouped
          ? "A controller belongs to the group it sits under. Move it with the arrows, or move a group's line to take in more or fewer. ✕ takes a group away and keeps its controllers. Names, order and groups are shared by every Light Show module."
          : 'Untick one to leave it out of this module. Type a name to call it something else, and use the arrows to put the ones you care about first. Add a group to put a heading like House or Yard on the wall. Names, order and groups are shared by every Light Show module.'}
        {!grouped && prefs.order.length > 0 && <> <button type="button" style={link} onClick={() => void save({ ...prefs, order: [] })}>Back to the usual order</button></>}
      </div>
      {grouped && (
        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={{ ...label, marginBottom: 4 }}>Groups on this module</span>
          <select className={inputClass} value={groupStyle} onChange={(e) => onGroupStyle(e.target.value as GroupStyle)}>
            <option value="headings">A heading above each group</option>
            <option value="tags">A small tag on each group's first card</option>
            <option value="off">Don't show them</option>
          </select>
          <div style={{ ...help, marginTop: 4 }}>Headings read best but make the cards a little shorter. Tags take no room.</div>
        </label>
      )}
    </div>
  );
}
