import type { CSSProperties } from 'react';

/** A theme for the module: the same palettes as the Home Screens full-screen
 *  modules, so a show screen can match the calendar or weather screen next
 *  to it. No theme (`see-through`) leaves the module as glass over the
 *  screen's own background, following the module's text color. */
export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  bg: string;
  /** Static gradient layers over `bg`. */
  bgImage?: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  text2: string;
  text3: string;
  border: string;
  shadow: string;
  /** The theme's own accent. Without one the show keeps its gold. */
  accent?: string;
  onAccent?: string;
  /** The accent on the dark player card, for light themes whose accent is too
   *  deep to read there. */
  stageAccent?: string;
  /** Backdrop blur for see-through surfaces. */
  blur?: string;
  /** An opaque card color for the details sheet, where `surface` is see-through. */
  sheet?: string;
}

export const SEE_THROUGH = 'see-through';

export const THEMES: Theme[] = [
  { id: 'linen', name: 'Linen', dark: false, bg: '#f5f1ea', surface: '#fdfcf9', surfaceAlt: '#ede8e0', text: '#1c1917', text2: '#57534e', text3: '#a8a29e', border: '#ddd7cd', shadow: '0 1px 4px rgba(0,0,0,.06)' },
  { id: 'paper', name: 'Paper', dark: false, bg: '#fafafa', surface: '#ffffff', surfaceAlt: '#f5f5f5', text: '#171717', text2: '#525252', text3: '#a3a3a3', border: '#e5e5e5', shadow: '0 1px 4px rgba(0,0,0,.06)' },
  { id: 'mist', name: 'Mist', dark: false, bg: '#eff4fb', surface: '#f8fafd', surfaceAlt: '#e3eaf4', text: '#0f172a', text2: '#475569', text3: '#94a3b8', border: '#d0d9e6', shadow: '0 1px 4px rgba(0,0,0,.06)' },
  {
    id: 'sandstone', name: 'Sandstone', dark: false, bg: '#f4efe5',
    bgImage: 'radial-gradient(102% 41% at 100% 0%, rgba(194,65,12,0.10), transparent 60%), radial-gradient(83% 36% at 0% 100%, rgba(180,140,90,0.16), transparent 62%)',
    surface: '#fffdf8', surfaceAlt: '#ece5d8', text: '#231b13', text2: '#6b5b4a', text3: '#a3927e', border: '#dccfba', shadow: '0 1px 5px rgba(90,60,30,.09)',
    accent: '#C2410C', onAccent: '#ffffff', stageAccent: '#fdba74',
  },
  { id: 'vellum', name: 'Vellum', dark: false, bg: '#faf7f0', surface: '#ffffff', surfaceAlt: '#f3efe6', text: '#12100e', text2: '#5c574f', text3: '#9b958a', border: '#26221e', shadow: 'none', accent: '#B91C1C', onAccent: '#ffffff', stageAccent: '#fca5a5' },
  {
    id: 'bloom', name: 'Bloom', dark: false, bg: '#f6f4fc',
    bgImage: 'radial-gradient(88% 36% at 0% 0%, rgba(124,92,214,0.20), transparent 58%), radial-gradient(83% 36% at 100% 96%, rgba(236,132,177,0.22), transparent 60%)',
    surface: 'rgba(255,255,255,0.72)', surfaceAlt: 'rgba(255,255,255,0.45)', text: '#1e1730', text2: '#5c5375', text3: '#948caa', border: 'rgba(70,50,120,0.16)', shadow: '0 2px 10px rgba(70,50,120,.10)',
    accent: '#7C5CD6', onAccent: '#ffffff', stageAccent: '#c4b5fd', blur: '16px', sheet: '#fbfaff',
  },
  { id: 'charcoal', name: 'Charcoal', dark: true, bg: '#1c1917', surface: '#292524', surfaceAlt: '#211f1d', text: '#fafaf9', text2: '#a8a29e', text3: '#78716c', border: '#44403c', shadow: 'none' },
  { id: 'midnight', name: 'Midnight', dark: true, bg: '#0a0a0a', surface: '#171717', surfaceAlt: '#141414', text: '#fafafa', text2: '#a3a3a3', text3: '#525252', border: '#262626', shadow: 'none' },
  { id: 'slate', name: 'Slate', dark: true, bg: '#0f172a', surface: '#1e293b', surfaceAlt: '#172034', text: '#f8fafc', text2: '#94a3b8', text3: '#64748b', border: '#334155', shadow: 'none' },
  {
    id: 'aurora', name: 'Aurora', dark: true, bg: '#070b18',
    bgImage: 'radial-gradient(102% 42% at 4% -8%, rgba(20,184,166,0.42), transparent 60%), radial-gradient(93% 40% at 108% 20%, rgba(124,58,237,0.44), transparent 58%), radial-gradient(116% 49% at 40% 114%, rgba(56,189,248,0.26), transparent 64%)',
    surface: 'rgba(255,255,255,0.055)', surfaceAlt: 'rgba(255,255,255,0.035)', text: '#f4f7ff', text2: '#a9b5cf', text3: '#6b7794', border: 'rgba(255,255,255,0.13)', shadow: '0 6px 22px rgba(0,0,0,.45)',
    accent: '#5EEAD4', onAccent: '#04211d', blur: '18px', sheet: '#121a2e',
  },
  {
    id: 'obsidian', name: 'Obsidian', dark: true, bg: '#000000',
    bgImage: 'radial-gradient(139% 52% at 50% -16%, rgba(255,255,255,0.11), transparent 68%), radial-gradient(83% 36% at 50% 116%, rgba(245,195,126,0.09), transparent 64%)',
    surface: 'rgba(255,255,255,0.095)', surfaceAlt: 'rgba(255,255,255,0.045)', text: '#f7f7f5', text2: '#9c9a94', text3: '#5e5c57', border: 'rgba(255,255,255,0.14)', shadow: 'none',
    accent: '#F5C37E', onAccent: '#1a1206', blur: '20px', sheet: '#161616',
  },
  {
    id: 'horizon', name: 'Horizon', dark: true, bg: '#0b1020',
    bgImage: 'linear-gradient(180deg, #070c1c 0%, #131b38 38%, #3c2a44 72%, #6b3b34 100%)',
    surface: 'rgba(255,255,255,0.07)', surfaceAlt: 'rgba(255,255,255,0.04)', text: '#fdf6ee', text2: '#c1b6c4', text3: '#877d90', border: 'rgba(255,255,255,0.15)', shadow: '0 6px 22px rgba(0,0,0,.40)',
    accent: '#FDBA74', onAccent: '#2a1608', blur: '18px', sheet: '#1b1a30',
  },
];

