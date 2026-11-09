/** How a song is named on the wall, and which cover goes with it. */

export interface SongTags {
  title?: string;
  artist?: string;
  album?: string;
}

export type SongNameSource = 'tags' | 'sequence';

export interface SongNames {
  title: string;
  /** A trailing `(From "Toy Story 5")` or `(David Guetta Remix)`, shown quieter. */
  extra: string;
  artist: string;
  /** Empty when it only repeats the title (singles). */
  album: string;
}

/** Tags from `GET /api/media/<file>/meta` (ffprobe output). Tag keys are
 *  upper case in some containers (FLAC, Ogg), so they are matched loosely. */
export function tagsFromMeta(meta: unknown): SongTags {
  const pick = (tags: unknown): SongTags => {
    if (!tags || typeof tags !== 'object') return {};
    const lower: Record<string, string> = {};
    for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
      if (typeof v === 'string') lower[k.toLowerCase()] = v.trim();
    }
    return { title: lower.title || undefined, artist: lower.artist || lower.album_artist || undefined, album: lower.album || undefined };
  };
  const m = meta as { format?: { tags?: unknown }; streams?: Array<{ tags?: unknown }> } | null;
  const fromFormat = pick(m?.format?.tags);
  if (fromFormat.title || fromFormat.artist) return fromFormat;
  for (const s of m?.streams ?? []) {
    const t = pick(s?.tags);
    if (t.title || t.artist) return t;
  }
  return fromFormat;
}

const stripExt = (name: string) => name.replace(/\.(fseq|eseq|mp3|m4a|aac|ogg|oga|flac|wav|mp4|mkv|mov|webm)$/i, '');

/** "Snowman - Sia.fseq" → { title: "Snowman", artist: "Sia" }. Only the first
 *  " - " splits, so "Winter Wonderland - Here Comes Santa Claus - Snoop Dogg"
 *  keeps its artist part whole. */
export function namesFromFile(file: string): { title: string; artist: string } {
  const base = stripExt((file ?? '').split('/').pop() ?? '')
    .replace(/^\d{1,3}\s*[-._]\s*/, '') // "03 - Snowman" track numbers
    .replace(/_/g, ' ')
    .trim();
  const i = base.indexOf(' - ');
  return i > 0 ? { title: base.slice(0, i).trim(), artist: base.slice(i + 3).trim() } : { title: base, artist: '' };
}

const EXTRA = /^(.*?)\s*\(\s*((?:From|Feat\.?|featuring)\b[^)]*|[^)]*\b(?:Remix|Mix|Edit|Version|Soundtrack|Live)\b[^)]*)\)\s*$/i;

/** Moves one trailing parenthetical that is not part of the name onto its own line. */
export function splitExtra(title: string): { main: string; extra: string } {
  const m = EXTRA.exec(title);
  if (!m || !m[1].trim()) return { main: title, extra: '' };
  return { main: m[1].trim(), extra: m[2].replace(/["“”]/g, '').trim() };
}

export const squash = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z0-9]/g, '');

/** The album line, or '' when it just repeats the title or is the single. */
export function albumLine(title: string, album: string | undefined): string {
  const a = (album ?? '').replace(/\s*-\s*Single$/i, '').trim();
  if (!a) return '';
  const sa = squash(a);
  const st = squash(title);
  if (!sa || (st && (sa.startsWith(st) || st.startsWith(sa)))) return '';
  return a;
}

export function songNames(sequence: string, media: string, tags: SongTags | undefined, source: SongNameSource): SongNames {
  const fromSeq = namesFromFile(sequence || media);
  const fromMedia = namesFromFile(media || sequence);
  const useTags = source === 'tags' && !!tags;
  const rawTitle = (useTags && tags?.title) || fromSeq.title || fromMedia.title;
  const artist = (useTags && tags?.artist) || fromSeq.artist || fromMedia.artist;
  const { main, extra } = splitExtra(rawTitle);
  return {
    title: main,
    extra,
    artist,
    album: source === 'tags' ? albumLine(rawTitle, tags?.album) : '',
  };
}

export interface ItunesTrack {
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
}

/** The search sent to Apple: title plus the first credited artist. */
export function coverSearchTerm(names: SongNames): string {
  const firstArtist = names.artist.split(/,|&| feat\.? | and /i)[0]?.trim() ?? '';
  return `${names.title} ${firstArtist}`.trim();
}

/**
 * The cover from an iTunes search, or null when nothing is a confident match.
 * The track name must match the title (ignoring punctuation and any
 * parenthetical); among those, one sharing a word of the artist wins.
 * No match is better than a wrong cover on the wall.
 */
export function pickCover(results: ItunesTrack[] | undefined, names: SongNames): string | null {
  const want = squash(names.title);
  if (!want) return null;
  const artistWords = names.artist.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const titled = (results ?? []).filter((r) => {
    const got = squash(r.trackName ?? '');
    return !!got && !!r.artworkUrl100 && (got === want || got.startsWith(want) || want.startsWith(got));
  });
  const best = titled.find((r) => artistWords.some((w) => (r.artistName ?? '').toLowerCase().includes(w))) ?? titled[0];
  return best?.artworkUrl100 ? best.artworkUrl100.replace(/\/\d+x\d+bb\./, '/600x600bb.') : null;
}
