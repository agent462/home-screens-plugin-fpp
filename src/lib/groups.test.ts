import { describe, expect, it } from 'vitest';
import { cardHeight, groupLayout, largeFit, largeLayout, smallFit, type SectionSize } from './groups';

const group = (count: number): SectionSize => ({ count, headed: true });
const loose = (count: number): SectionSize => ({ count, headed: false });
// House 5, Yard 9, Trees 2, Signs 3: the mockup's guess at a 19-box show.
const SHOW = [group(5), group(9), group(2), group(3)];
const at = (l: ReturnType<typeof groupLayout>, section: number) => l.cells.filter((c) => c.section === section).map((c) => [c.row, c.col]);

describe('groupLayout', () => {
  it('starts each group on a new row under a heading that spans the grid', () => {
    const l = groupLayout(SHOW, 3);
    expect(l.rows).toEqual(['heading', 'cards', 'cards', 'heading', 'cards', 'cards', 'cards', 'heading', 'cards', 'heading', 'cards']);
    expect(l.headings).toEqual([
      { section: 0, row: 1, col: 1, span: 3 }, { section: 1, row: 4, col: 1, span: 3 },
      { section: 2, row: 8, col: 1, span: 3 }, { section: 3, row: 10, col: 1, span: 3 },
    ]);
    expect(at(l, 0)).toEqual([[2, 1], [2, 2], [2, 3], [3, 1], [3, 2]]);
    expect(at(l, 2)).toEqual([[9, 1], [9, 2]]);
    expect(l.cells).toHaveLength(19);
  });

  it('sits short groups side by side when they fit on one row, each under its own heading', () => {
    const l = groupLayout(SHOW, 5);
    expect(l.rows).toEqual(['heading', 'cards', 'heading', 'cards', 'cards', 'heading', 'cards']);
    expect(l.headings.slice(2)).toEqual([{ section: 2, row: 6, col: 1, span: 2 }, { section: 3, row: 6, col: 3, span: 3 }]);
    expect(at(l, 2)).toEqual([[7, 1], [7, 2]]);
    expect(at(l, 3)).toEqual([[7, 3], [7, 4], [7, 5]]);
  });

  it('runs the last shared heading to the edge when the row is not full', () => {
    const l = groupLayout([group(1), group(1)], 3);
    expect(l.headings).toEqual([{ section: 0, row: 1, col: 1, span: 1 }, { section: 1, row: 1, col: 2, span: 2 }]);
  });

  it('does not share a row with a group that fills one, or needs more than one', () => {
    expect(groupLayout([group(3), group(1)], 3).rows).toEqual(['heading', 'cards', 'heading', 'cards']);
    expect(groupLayout([group(4), group(1)], 3).rows).toEqual(['heading', 'cards', 'cards', 'heading', 'cards']);
    expect(groupLayout([group(2), group(2)], 3).rows).toEqual(['heading', 'cards', 'heading', 'cards']);
  });

  it('puts the controllers in no group first with no heading, and never beside a group', () => {
    const l = groupLayout([loose(1), group(1), group(1)], 3);
    expect(l.rows).toEqual(['cards', 'heading', 'cards']);
    expect(at(l, 0)).toEqual([[1, 1]]);
    expect(l.headings.map((h) => [h.section, h.row, h.col])).toEqual([[1, 2, 1], [2, 2, 2]]);
  });

  it('is one plain block when nothing is grouped', () => {
    const l = groupLayout([loose(7)], 3);
    expect(l.rows).toEqual(['cards', 'cards', 'cards']);
    expect(l.headings).toEqual([]);
  });
});

describe('how the cards fit', () => {
  it('shares the room left after headings and gaps between the card rows', () => {
    // 4 headings of 30 and 10 gaps of 12 out of 965 leave 725 for 7 rows.
    expect(cardHeight(965, groupLayout(SHOW, 3), 12, 30)).toBeCloseTo(103.57, 1);
    expect(cardHeight(500, groupLayout([], 3), 12, 30)).toBe(0);
  });

  it('gives up padding first, then the address line, as rows get shorter', () => {
    expect(smallFit(118, 27)).toBe('roomy');
    expect(smallFit(104, 27)).toBe('tight');
    expect(smallFit(97, 27)).toBe('tighter');
    expect(smallFit(79, 27)).toBe('short');
    // The landscape Show view starts with less padding, so it stays roomy longer.
    expect(smallFit(104, 21)).toBe('roomy');
  });

  it('adds columns for detailed cards until they have enough height', () => {
    // Portrait Controllers view: two columns already leave about 129.
    expect(largeLayout(SHOW, 2, 1732, 14, 30).cols).toBe(2);
    // Landscape: four columns would leave about 92, five leave 183.
    const land = largeLayout(SHOW, 4, 904, 14, 30);
    expect(land.cols).toBe(5);
    expect(cardHeight(904, land, 14, 30)).toBeGreaterThan(150);
    // Not measured yet: start from the usual columns.
    expect(largeLayout(SHOW, 4, 0, 14, 30).cols).toBe(4);
  });

  it('trims a detailed card when it has no room for a warning line of its own', () => {
    expect(largeFit(160)).toBe('roomy');
    expect(largeFit(129)).toBe('tight');
  });
});
