import type { Fetcher, RequestsFetcher } from './data/feed';
import { RF_SECRET, RF_SHOW_URL } from './lib/remote-falcon';
import type { SongNameSource } from './lib/songs';
import type { ViewName } from './ui/views';
import { readLinks, type Links } from './lib/power';

export const PLUGIN_ID = 'fpp';

export interface LightShowConfig {
  playerAddress: string;
  view: ViewName;
  songNames: SongNameSource;
  covers: boolean;
  hiddenControllers: string[];
}

const VIEWS: ViewName[] = ['show', 'player', 'controllers', 'strip'];

export function readConfig(raw: Record<string, unknown>): LightShowConfig {
  return {
    playerAddress: typeof raw.playerAddress === 'string' ? raw.playerAddress : '',
    view: VIEWS.includes(raw.view as ViewName) ? (raw.view as ViewName) : 'show',
    songNames: raw.songNames === 'sequence' ? 'sequence' : 'tags',
    covers: raw.covers !== false,
    hiddenControllers: Array.isArray(raw.hiddenControllers) ? raw.hiddenControllers.filter((x): x is string => typeof x === 'string') : [],
  };
}

export const sdk = () => (typeof window !== 'undefined' ? window.__HS_SDK__ : undefined);

/** Plugin setting that holds the controller → outlet links. */
export const OUTLETS_SETTING = 'outlets';

/** Which outlet powers which controller, saved once for the plugin so every
 *  Light Show module and wall agrees. */
export function savedLinks(): Links {
  return readLinks(sdk()?.getPluginSettings?.(PLUGIN_ID)?.[OUTLETS_SETTING]);
}

/** Plugin setting that says Remote Falcon is connected. The key itself is a
 *  hub secret, which the wall can use but never read. */
export const REQUESTS_SETTING = 'remoteFalcon';

export const requestsConnected = (): boolean => sdk()?.getPluginSettings?.(PLUGIN_ID)?.[REQUESTS_SETTING] === true;

/** A Remote Falcon call that came back with an error status. */
export class RequestsError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

/** Remote Falcon's show details. The hub adds the saved key on the way out. */
export const fetchRequests: RequestsFetcher = async (cacheTtlMs) => {
  const s = sdk();
  if (!s?.pluginFetch) throw new Error('The plugin SDK is not ready');
  const res = await s.pluginFetch(PLUGIN_ID, {
    url: RF_SHOW_URL, cacheTtlMs, secretInjections: { header: { Authorization: `Bearer {{${RF_SECRET}}}` } },
  });
  if (!res.ok) throw new RequestsError(res.status);
  return res.json();
};

/** JSON through the hub proxy, which holds the request to the show network. */
export const proxyFetch: Fetcher = async (url, cacheTtlMs) => {
  const s = sdk();
  if (!s?.pluginFetch) throw new Error('The plugin SDK is not ready');
  const res = await s.pluginFetch(PLUGIN_ID, { url, cacheTtlMs });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

