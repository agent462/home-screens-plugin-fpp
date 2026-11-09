import React from 'react';

// Lucide paths (ISC), drawn inline so the bundle carries no icon library.
const PATHS = {
  therm: <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  warn: <><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>,
  x: <><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>,
  music: <><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  unplug: <><path d="m19 5 3-3" /><path d="m2 22 3-3" /><path d="M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z" /><path d="M7.5 13.5 10 11" /><path d="M10.5 16.5 13 14" /><path d="m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z" /></>,
  pause: <><rect x="14" y="4" width="4" height="16" rx="1" /><rect x="6" y="4" width="4" height="16" rx="1" /></>,
  cal: <><path d="M8 2v4" /><path d="M16 2v4" /><rect width="18" height="18" x="3" y="4" rx="2" /><path d="M3 10h18" /></>,
  vol: <><path d="M11 4.7a.7.7 0 0 0-1.2-.5L6.4 7.6A1.4 1.4 0 0 1 5.4 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.4a1.4 1.4 0 0 1 1 .4l3.4 3.4a.7.7 0 0 0 1.2-.5z" /><path d="M16 9a5 5 0 0 1 0 6" /><path d="M19.4 18.4a9 9 0 0 0 0-12.7" /></>,
  plug: <><path d="M12 22v-5" /><path d="M9 8V2" /><path d="M15 8V2" /><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size, color, style }: { name: IconName; size: string; color?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke={color ?? 'currentColor'} strokeWidth={2}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      style={{ width: size, height: size, flex: 'none', ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

/** A string of five bulbs: the plugin's mark. */
export function BrandMark({ width }: { width: string }) {
  const bulbs: Array<[number, number, string]> = [[12, 13.6, '#ff6b6b'], [25, 18.6, '#ffcf6b'], [39, 20.2, '#5ee08f'], [53, 18.6, '#8fd8ff'], [66, 13.6, '#ff8fd1']];
  return (
    <svg viewBox="0 0 78 44" aria-hidden="true" style={{ width, height: 'auto', flex: 'none' }}>
      <path d="M3 8 Q39 30 75 8" fill="none" stroke="currentColor" strokeOpacity={0.45} strokeWidth={2.2} />
      {bulbs.map(([x, y, c]) => (
        <g key={x}>
          <rect x={x - 2.2} y={y - 1} width={4.4} height={4} rx={1} fill="currentColor" fillOpacity={0.55} />
          <ellipse cx={x} cy={y + 10} rx={11} ry={12} fill={c} opacity={0.18} />
          <ellipse cx={x} cy={y + 10} rx={5.2} ry={7.4} fill={c} />
        </g>
      ))}
    </svg>
  );
}

/** Four still bars beside "Now playing" (still on purpose: a moving layer on
 *  a Pi 4 wall costs a share of the GPU for as long as the show runs). */
export function Bars({ color, height }: { color: string; height: string }) {
  const hs = [0.45, 0.9, 0.6, 1];
  return (
    <span style={{ display: 'inline-flex', gap: '0.2em', alignItems: 'flex-end', height }} aria-hidden="true">
      {hs.map((h, i) => <i key={i} style={{ display: 'block', width: '0.25em', height: `${h * 100}%`, borderRadius: 2, background: color }} />)}
    </span>
  );
}
