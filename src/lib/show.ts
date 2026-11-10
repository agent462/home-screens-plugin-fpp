/** What a family calls their show and its controllers. Saved once for the
 *  plugin, so every Light Show module and wall agrees. Pure: these only read
 *  what was saved. */
import { byPlayerThenName, type Controller } from './systems';

export const DEFAULT_TITLE = 'Light Show';
export const TITLE_MAX = 60;
export const NAME_MAX = 40;

/** The hub keeps all of a plugin's settings in 32 KB, so the logo is shrunk
 *  until its text fits in this much of it. */
export const LOGO_MAX_CHARS = 20_000;
/** Heights tried in turn when shrinking a logo, tallest first. The header
 *  draws it about 72 px tall, twice that on a 4K wall. */
export const LOGO_HEIGHTS = [176, 144, 112, 88, 64];
/** A logo is never drawn wider than this many times its height. */
export const LOGO_MAX_ASPECT = 3;

const LOGO = /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Only a small picture made by the settings panel reaches the wall. */
export const logoOf = (value: unknown): string | null =>
  (typeof value === 'string' && value.length <= LOGO_MAX_CHARS && LOGO.test(value) ? value : null);

/** The line under the show's name: today's date, the show's hours, the
 *  family's own words, or nothing. */
export type Subtitle = 'date' | 'hours' | 'words' | 'none';
export const SUBTITLES: readonly Subtitle[] = ['date', 'hours', 'words', 'none'];

export interface ShowSettings {
  /** '' when the family has not named it. */
  name: string;
  logo: string | null;
  /** The playlist that is the show; '' follows the player's schedule. */
  mainPlaylist: string;
}

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export function readShow(raw: unknown): ShowSettings {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  return { name: text(o.name, TITLE_MAX), logo: logoOf(o.logo), mainPlaylist: text(o.mainPlaylist, 200) };
}

/** The name on the wall. A logo with no name stands on its own, for a logo
 *  that already has the name in it. */
export const titleOf = (show: ShowSettings) => show.name || (show.logo ? '' : DEFAULT_TITLE);

export interface ControllerPrefs {
  /** Controller id → the name the family gave it. */
  names: Readonly<Record<string, string>>;
  /** Controller ids in the order the family put them. */
  order: readonly string[];
}

export const NO_PREFS: ControllerPrefs = { names: {}, order: [] };

export function readControllerPrefs(raw: unknown): ControllerPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const names: Record<string, string> = {};
  if (o.names && typeof o.names === 'object' && !Array.isArray(o.names)) {
    for (const [id, value] of Object.entries(o.names as Record<string, unknown>)) {
      const name = text(value, NAME_MAX);
      if (name) names[id] = name;
    }
  }
  const order = Array.isArray(o.order) ? [...new Set(o.order.filter((x): x is string => typeof x === 'string' && !!x))] : [];
  return { names, order };
}

/**
 * The controllers as the family named and ordered them. Ones they placed
 * come first, in their order; the rest follow the usual way (the player,
 * then by name), so a new box shows up without anyone touching the settings.
 */
export function arrangeControllers(list: readonly Controller[], prefs: ControllerPrefs): Controller[] {
  const named = list.map((c) => {
    const name = prefs.names[c.id];
    return name && name !== c.name ? { ...c, name } : c;
  });
  const place = new Map(prefs.order.map((id, i) => [id, i]));
  return named.sort((a, b) => {
    const pa = place.get(a.id);
    const pb = place.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return byPlayerThenName(a, b);
  });
}

/** The order after moving one controller up or down the list it is shown in. */
export function moveController(shown: readonly Controller[], id: string, by: -1 | 1): string[] {
  const ids = shown.map((c) => c.id);
  const from = ids.indexOf(id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= ids.length) return ids;
  [ids[from], ids[to]] = [ids[to], ids[from]];
  return ids;
}

/** The size to draw a picture at so it is `height` tall, and no wider than
 *  the header has room for. */
export function logoSize(width: number, height: number, target: number): { w: number; h: number } {
  if (!(width > 0) || !(height > 0)) return { w: 0, h: 0 };
  let h = Math.min(target, height);
  let w = (width / height) * h;
  const widest = target * LOGO_MAX_ASPECT;
  if (w > widest) { h *= widest / w; w = widest; }
  return { w: Math.max(1, Math.round(w)), h: Math.max(1, Math.round(h)) };
}
