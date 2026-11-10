import React from 'react';
import { accentOf, SEE_THROUGH, stageAccentOf, THEMES, type Theme } from './ui/theme';

const tileStyle = (on: boolean): React.CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: 8, borderRadius: 8, cursor: 'pointer', font: 'inherit',
  borderWidth: 1, borderStyle: 'solid', borderColor: on ? '#3b82f6' : '#2a2a2a', background: on ? 'rgba(59,130,246,.12)' : 'transparent',
});
const nameStyle = (on: boolean): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 600, color: on ? '#93c5fd' : '#d4d4d4', textAlign: 'center', lineHeight: 1.2 });
const swatch: React.CSSProperties = { width: 64, height: 44, borderRadius: 5, position: 'relative', overflow: 'hidden', flex: 'none', boxSizing: 'border-box' };
const group: React.CSSProperties = { gridColumn: '1 / -1', fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: '#8a8a8a', marginTop: 4 };

/** A small picture of the module in a theme: the page, the dark player card
 *  with the accent on it, and three controller cards. */
function Preview({ t }: { t: Theme }) {
  return (
    <div style={{ ...swatch, border: '1px solid rgba(128,128,128,.35)', backgroundColor: t.bg, backgroundImage: t.bgImage ?? 'none' }}>
      <i style={{ position: 'absolute', left: 6, right: 6, top: 6, height: 14, borderRadius: 3, background: 'linear-gradient(120deg,#3b2a6b,#1c3d6e 55%,#0f5a5a)' }} />
      <i style={{ position: 'absolute', left: 9, top: 9, width: 14, height: 3, borderRadius: 2, background: stageAccentOf(t) }} />
      {[0, 1, 2].map((k) => (
        <i key={k} style={{ position: 'absolute', left: 6 + k * 18.5, bottom: 6, width: 15, height: 9, borderRadius: 2, boxSizing: 'border-box', background: t.surface, border: `1px solid ${t.border}` }} />
      ))}
      <i style={{ position: 'absolute', left: 8, bottom: 9, width: 3, height: 3, borderRadius: '50%', background: accentOf(t) }} />
    </div>
  );
}

function Tile({ on, name, onPick, children }: { on: boolean; name: string; onPick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onPick} style={tileStyle(on)}>
      {children}
      <span style={nameStyle(on)}>{name}</span>
    </button>
  );
}

/** The Theme row: See-through, then the full-screen themes as picture tiles. */
export function ThemePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const tiles = (dark: boolean) => THEMES.filter((t) => t.dark === dark).map((t) => (
    <Tile key={t.id} on={value === t.id} name={t.name} onPick={() => onChange(t.id)}><Preview t={t} /></Tile>
  ));
  return (
    <div>
      <span style={{ fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 6 }}>Theme</span>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        <Tile on={value === SEE_THROUGH} name="See-through" onPick={() => onChange(SEE_THROUGH)}>
          <div style={{ ...swatch, border: '1px dashed #525252', background: 'repeating-linear-gradient(45deg,#1c1c1c 0 6px,#262626 6px 12px)' }} />
        </Tile>
        <div style={group}>Light</div>
        {tiles(false)}
        <div style={group}>Dark</div>
        {tiles(true)}
      </div>
      <div style={{ fontSize: 12, color: '#8a8a8a', marginTop: 6, lineHeight: 1.4 }}>
        See-through shows your screen's background behind the module. The others match the themes of the full-screen calendar and weather.
      </div>
    </div>
  );
}
