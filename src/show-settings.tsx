import React from 'react';
import { PLUGIN_ID, savedShow, SHOW_SETTING } from './config';
import { DEFAULT_TITLE, LOGO_HEIGHTS, logoOf, logoSize, TITLE_MAX, type ShowSettings } from './lib/show';
import { BrandMark } from './ui/icons';

// The "Your show" part of the module settings: the show's name, its logo and
// which playlist is the show. Saved in the plugin's own settings, not this
// module's, so every Light Show module and wall shares them.

const label: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', marginBottom: 4 };
const sub: React.CSSProperties = { fontSize: 12, color: '#a3a3a3', display: 'block', margin: '10px 0 4px' };
const help: React.CSSProperties = { fontSize: 12, color: '#8a8a8a', marginTop: 4, lineHeight: 1.4 };
const ghost: React.CSSProperties = { background: 'transparent', border: '1px solid #3a3a3a', color: '#d4d4d4', borderRadius: 6, padding: '5px 9px', fontSize: 12, cursor: 'pointer' };

type LogoResult = { logo: string } | { problem: 'read' | 'big' };

/**
 * A picked picture, shrunk until it is small enough to keep with the
 * plugin's settings. WebP first (it keeps see-through corners and is small),
 * PNG where the browser cannot write WebP.
 */
async function shrinkLogo(file: File): Promise<LogoResult> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    for (const target of LOGO_HEIGHTS) {
      const { w, h } = logoSize(img.naturalWidth, img.naturalHeight, target);
      if (!w) return { problem: 'read' };
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return { problem: 'read' };
      ctx.drawImage(img, 0, 0, w, h);
      for (const [type, quality] of [['image/webp', 0.9], ['image/webp', 0.75], ['image/png', 1]] as const) {
        const data = canvas.toDataURL(type, quality);
        if (data.startsWith(`data:${type}`) && logoOf(data)) return { logo: data };
      }
    }
    return { problem: 'big' };
  } catch {
    return { problem: 'read' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

const PROBLEM = {
  read: "Couldn't read that picture. Try a PNG or JPG.",
  big: 'That picture has too much detail to shrink down. Try a simpler one.',
  save: "That wasn't saved. Try it again.",
};

/** `playlists` is the player's list, or null while it is not known. */
export function ShowSettingsPanel({ playlists }: { playlists: string[] | null }) {
  const sdk = window.__HS_SDK__;
  const inputClass = sdk?.INPUT_CLASS ?? '';
  const [show, setShow] = React.useState<ShowSettings>(() => savedShow());
  const [name, setName] = React.useState(show.name);
  const [problem, setProblem] = React.useState<keyof typeof PROBLEM | null>(null);
  const [busy, setBusy] = React.useState(false);
  const file = React.useRef<HTMLInputElement | null>(null);

  const save = React.useCallback(async (patch: Partial<ShowSettings>) => {
    const before = show;
    const next = { ...show, ...patch };
    setShow(next);
    setProblem(null);
    const result = await sdk?.setPluginSettings?.(PLUGIN_ID, {
      [SHOW_SETTING]: { name: next.name, mainPlaylist: next.mainPlaylist, ...(next.logo ? { logo: next.logo } : {}) },
    });
    if (!result?.ok) { setShow(before); setProblem('save'); }
  }, [sdk, show]);

  const commitName = () => {
    const value = name.trim().slice(0, TITLE_MAX);
    if (value !== name) setName(value);
    if (value !== show.name) void save({ name: value });
  };

  const pick = async (picked: File | undefined) => {
    if (!picked || busy) return;
    setBusy(true);
    try {
      const result = await shrinkLogo(picked);
      if ('logo' in result) await save({ logo: result.logo });
      else setProblem(result.problem);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  };

  const main = show.mainPlaylist;
  const gone = !!main && !!playlists && !playlists.includes(main);

  return (
    <div>
      <span style={label}>Your show</span>
      <label>
        <span style={{ ...sub, marginTop: 4 }}>Name</span>
        <input
          className={inputClass}
          value={name}
          maxLength={TITLE_MAX}
          placeholder={show.logo ? 'No name, just the logo' : DEFAULT_TITLE}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
      </label>

      <span style={sub}>Logo</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 96, height: 52, borderRadius: 6, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#12152a', border: '1px solid #2a2a2a', color: '#f4f6ff', overflow: 'hidden' }}>
          {show.logo
            ? <img src={show.logo} alt="Your logo" style={{ maxWidth: 84, maxHeight: 40, objectFit: 'contain' }} />
            : <BrandMark width="52px" />}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" style={ghost} disabled={busy} onClick={() => file.current?.click()}>{busy ? 'Working…' : show.logo ? 'Change' : 'Choose a picture'}</button>
          {show.logo && <button type="button" style={ghost} disabled={busy} onClick={() => void save({ logo: null })}>Remove</button>}
        </div>
        <input ref={file} type="file" accept="image/*" aria-label="Logo picture" style={{ display: 'none' }} onChange={(e) => void pick(e.target.files?.[0])} />
      </div>
      <div style={help}>Shown beside the name, made small to fit. A see-through background looks best. If your logo already has the name in it, leave Name empty and it stands on its own.</div>

      {(playlists || main) && (
        <label>
          <span style={sub}>Main show playlist</span>
          <select className={inputClass} value={main} disabled={!playlists} onChange={(e) => void save({ mainPlaylist: e.target.value })} style={gone ? { color: '#fcd34d', border: '1px solid rgba(245,158,11,.6)' } : undefined}>
            <option value="">Follow the player's schedule</option>
            {(gone || !playlists) && main && <option value={main}>{main}</option>}
            {(playlists ?? []).map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={{ ...help, color: gone ? '#f59e0b' : help.color }}>
            {gone
              ? 'That playlist is not on the player any more. Pick another one.'
              : 'Pick one if your player also runs other playlists, like a pre-show or a test list. The wall then counts only this one as the show.'}
          </div>
        </label>
      )}

      {problem && <div style={{ ...help, color: '#f59e0b', marginTop: 8 }}>{PROBLEM[problem]}</div>}
      <div style={{ ...help, marginTop: 8 }}>Shared by every Light Show module.</div>
    </div>
  );
}
