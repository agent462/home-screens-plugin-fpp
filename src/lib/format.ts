/** Small formatting rules shared by every view. Time zone and locale are
 *  passed in, never read from the host, so these stay pure and testable. */

export type Units = 'metric' | 'imperial';

export function num(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v) : NaN;
  return Number.isFinite(n) ? n : 0;
}

/** 94 → "1:34". */
export function mmss(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** FPP reports °C; the wall follows the hub's units. */
export function temperature(celsius: number, units: Units): number {
  return Math.round(units === 'imperial' ? (celsius * 9) / 5 + 32 : celsius);
}

/** A span of time in words: "45 sec", "6 min", "1 h 5 min", "3 days". */
export function spanText(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60000);
  if (min < 1) return `${Math.max(1, Math.floor(Math.max(0, ms) / 1000))} sec`;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 48) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`;
  return `${Math.floor(h / 24)} days`;
}

/** Uptime the way a card has room for: "12 m", "2 h 4 m", "3 d 4 h". */
export function uptimeText(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d} d ${h} h`;
  if (h) return `${h} h ${m} m`;
  return `${m} m`;
}

function fmt(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(locale, options);
  } catch {
    // An unknown zone or locale must not take the wall down.
    const { timeZone: _tz, ...rest } = options;
    return new Intl.DateTimeFormat('en-US', rest);
  }
}

/** "7:36 PM". */
export function clockText(epochMs: number, timeZone: string, locale: string): string {
  return fmt(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(epochMs);
}

/** "Friday, November 27" or, short, "Fri, Nov 27". */
export function dayText(epochMs: number, timeZone: string, locale: string, short = false): string {
  return fmt(locale, short
    ? { timeZone, weekday: 'short', month: 'short', day: 'numeric' }
    : { timeZone, weekday: 'long', month: 'long', day: 'numeric' }).format(epochMs);
}

/** "Nov 27". */
export function monthDayText(epochMs: number, timeZone: string, locale: string): string {
  return fmt(locale, { timeZone, month: 'short', day: 'numeric' }).format(epochMs);
}

/** The calendar date in a zone, as YYYY-MM-DD. */
export function isoDateIn(epochMs: number, timeZone: string): string {
  const parts = fmt('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(epochMs);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Whole calendar days from one instant to another in a zone (0 = same day). */
export function calendarDaysBetween(fromMs: number, toMs: number, timeZone: string): number {
  const a = Date.parse(`${isoDateIn(fromMs, timeZone)}T00:00:00Z`);
  const b = Date.parse(`${isoDateIn(toMs, timeZone)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

/** "17:00:00" → "5:00 PM" in the given locale (no zone math: it is a wall time). */
export function wallTimeText(hms: string, locale: string): string | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(hms ?? '');
  if (!m) return null;
  const d = new Date(Date.UTC(2000, 0, 1, Number(m[1]), Number(m[2])));
  return fmt(locale, { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }).format(d);
}

/** "5:00 to 11:00 PM" when both sides share AM/PM, else "11:00 AM to 1:00 PM". */
export function windowText(startHms: string, endHms: string, locale: string): string | null {
  const a = wallTimeText(startHms, locale);
  const b = wallTimeText(endHms, locale);
  if (!a || !b) return null;
  const suffix = (t: string) => /\s?(AM|PM)$/i.exec(t)?.[0] ?? '';
  const sa = suffix(a);
  if (sa && sa === suffix(b)) return `${a.slice(0, -sa.length)} to ${b}`;
  return `${a} to ${b}`;
}