const BY_ID = new Map(THEMES.map((t) => [t.id, t]));
export const themeById = (id: string | undefined): Theme | null => (id ? BY_ID.get(id) ?? null : null);

const GOLD = '#ffcf6b';
/** The accent a theme paints with: its own, or the show's gold (a deeper
 *  amber on a light page, where gold text would not read). */
export const accentOf = (t: Theme): string => t.accent ?? (t.dark ? GOLD : '#b45309');
/** The accent on the dark player card. */
export const stageAccentOf = (t: Theme): string => t.stageAccent ?? (t.dark ? accentOf(t) : GOLD);

type Vars = Record<`--ls-${string}`, string>;

/** The theme as custom properties. `tokens.ts` reads each one with the
 *  see-through value as its fallback, so a module with no theme sets none. */
export function themeVars(t: Theme): CSSProperties {
  const accent = accentOf(t);
  const ink = (pct: number) => `color-mix(in srgb, ${t.text} ${pct}%, transparent)`;
  const vars: Vars = {
    '--ls-ink': t.text, '--ls-ink2': t.text2, '--ls-ink3': `color-mix(in srgb, ${t.text2} 50%, ${t.text3})`, '--ls-ink4': t.text3,
    '--ls-glass': t.surface, '--ls-glass2': t.surfaceAlt, '--ls-line': t.border, '--ls-line2': t.border,
    '--ls-fill': ink(8), '--ls-fill2': ink(6), '--ls-track': ink(14), '--ls-bar': accent,
    '--ls-accent': accent, '--ls-accent-text': accent, '--ls-on-accent': t.onAccent ?? (t.dark ? '#1a1408' : '#ffffff'),
    '--ls-stage-accent': stageAccentOf(t), '--ls-stage-line': t.dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.18)',
    '--ls-shadow': t.shadow, '--ls-blur': t.blur ? `blur(${t.blur})` : 'none', '--ls-sheet': t.sheet ?? t.surface,
  };
  if (!t.dark) {
    Object.assign(vars, {
      '--ls-ok': '#16a34a', '--ls-warn': '#d97706', '--ls-bad': '#dc2626', '--ls-idle': '#78716c',
      '--ls-ok-text': '#15803d', '--ls-warn-text': '#a16207', '--ls-bad-text': '#b91c1c',
      '--ls-ice': accent, '--ls-dim': 'rgba(30,25,20,.38)',
    } satisfies Vars);
  }
  return vars as CSSProperties;
}

/** The page a themed module paints on. */
export const themePage = (t: Theme): CSSProperties => ({ backgroundColor: t.bg, backgroundImage: t.bgImage ?? 'none', color: t.text });

/** The strip is one card, not a page of cards: the theme's card color over
 *  its page color, so a see-through surface still ends up solid. */
export const themeCard = (t: Theme): CSSProperties => ({
  backgroundColor: t.bg, backgroundImage: [`linear-gradient(${t.surface}, ${t.surface})`, t.bgImage].filter(Boolean).join(', '),
  color: t.text, border: `1px solid ${t.border}`, boxShadow: t.shadow === 'none' ? undefined : t.shadow,
});

const STAGE_RESET = ['ink', 'ink2', 'ink3', 'ink4', 'glass', 'glass2', 'line', 'line2', 'fill', 'fill2', 'track', 'bar', 'accent-text', 'on-accent',
  'ok', 'warn', 'bad', 'idle', 'ok-text', 'warn-text', 'bad-text', 'ice', 'dim', 'shadow', 'blur'];

/** The player card is a dark stage lit by the cover in every theme. Inside
 *  it every token goes back to its see-through value; only the accent
 *  follows the theme. With no theme `--ls-stage-accent` is unset, which
 *  leaves the accent at its fallback too. */
export const STAGE: CSSProperties = {
  ...Object.fromEntries(STAGE_RESET.map((k) => [`--ls-${k}`, 'initial'])),
  '--ls-accent': 'var(--ls-stage-accent)',
} as CSSProperties;
