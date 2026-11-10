/** Controller power: the rules that need no network. Which outlet belongs to
 *  which controller, what Home Assistant's answers mean, and which outlets to
 *  offer. The calls themselves are in `ha.ts`. */

export type OutletState = 'on' | 'off' | 'na';

/** One switch in Home Assistant, as the settings panel lists it. */
export interface Outlet {
  /** Home Assistant entity id, like `switch.garage_plug`. */
  id: string;
  name: string;
  state: OutletState;
  /** The strip or plug it belongs to, for grouping. */
  groupId: string;
  groupName: string;
  /** From the TP-Link (Tapo, Kasa) integration. */
  tapo: boolean;
  /** The socket itself, not a setting of the plug (LED, child lock). */
  socket: boolean;
}

/** What the wall knows about a linked outlet. */
export interface OutletReading {
  state: OutletState;
  name: string;
  /** When it last changed state, epoch ms. */
  changedAt: number | null;
}

/** Controller id → outlet entity id. Saved once for the plugin. */
export type Links = Readonly<Record<string, string>>;

export const isEntityId = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9_]+\.[a-z0-9_]+$/.test(s);

export function readLinks(raw: unknown): Links {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, entity] of Object.entries(raw as Record<string, unknown>)) {
    if (id && isEntityId(entity)) out[id] = entity;
  }
  return out;
}

const toState = (s: unknown): OutletState => (s === 'on' ? 'on' : s === 'off' ? 'off' : 'na');

/** Every switch Home Assistant has, with what is needed to group and filter
 *  them. Rendered by Home Assistant's template endpoint, answered as JSON. */
export const OUTLETS_TEMPLATE = [
  "{% set tp = integration_entities('tplink') + integration_entities('tapo') %}",
  '{% set ns = namespace(out=[]) %}',
  '{% for s in states.switch %}',
  '{% set d = device_id(s.entity_id) %}',
  "{% set via = device_attr(d, 'via_device_id') if d else none %}",
  "{% set ns.out = ns.out + [{'id': s.entity_id, 'name': s.name, 'state': s.state, 'device': d,",
  " 'deviceName': (device_attr(d, 'name_by_user') or device_attr(d, 'name')) if d else none,",
  " 'via': via, 'viaName': (device_attr(via, 'name_by_user') or device_attr(via, 'name')) if via else none,",
  " 'tapo': s.entity_id in tp, 'cls': s.attributes.device_class | default(none)}] %}",
  '{% endfor %}',
  '{{ ns.out | tojson }}',
].join('');

