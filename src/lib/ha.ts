/**
 * The only file that knows Home Assistant.
 *
 * Light Show has no Home Assistant connection of its own: it sends its calls
 * through the Home Assistant plugin's hub proxy, which adds that plugin's
 * saved address and access token on the hub. The token never reaches the wall.
 * The three names below belong to that plugin; a rename there is mirrored here.
 */
import { OUTLETS_TEMPLATE, parseOutlets, parseStates, statesTemplate, type Outlet, type OutletReading } from './power';

const HA_PLUGIN_ID = 'home-assistant';
const HA_URL_SETTING = 'haUrl';
const HA_AUTH = { Authorization: 'Bearer {{ha_token}}' };
const TIMEOUT_MS = 15_000;

/** Why Home Assistant cannot be used right now. */
export type HaProblem = 'notSetUp' | 'unreachable';

export class HaError extends Error {
  constructor(public problem: HaProblem, message: string) {
    super(message);
  }
}

const sdk = () => (typeof window !== 'undefined' ? window.__HS_SDK__ : undefined);

/** The Home Assistant plugin's saved address, '' when there is none. */
export function haUrl(): string {
  const raw = sdk()?.getPluginSettings?.(HA_PLUGIN_ID)?.[HA_URL_SETTING];
  return typeof raw === 'string' ? raw.trim().replace(/\/+$/, '') : '';
}

async function haFetch(path: string, payload: unknown): Promise<Response> {
  const s = sdk();
  const base = haUrl();
  if (!s?.pluginFetch || !base) throw new HaError('notSetUp', 'Home Assistant is not connected');
  const call = s.pluginFetch(HA_PLUGIN_ID, {
    url: `${base}${path}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    payload: JSON.stringify(payload),
    secretInjections: { header: HA_AUTH },
    cacheTtlMs: 0,
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HaError('unreachable', 'Home Assistant took too long')), TIMEOUT_MS);
  });
  let res: Response;
  try {
    res = await Promise.race([call, late]);
  } catch (err) {
    throw err instanceof HaError ? err : new HaError('unreachable', 'Home Assistant did not answer');
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) return res;
  // The hub says 404 itself when the Home Assistant plugin is missing or off.
  const body = await res.text().catch(() => '');
  if (res.status === 404 && /not installed|not enabled|manifest/i.test(body)) {
    throw new HaError('notSetUp', 'The Home Assistant plugin is not installed');
  }
  throw new HaError('unreachable', `Home Assistant answered ${res.status}`);
}

async function render(template: string): Promise<unknown> {
  const res = await haFetch('/api/template', { template });
  try {
    return JSON.parse(await res.text());
  } catch {
    throw new HaError('unreachable', 'Home Assistant sent an answer that could not be read');
  }
}

/** Every switch in Home Assistant (settings panel only). */
export async function listOutlets(): Promise<Outlet[]> {
  return parseOutlets(await render(OUTLETS_TEMPLATE));
}

/** The state of the linked outlets, in one request. */
export async function outletStates(ids: readonly string[]): Promise<Record<string, OutletReading | null>> {
  if (!ids.length) return {};
  return parseStates(await render(statesTemplate(ids)));
}

export async function setOutlet(id: string, on: boolean): Promise<void> {
  await haFetch(`/api/services/switch/${on ? 'turn_on' : 'turn_off'}`, { entity_id: id });
}

/** What the power store needs from Home Assistant (swapped out in tests). */
export interface HaApi {
  connected: () => boolean;
  states: (ids: readonly string[]) => Promise<Record<string, OutletReading | null>>;
  set: (id: string, on: boolean) => Promise<void>;
}

export const haApi: HaApi = { connected: () => haUrl() !== '', states: outletStates, set: setOutlet };
