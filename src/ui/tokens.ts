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

export const C = {
  ink2: mix(66),
  ink3: mix(42),
  ink4: mix(22),
  glass: mix(5.5),
  glass2: mix(8.5),
  line: mix(9),
  line2: mix(14),
  gold: '#ffcf6b',
  ice: '#8fd8ff',
  ok: '#5ee08f',
  warn: '#fbbf24',
  bad: '#ff6b6b',
  idle: '#9aa6bd',
  okText: '#c6f6d8',
  warnText: '#ffdc85',
  badText: '#ffb3b3',
};

export const TONE = {
  ok: { dot: C.ok, text: C.okText, border: 'rgba(94,224,143,.35)', bg: 'rgba(94,224,143,.14)' },
  warn: { dot: C.warn, text: C.warnText, border: 'rgba(251,191,36,.42)', bg: 'rgba(251,191,36,.08)' },
  bad: { dot: C.bad, text: C.badText, border: 'rgba(255,107,107,.40)', bg: 'rgba(255,107,107,.08)' },
  gold: { dot: C.gold, text: '#ffe3a8', border: 'rgba(255,207,107,.32)', bg: 'rgba(255,207,107,.12)' },
  unknown: { dot: C.idle, text: C.ink2, border: C.line2, bg: C.glass2 },
} as const;
export type ToneName = keyof typeof TONE;

export const ellipsis: CSSProperties = { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
export const clamp = (lines: number): CSSProperties => ({
  display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden',
});
export const tnum: CSSProperties = { fontVariantNumeric: 'tabular-nums' };
export const kicker: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: E(12), fontSize: E(21), fontWeight: 700,
  letterSpacing: '.14em', textTransform: 'uppercase', color: C.gold,
};
