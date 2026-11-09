import type { FppSensor } from './fpp-types';

/** Chip or board at or above this is "Running hot" (°C). */
export const HOT_C = 75;
/** A supply this far under its nominal voltage is "Low power". */
export const LOW_POWER_FRACTION = 0.95;

export type SensorKind = 'chip' | 'board' | 'power';

export interface SensorReading {
  kind: SensorKind;
  label: string;
  value: number;
}

export interface SensorSummary {
  /** Hottest processor reading (°C). */
  chip: number | null;
  /** Hottest cape or board reading (°C). */
  board: number | null;
  /** Hottest of everything (°C). */
  hottest: number | null;
  /** Lowest supply input (V). */
  lowestSupply: number | null;
  /** 5, 12 or 24, guessed from the highest supply. */
  nominal: number | null;
  hot: boolean;
  lowPower: boolean;
  readings: SensorReading[];
}

const cleanLabel = (label: string | undefined) => (label ?? '').replace(/[:\s]+$/, '').trim();
const CHIP = /^(MAIN\d*|CPU\d*|SOC)\b/i;

export function nominalVoltage(highest: number): number | null {
  if (highest > 18) return 24;
  if (highest > 8) return 12;
  if (highest > 3.5) return 5;
  return null;
}

/**
 * What a card needs from FPP's sensor list. Readings of zero or below are
 * dropped: some capes report an unwired probe as 0.0 (Arches Right's `Temp`).
 */
export function summarizeSensors(sensors: FppSensor[] | undefined): SensorSummary {
  const readings: SensorReading[] = [];
  for (const s of sensors ?? []) {
    const value = typeof s.value === 'number' ? s.value : NaN;
    if (!Number.isFinite(value) || value <= 1) continue;
    const label = cleanLabel(s.label);
    const type = (s.valueType ?? '').toLowerCase();
    if (type === 'voltage' || /^VIN/i.test(label)) readings.push({ kind: 'power', label, value });
    else if (type === 'temperature' || /temp/i.test(label) || CHIP.test(label)) {
      readings.push({ kind: CHIP.test(label) ? 'chip' : 'board', label, value });
    }
  }
  const max = (k: SensorKind) => {
    const v = readings.filter((r) => r.kind === k).map((r) => r.value);
    return v.length ? Math.max(...v) : null;
  };
  const supplies = readings.filter((r) => r.kind === 'power').map((r) => r.value);
  const chip = max('chip');
  const board = max('board');
  const temps = [chip, board].filter((v): v is number => v !== null);
  const hottest = temps.length ? Math.max(...temps) : null;
  const lowestSupply = supplies.length ? Math.min(...supplies) : null;
  const nominal = supplies.length ? nominalVoltage(Math.max(...supplies)) : null;
  return {
    chip,
    board,
    hottest,
    lowestSupply,
    nominal,
    hot: hottest !== null && hottest >= HOT_C,
    lowPower: lowestSupply !== null && nominal !== null && lowestSupply < nominal * LOW_POWER_FRACTION,
    readings,
  };
}

/** Friendly names for the detail sheet: "Chip", "Board 2", "Power 1". */
export function readingNames(readings: SensorReading[]): string[] {
  const totals: Record<SensorKind, number> = { chip: 0, board: 0, power: 0 };
  for (const r of readings) totals[r.kind]++;
  const seen: Record<SensorKind, number> = { chip: 0, board: 0, power: 0 };
  const word: Record<SensorKind, string> = { chip: 'Chip', board: 'Board', power: 'Power' };
  return readings.map((r) => {
    seen[r.kind]++;
    return totals[r.kind] > 1 ? `${word[r.kind]} ${seen[r.kind]}` : word[r.kind];
  });
}

/** FPP warnings are strings on 10.x and may be objects later. */
export function warningTexts(warnings: unknown[] | undefined): string[] {
  const out: string[] = [];
  for (const w of warnings ?? []) {
    if (typeof w === 'string' && w.trim()) out.push(w.trim());
    else if (w && typeof w === 'object') {
      const m = (w as { message?: unknown; text?: unknown }).message ?? (w as { text?: unknown }).text;
      if (typeof m === 'string' && m.trim()) out.push(m.trim());
    }
  }
  return out;
}
