import { describe, expect, it } from 'vitest';
import { readConfig } from '../config';
import { accentOf, SEE_THROUGH, STAGE, stageAccentOf, THEMES, themeById, themeVars } from './theme';

describe('themes', () => {
  it('offers the twelve full-screen themes, six light and six dark', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['linen', 'paper', 'mist', 'sandstone', 'vellum', 'bloom', 'charcoal', 'midnight', 'slate', 'aurora', 'obsidian', 'horizon']);
    expect(THEMES.filter((t) => t.dark)).toHaveLength(6);
  });

  it('falls back to see-through for a missing or unknown theme', () => {
    expect(readConfig({}).theme).toBe(SEE_THROUGH);
    expect(readConfig({ theme: 'neon' }).theme).toBe(SEE_THROUGH);
    expect(readConfig({ theme: 7 }).theme).toBe(SEE_THROUGH);
    expect(readConfig({ theme: 'aurora' }).theme).toBe('aurora');
    expect(themeById(SEE_THROUGH)).toBeNull();
  });

  it('keeps the show gold where a theme has no accent, deeper on a light page', () => {
    expect(accentOf(themeById('midnight')!)).toBe('#ffcf6b');
    expect(accentOf(themeById('linen')!)).toBe('#b45309');
    expect(accentOf(themeById('aurora')!)).toBe('#5EEAD4');
    // The dark player card never gets a light theme's deep accent.
    expect(stageAccentOf(themeById('linen')!)).toBe('#ffcf6b');
    expect(stageAccentOf(themeById('sandstone')!)).toBe('#fdba74');
    expect(stageAccentOf(themeById('aurora')!)).toBe('#5EEAD4');
  });

  it('darkens the status colors only on light themes', () => {
    const light = themeVars(themeById('paper')!) as Record<string, string>;
    const dark = themeVars(themeById('slate')!) as Record<string, string>;
    expect(light['--ls-ok-text']).toBe('#15803d');
    expect(dark['--ls-ok-text']).toBeUndefined();
    expect(light['--ls-ink']).toBe('#171717');
  });

  it('resets every token the page sets inside the player card, bar the accent', () => {
    const stage = STAGE as Record<string, string>;
    for (const t of THEMES) {
      for (const key of Object.keys(themeVars(t))) {
        if (['--ls-accent', '--ls-stage-accent', '--ls-stage-line', '--ls-sheet'].includes(key)) continue;
        expect(stage[key], key).toBe('initial');
      }
    }
    expect(stage['--ls-accent']).toBe('var(--ls-stage-accent)');
  });
});
