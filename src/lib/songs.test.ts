import { describe, expect, it } from 'vitest';
import { albumLine, coverSearchTerm, namesFromFile, pickCover, songNames, splitExtra, tagsFromMeta } from './songs';

describe('songNames', () => {
  it('uses the tags and moves "(From ...)" to the quieter line', () => {
    const n = songNames('I Knew It I Knew You - From Toy Story 5.fseq', '01 - I Knew It, I Knew You (From _Toy Story 5_).mp3',
      { title: 'I Knew It, I Knew You (From "Toy Story 5")', artist: 'Taylor Swift', album: 'I Knew It, I Knew You (From "Toy Story 5")' }, 'tags');
    expect(n).toEqual({ title: 'I Knew It, I Knew You', extra: 'From Toy Story 5', artist: 'Taylor Swift', album: '' });
  });

  it('falls back to the sequence name when the file has no title tag', () => {
    const n = songNames('A Million Dreams - The Greatest Showman.fseq', 'A_Million_Dreams_Normalized.mp3',
      { artist: 'Ziv Zaifman, Hugh Jackman & Michelle Williams' }, 'tags');
    expect(n.title).toBe('A Million Dreams');
    expect(n.artist).toBe('Ziv Zaifman, Hugh Jackman & Michelle Williams');
  });

  it('names from the sequence when asked to, ignoring wrong tags', () => {
    const n = songNames('KPop Demon Hunters - Golden.fseq', 'KPop Demon Hunters - Golden.mp3',
      { title: 'Golden v2', artist: 'Harry Styles' }, 'sequence');
    expect(n).toMatchObject({ title: 'KPop Demon Hunters', artist: 'Golden', album: '' });
  });

  it('works before the tags arrive', () => {
    expect(songNames('Snowman - Sia.fseq', '03 - Snowman.mp3', undefined, 'tags')).toMatchObject({ title: 'Snowman', artist: 'Sia' });
  });

  it('keeps a parenthetical that is part of the name', () => {
    expect(splitExtra('Noel (He Is Born)')).toEqual({ main: 'Noel (He Is Born)', extra: '' });
    expect(splitExtra('Silent Night (Rewrapped)')).toEqual({ main: 'Silent Night (Rewrapped)', extra: '' });
    expect(splitExtra('Love Tonight (David Guetta Remix)')).toEqual({ main: 'Love Tonight', extra: 'David Guetta Remix' });
  });
});

describe('albumLine', () => {
  it('hides an album that repeats the title', () => {
    expect(albumLine("You're a Mean One, Mr. Grinch", "You're a Mean One, Mr. Grinch")).toBe('');
    expect(albumLine('Silent Night (Rewrapped)', 'Silent Night (Rewrapped) - Single')).toBe('');
    expect(albumLine('Snowman', 'Everyday Is Christmas (Deluxe Edition)')).toBe('Everyday Is Christmas (Deluxe Edition)');
  });
});

describe('namesFromFile', () => {
  it('strips track numbers, extensions and underscores', () => {
    expect(namesFromFile('03 - Snowman.mp3')).toEqual({ title: 'Snowman', artist: '' });
    expect(namesFromFile('Snowman - Sia.fseq')).toEqual({ title: 'Snowman', artist: 'Sia' });
    expect(namesFromFile('A_Million_Dreams_Normalized.mp3').title).toBe('A Million Dreams Normalized');
  });
});

describe('tagsFromMeta', () => {
  it('reads ffprobe format tags in any case', () => {
    expect(tagsFromMeta({ format: { tags: { TITLE: 'Snowman', ARTIST: 'Sia', ALBUM: 'Everyday' } } }))
      .toEqual({ title: 'Snowman', artist: 'Sia', album: 'Everyday' });
  });
  it('falls back to stream tags and survives junk', () => {
    expect(tagsFromMeta({ format: {}, streams: [{ tags: { title: 'X' } }] }).title).toBe('X');
    expect(tagsFromMeta(null)).toEqual({});
  });
});

describe('covers', () => {
  const names = { title: 'Snowman', extra: '', artist: 'Sia', album: '' };
  const art = (n: number) => `https://is1-ssl.mzstatic.com/image/thumb/a${n}/100x100bb.jpg`;

  it('searches by title and first artist', () => {
    expect(coverSearchTerm({ ...names, artist: 'Tommee Profitt & We The Kingdom' })).toBe('Snowman Tommee Profitt');
  });

  it('picks a title match, preferring the artist, at 600 px', () => {
    const url = pickCover([
      { trackName: 'Snowman', artistName: 'Someone Else', artworkUrl100: art(1) },
      { trackName: 'Snowman', artistName: 'Sia', artworkUrl100: art(2) },
    ], names);
    expect(url).toBe('https://is1-ssl.mzstatic.com/image/thumb/a2/600x600bb.jpg');
  });

  it('shows no cover rather than a wrong one', () => {
    expect(pickCover([{ trackName: 'Christmas / Sarajevo 12/24', artistName: 'TSO', artworkUrl100: art(3) }],
      { title: 'TSO Chrismas Medley 2025', extra: '', artist: 'Trans-Siberian Orchestra', album: '' })).toBeNull();
    expect(pickCover([], names)).toBeNull();
  });
});
