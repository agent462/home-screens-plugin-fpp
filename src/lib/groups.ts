/** Where the cards and headings go when the controllers are drawn in groups.
 *  Pure: sizes are in design pixels (see `E` in ui/tokens). */

export interface SectionSize {
  count: number;
  /** A group has a heading; the controllers in no group do not. */
  headed: boolean;
}

/** One card: which section and item it is, and its grid row and column (from 1). */
export interface Cell { section: number; item: number; row: number; col: number }
/** One heading: its section, its grid row, and the columns it spans. */
export interface Heading { section: number; row: number; col: number; span: number }

export interface GroupLayout {
  cols: number;
  /** The grid's rows, top to bottom. */
  rows: Array<'heading' | 'cards'>;
  headings: Heading[];
  cells: Cell[];
}

/**
 * Lays the sections out in a grid `cols` wide. Each group starts a row under
 * its heading. Groups that each fit on one row sit side by side while there
 * is room, each under its own heading, so two short groups cost one row.
 * The controllers in no group fill their rows with no heading.
 */
export function groupLayout(sizes: readonly SectionSize[], cols: number): GroupLayout {
  const rows: GroupLayout['rows'] = [];
  const headings: Heading[] = [];
  const cells: Cell[] = [];
  const fill = (section: number, from: number) => {
    const n = sizes[section].count;
    for (let k = 0; k < n; k++) cells.push({ section, item: k, row: from + Math.floor(k / cols), col: (k % cols) + 1 });
    const used = Math.ceil(n / cols);
    for (let k = 0; k < used; k++) rows.push('cards');
  };
  let i = 0;
  while (i < sizes.length) {
    if (!sizes[i].headed) { fill(i, rows.length + 1); i++; continue; }
    const run = [i];
    let used = sizes[i].count;
    while (used < cols && i + run.length < sizes.length) {
      const next = sizes[i + run.length];
      if (!next.headed || used + next.count > cols) break;
      used += next.count;
      run.push(i + run.length);
    }
    rows.push('heading');
    const row = rows.length;
    if (run.length === 1) {
      headings.push({ section: i, row, col: 1, span: cols });
      fill(i, row + 1);
    } else {
      let col = 1;
      run.forEach((section, k) => {
        // The last heading runs to the edge so its line fills the row.
        headings.push({ section, row, col, span: k === run.length - 1 ? cols - col + 1 : sizes[section].count });
        for (let item = 0; item < sizes[section].count; item++) cells.push({ section, item, row: row + 1, col: col++ });
      });
      rows.push('cards');
    }
    i += run.length;
  }
  return { cols, rows, headings, cells };
}

/** How tall each card comes out when the grid has `avail` of height. */
export function cardHeight(avail: number, layout: GroupLayout, gap: number, headingH: number): number {
  const cards = layout.rows.filter((r) => r === 'cards').length;
  if (!cards) return 0;
  const heads = layout.rows.length - cards;
  return (avail - heads * headingH - (layout.rows.length - 1) * gap) / cards;
}

/** A small card's three lines and its border, without padding. */
const SMALL_LINES = 80;
/** The padding (top and bottom) a small card keeps at each fit. */
export const SMALL_PAD = { tight: [9, 8], tighter: [8, 7], short: [8, 7] } as const;

/** How much a small card has to give up to fit its row: nothing, some
 *  padding, more padding, or its address line. */
export type SmallFit = 'roomy' | 'tight' | 'tighter' | 'short';
export function smallFit(height: number, roomyPadY: number): SmallFit {
  if (height >= SMALL_LINES + roomyPadY) return 'roomy';
  if (height >= SMALL_LINES + SMALL_PAD.tight[0] + SMALL_PAD.tight[1] + 1) return 'tight';
  if (height >= SMALL_LINES + SMALL_PAD.tighter[0] + SMALL_PAD.tighter[1] + 1) return 'tighter';
  return 'short';
}

/** The least a detailed card needs with its padding trimmed. */
export const LARGE_MIN = 112;
/** With full padding and room for a warning's own line. */
const LARGE_ROOMY = 148;

export type LargeFit = 'roomy' | 'tight';
export const largeFit = (height: number): LargeFit => (height >= LARGE_ROOMY ? 'roomy' : 'tight');

/** The layout for detailed cards: the fewest columns, from `base` up to two
 *  more, that leave each card enough height; failing that, the tallest. */
export function largeLayout(sizes: readonly SectionSize[], base: number, avail: number, gap: number, headingH: number): GroupLayout {
  let best = groupLayout(sizes, base);
  if (avail <= 0) return best;
  let bestH = cardHeight(avail, best, gap, headingH);
  for (let cols = base; cols <= base + 2 && bestH < LARGE_MIN; cols++) {
    const layout = groupLayout(sizes, cols);
    const h = cardHeight(avail, layout, gap, headingH);
    if (h > bestH) { best = layout; bestH = h; }
  }
  return best;
}