/** The state of just these outlets, in one request. */
export function statesTemplate(ids: readonly string[]): string {
  const list = ids.filter(isEntityId).map((id) => `'${id}'`).join(', ');
  return [
    '{% set ns = namespace(out=[]) %}',
    `{% for id in [${list}] %}`,
    '{% set s = states[id] %}',
    "{% set ns.out = ns.out + [{'id': id, 'state': s.state if s else none, 'name': s.name if s else none,",
    " 'changed': as_timestamp(s.last_changed) if s else none}] %}",
    '{% endfor %}',
    '{{ ns.out | tojson }}',
  ].join('');
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseOutlets(data: unknown): Outlet[] {
  if (!Array.isArray(data)) return [];
  const out: Outlet[] = [];
  for (const row of data as Array<Record<string, unknown>>) {
    if (!row || !isEntityId(row.id)) continue;
    const name = str(row.name) || row.id;
    const deviceName = str(row.deviceName);
    const via = str(row.via);
    out.push({
      id: row.id,
      name,
      state: toState(row.state),
      // A strip's sockets are their own devices under the strip.
      groupId: via || str(row.device) || row.id,
      groupName: via ? str(row.viaName) || deviceName : deviceName || name,
      tapo: row.tapo === true,
      // A plug's socket carries the plug's own name; its settings (LED,
      // child lock) carry a longer one.
      socket: row.cls === 'outlet' || (!!deviceName && name === deviceName),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/** Entity id → reading, `null` when Home Assistant no longer has it. */
export function parseStates(data: unknown): Record<string, OutletReading | null> {
  const out: Record<string, OutletReading | null> = {};
  if (!Array.isArray(data)) return out;
  for (const row of data as Array<Record<string, unknown>>) {
    if (!row || !isEntityId(row.id)) continue;
    out[row.id] = row.state == null ? null : {
      state: toState(row.state),
      name: str(row.name) || row.id,
      changedAt: typeof row.changed === 'number' && Number.isFinite(row.changed) ? Math.round(row.changed * 1000) : null,
    };
  }
  return out;
}

/** The outlets the picker offers first: Tapo and Kasa sockets. When none of
 *  them look like a socket, every Tapo and Kasa switch, so a plug this guess
 *  misreads can still be picked. */
export function mainOutlets(all: readonly Outlet[]): Outlet[] {
  const tapo = all.filter((o) => o.tapo);
  const sockets = tapo.filter((o) => o.socket);
  return sockets.length ? sockets : tapo;
}

export interface OutletGroup {
  /** Unique, unlike the label: two strips can carry the same name. */
  id: string;
  /** '' for the single plugs. */
  label: string;
  items: Outlet[];
}

/** Single plugs first, then each strip with its sockets, then (when asked)
 *  every other switch. */
export function outletGroups(all: readonly Outlet[], showAll: boolean): OutletGroup[] {
  const main = mainOutlets(all);
  const byGroup = new Map<string, Outlet[]>();
  for (const o of main) byGroup.set(o.groupId, [...(byGroup.get(o.groupId) ?? []), o]);
  const singles: Outlet[] = [];
  const strips: OutletGroup[] = [];
  for (const items of byGroup.values()) {
    if (items.length === 1) singles.push(items[0]);
    else strips.push({ id: items[0].groupId, label: items[0].groupName || 'Power strip', items });
  }
  const groups: OutletGroup[] = [];
  if (singles.length) groups.push({ id: '__singles', label: 'Tapo and Kasa plugs', items: singles });
  groups.push(...strips.sort((a, b) => a.label.localeCompare(b.label)));
  if (showAll) {
    const shown = new Set(main.map((o) => o.id));
    const rest = all.filter((o) => !shown.has(o.id));
    if (rest.length) groups.push({ id: '__other', label: 'Other switches', items: rest });
  }
  return groups;
}

const FILLER = new Set(['plug', 'outlet', 'socket', 'power', 'supply', 'psu', 'switch', 'tapo', 'kasa', 'the']);

function words(name: string): string[] {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').split(' ').filter((w) => w && !FILLER.has(w));
}

/**
 * Outlets that look like they belong to a controller, by name: every word of
 * the controller's name is in the outlet's ("Garage" and "Garage plug").
 * Only for controllers with no link yet, only outlets not linked already, and
 * only when the match is the single obvious one. These are shown as
 * suggestions; nothing is saved until the person accepts them.
 */
export function suggestLinks(
  controllers: ReadonlyArray<{ id: string; name: string }>,
  outlets: readonly Outlet[],
  links: Links,
): Record<string, string> {
  const taken = new Set(Object.values(links));
  const free = outlets.filter((o) => !taken.has(o.id)).map((o) => ({ o, w: words(o.name) }));
  const picks = new Map<string, string>();
  for (const c of controllers) {
    if (links[c.id]) continue;
    const cw = words(c.name);
    if (!cw.length) continue;
    const hits = free.filter(({ w }) => cw.every((x) => w.includes(x)));
    const exact = hits.filter(({ w }) => w.length === cw.length);
    const pick = exact.length === 1 ? exact[0] : hits.length === 1 ? hits[0] : null;
    if (pick) picks.set(c.id, pick.o.id);
  }
  // An outlet two controllers both claim is nobody's obvious match.
  const count = new Map<string, number>();
  for (const id of picks.values()) count.set(id, (count.get(id) ?? 0) + 1);
  const out: Record<string, string> = {};
  for (const [cid, oid] of picks) if (count.get(oid) === 1) out[cid] = oid;
  return out;
}

/** The other controllers fed by this controller's outlet. */
export function sharedWith(links: Links, controllerId: string, controllers: ReadonlyArray<{ id: string; name: string }>): string[] {
  const entity = links[controllerId];
  if (!entity) return [];
  return controllers.filter((c) => c.id !== controllerId && links[c.id] === entity).map((c) => c.name);
}
