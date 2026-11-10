import type { CSSProperties } from 'react';

/** Design pixels (the 1080 x 1920 mockup) in real pixels. `--d` is one
 *  design pixel: the fit scale times the Text size, published once on the
 *  fitted root. A variable, not em, so a size inside text that has its own
 *  size does not compound. */
export const E = (px: number): string => `calc(var(--d, 1px) * ${+px.toFixed(3)})`;

/** The value `--d` takes for a fit scale and the host's font size. */
export const designPx = (fit: number, hostFontSize: number): string => `${+(fit * (hostFontSize / 16)).toFixed(4)}px`;

/** Text and glass follow the module's text color, so a light theme still
 *  reads; status colors are fixed. */
export const mix = (pct: number): string => `color-mix(in srgb, currentColor ${pct}%, transparent)`;

/** A theme token: the theme's value when the module has a theme, else the
 *  see-through value given here (see `theme.ts`). */
export const tv = (name: string, fallback: string): string => `var(--ls-${name}, ${fallback})`;
const tint = (color: string, pct: number): string => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

const gold = tv('accent', '#ffcf6b');
export const C = {
  ink2: tv('ink2', mix(66)),
  ink3: tv('ink3', mix(42)),
  ink4: tv('ink4', mix(22)),
  glass: tv('glass', mix(5.5)),
  glass2: tv('glass2', mix(8.5)),
  line: tv('line', mix(9)),
  line2: tv('line2', mix(14)),
  /** A soft fill for chips and round buttons. */
  fill: tv('fill', 'rgba(255,255,255,.08)'),
  gold,
  onGold: tv('on-accent', '#1a1408'),
  ice: tv('ice', '#8fd8ff'),
  ok: tv('ok', '#5ee08f'),
  warn: tv('warn', '#fbbf24'),
  bad: tv('bad', '#ff6b6b'),
  idle: tv('idle', '#9aa6bd'),
  okText: tv('ok-text', '#c6f6d8'),
  warnText: tv('warn-text', '#ffdc85'),
  badText: tv('bad-text', '#ffb3b3'),
  shadow: tv('shadow', 'none'),
  blur: tv('blur', 'none'),
};
/** The accent as a see-through tint. */
export const goldTint = (pct: number): string => tint(gold, pct);

export const TONE = {
  ok: { dot: C.ok, text: C.okText, border: 'rgba(94,224,143,.35)', bg: 'rgba(94,224,143,.14)' },
  warn: { dot: C.warn, text: C.warnText, border: 'rgba(251,191,36,.42)', bg: 'rgba(251,191,36,.08)' },
  bad: { dot: C.bad, text: C.badText, border: 'rgba(255,107,107,.40)', bg: 'rgba(255,107,107,.08)' },
  gold: { dot: C.gold, text: tv('accent-text', '#ffe3a8'), border: goldTint(32), bg: goldTint(12) },
  unknown: { dot: C.idle, text: C.ink2, border: C.line2, bg: C.glass2 },
} as const;
export type ToneName = keyof typeof TONE;

/** A 1 px border as longhand properties. Anything that later swaps only the
 *  color must start from this, not the `border` shorthand: React warns, and
 *  can leave the wrong color, when a longhand is added or dropped under a
 *  shorthand between renders. */
export const outline = (color: string): CSSProperties => ({ borderWidth: 1, borderStyle: 'solid', borderColor: color });

export const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
export const clamp = (lines: number): CSSProperties => ({
  display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
});
export const tnum: CSSProperties = { fontVariantNumeric: 'tabular-nums' };
export const kicker: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: E(12), fontSize: E(21), fontWeight: 700,
  letterSpacing: '.14em', textTransform: 'uppercase', color: C.gold,
};
