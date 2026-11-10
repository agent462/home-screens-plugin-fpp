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

/** A heading like "House" or "Yard" and the controllers under it. */
export interface ControllerGroup {
  name: string;
  /** Controller ids in the order they sit under the heading. Ids the player
   *  is not listing right now are kept, so a box that is switched off does
   *  not fall out of its group. */
  ids: readonly string[];
}

export interface ControllerPrefs {
  /** Controller id → the name the family gave it. */
  names: Readonly<Record<string, string>>;
  /** Controller ids in the order the family put them. */
  order: readonly string[];
  /** The groups, top to bottom. Controllers in none of them come first. */
  groups: readonly ControllerGroup[];
}

export const NO_PREFS: ControllerPrefs = { names: {}, order: [], groups: [] };
export const GROUP_NAME_MAX = 24;
const GROUPS_MAX = 24;

/** How a module shows the groups: a heading above each, a small tag on the
 *  first card of each, or not at all. */
export type GroupStyle = 'headings' | 'tags' | 'off';
export const GROUP_STYLES: readonly GroupStyle[] = ['headings', 'tags', 'off'];

export function readControllerPrefs(raw: unknown): ControllerPrefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const names: Record<string, string> = {};
  if (o.names && typeof o.names === 'object' && !Array.isArray(o.names)) {
    for (const [id, value] of Object.entries(o.names as Record<string, unknown>)) {
      const name = text(value, NAME_MAX);
      if (name) names[id] = name;
    }
  }
  const ids = (value: unknown) => (Array.isArray(value) ? value.filter((x): x is string => typeof x === 'string' && !!x) : []);
  // A controller sits in one group: the first that lists it.
  const taken = new Set<string>();
  const groups: ControllerGroup[] = [];
  for (const g of Array.isArray(o.groups) ? o.groups.slice(0, GROUPS_MAX) : []) {
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    const own = [...new Set(ids((g as Record<string, unknown>).ids))].filter((id) => !taken.has(id));
    own.forEach((id) => taken.add(id));
    groups.push({ name: text((g as Record<string, unknown>).name, GROUP_NAME_MAX), ids: own });
  }
  return { names, order: [...new Set(ids(o.order))], groups };
}

/**
 * The controllers as the family named and ordered them. Ones in no group
 * come first: those the family placed, in their order, then the rest the
 * usual way (the player, then by name), so a new box shows up without anyone
 * touching the settings. Then each group's controllers, group by group.
 */
export function arrangeControllers(list: readonly Controller[], prefs: ControllerPrefs): Controller[] {
  return sectionsOf(list, prefs).flatMap((s) => s.items);
}

/** One run of controllers on the wall: a group, or (name null) the ones in
 *  no group. */
export interface Section<T = Controller> {
  name: string | null;
  items: T[];
}

/** What the wall calls a group nobody named yet. */
export const UNNAMED_GROUP = 'Group';

/** The controllers in the runs the wall draws: those in no group first, then
 *  each group that has any of these controllers in it. */
export function sectionsOf(list: readonly Controller[], prefs: ControllerPrefs): Section[] {
  const named = list.map((c) => {
    const name = prefs.names[c.id];
    return name && name !== c.name ? { ...c, name } : c;
  });
  const byId = new Map(named.map((c) => [c.id, c]));
  const grouped = new Set(prefs.groups.flatMap((g) => g.ids));
  const place = new Map(prefs.order.map((id, i) => [id, i]));
  const loose = named.filter((c) => !grouped.has(c.id)).sort((a, b) => {
    const pa = place.get(a.id);
    const pb = place.get(b.id);
    if (pa !== undefined && pb !== undefined) return pa - pb;
    if (pa !== undefined) return -1;
    if (pb !== undefined) return 1;
    return byPlayerThenName(a, b);
  });
  const out: Section[] = loose.length ? [{ name: null, items: loose }] : [];
  for (const g of prefs.groups) {
    const items = g.ids.flatMap((id) => byId.get(id) ?? []);
    if (items.length) out.push({ name: g.name || UNNAMED_GROUP, items });
  }
  return out;
}

/** One line of the Controllers list in the settings: a controller, or the
 *  line that starts a group. */
export type ListItem =
  | { kind: 'controller'; c: Controller }
  /** `away`: the group's controllers the player is not listing right now. */
  | { kind: 'group'; name: string; away: readonly string[] };

/** The settings list, top to bottom: the controllers in no group, then each
 *  group's line followed by its controllers. Empty groups keep their line. */
export function controllerList(list: readonly Controller[], prefs: ControllerPrefs): ListItem[] {
  const here = new Set(list.map((c) => c.id));
  const shown = new Map(arrangeControllers(list, prefs).map((c) => [c.id, c]));
  const grouped = new Set(prefs.groups.flatMap((g) => g.ids));
  const items: ListItem[] = [...shown.values()].filter((c) => !grouped.has(c.id)).map((c) => ({ kind: 'controller', c }));
  for (const g of prefs.groups) {
    items.push({ kind: 'group', name: g.name, away: g.ids.filter((id) => !here.has(id)) });
    for (const id of g.ids) {
      const c = shown.get(id);
      if (c) items.push({ kind: 'controller', c });
    }
  }
  return items;
}

/** The list after moving one line up or down. A controller that crosses a
 *  group's line changes group; a group's line that crosses a controller
 *  takes it in or lets it go. */
export function moveItem(items: readonly ListItem[], index: number, by: -1 | 1): ListItem[] {
  const out = [...items];
  const to = index + by;
  if (index < 0 || index >= out.length || to < 0 || to >= out.length) return out;
  [out[index], out[to]] = [out[to], out[index]];
  return out;
}

/** The order and groups a list stands for. A controller belongs to the group
 *  whose line is the nearest one above it. */
export function orderAndGroups(items: readonly ListItem[]): Pick<ControllerPrefs, 'order' | 'groups'> {
  const order: string[] = [];
  const groups: Array<{ name: string; ids: string[]; away: readonly string[] }> = [];
  for (const item of items) {
    if (item.kind === 'group') { groups.push({ name: item.name, ids: [], away: item.away }); continue; }
    order.push(item.c.id);
    groups[groups.length - 1]?.ids.push(item.c.id);
  }
  return { order, groups: groups.map((g) => ({ name: g.name, ids: [...g.ids, ...g.away] })) };
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
