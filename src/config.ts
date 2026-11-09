import type { Fetcher } from './data/feed';
import type { SongNameSource } from './lib/songs';
import type { ViewName } from './ui/views';

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

/** JSON through the hub proxy, which holds the request to the show network. */
export const proxyFetch: Fetcher = async (url, cacheTtlMs) => {
  const s = sdk();
  if (!s?.pluginFetch) throw new Error('The plugin SDK is not ready');
  const res = await s.pluginFetch(PLUGIN_ID, { url, cacheTtlMs });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

