// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { button, byLabel, click, fakeSdk, mount, pick, typeInto, unmountAll } from '../test/dom';
import { ShowSettingsPanel } from './show-settings';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';
const nameField = (el: HTMLElement) => el.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
const playlistList = (el: HTMLElement) => el.querySelector<HTMLSelectElement>('select');
const says = (el: HTMLElement, text: string) => el.textContent?.includes(text) ?? false;

afterEach(() => {
  unmountAll();
  vi.restoreAllMocks();
});

describe('the Your show settings', () => {
  it('saves the name when the field is left, trimmed', async () => {
    const hub = fakeSdk();
    const el = await mount(<ShowSettingsPanel playlists={null} />);
    expect(nameField(el).placeholder).toBe('Light Show');
    await typeInto(nameField(el), '  Lights on Mushtown ');
    expect(hub.state.settings.show).toEqual({ name: 'Lights on Mushtown', mainPlaylist: '' });
    expect(nameField(el).value).toBe('Lights on Mushtown');
  });

  it('does not save a name that did not change', async () => {
    const hub = fakeSdk({ show: { name: 'Lights on Mushtown' } });
    const el = await mount(<ShowSettingsPanel playlists={null} />);
    await typeInto(nameField(el), 'Lights on Mushtown');
    expect(hub.setPluginSettings).not.toHaveBeenCalled();
  });

  it('shows the saved logo, and removes it without losing the name or the playlist', async () => {
    const hub = fakeSdk({ show: { name: 'Mushtown', logo: PNG, mainPlaylist: '2026' } });
    const el = await mount(<ShowSettingsPanel playlists={['2026']} />);
    expect(el.querySelector<HTMLImageElement>('img[alt="Your logo"]')?.src).toBe(PNG);
    expect(button(el, 'Change')).toBeTruthy();

    await click(button(el, 'Remove'));
    expect(hub.state.settings.show).toEqual({ name: 'Mushtown', mainPlaylist: '2026' });
    expect(el.querySelector('img[alt="Your logo"]')).toBeNull();
    expect(button(el, 'Choose a picture')).toBeTruthy();
  });

  it('says a logo with no name stands on its own', async () => {
    fakeSdk({ show: { logo: PNG } });
    const el = await mount(<ShowSettingsPanel playlists={null} />);
    expect(nameField(el).placeholder).toBe('No name, just the logo');
  });

  it('says so when a file is not a picture, and saves nothing', async () => {
    const hub = fakeSdk();
    // jsdom has no object URLs; a file that cannot be read fails the same way.
    URL.createObjectURL = vi.fn(() => 'blob:nothing');
    URL.revokeObjectURL = vi.fn();
    const el = await mount(<ShowSettingsPanel playlists={null} />);
    const file = byLabel(el, 'Logo picture');
    Object.defineProperty(file, 'files', { value: [new File(['not a picture'], 'notes.png', { type: 'image/png' })], configurable: true });
    await React.act(async () => { file.dispatchEvent(new Event('change', { bubbles: true })); });
    await React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    expect(says(el, "Couldn't read that picture")).toBe(true);
    expect(hub.setPluginSettings).not.toHaveBeenCalled();
  });

  it("offers the player's playlists and saves the one picked as the main show", async () => {
    const hub = fakeSdk({ show: { name: 'Mushtown' } });
    const el = await mount(<ShowSettingsPanel playlists={['2026', 'Pre-show']} />);
    const list = playlistList(el)!;
    expect([...list.options].map((o) => o.textContent)).toEqual(["Follow the player's schedule", '2026', 'Pre-show']);
    expect(list.value).toBe('');

    await pick(list, '2026');
    expect(hub.state.settings.show).toEqual({ name: 'Mushtown', mainPlaylist: '2026' });
    await pick(playlistList(el)!, '');
    expect(hub.state.settings.show).toEqual({ name: 'Mushtown', mainPlaylist: '' });
  });

  it('hides the playlist list until the player is known, unless one is already picked', async () => {
    fakeSdk();
    expect(playlistList(await mount(<ShowSettingsPanel playlists={null} />))).toBeNull();
    unmountAll();

    fakeSdk({ show: { mainPlaylist: '2026' } });
    const el = await mount(<ShowSettingsPanel playlists={null} />);
    expect(playlistList(el)!.value).toBe('2026');
    expect(playlistList(el)!.disabled).toBe(true);
  });

  it('warns when the picked playlist is no longer on the player', async () => {
    fakeSdk({ show: { mainPlaylist: '2025' } });
    const el = await mount(<ShowSettingsPanel playlists={['2026']} />);
    expect(playlistList(el)!.value).toBe('2025');
    expect(says(el, 'That playlist is not on the player any more')).toBe(true);
  });

  it('puts things back and says so when a save fails', async () => {
    const hub = fakeSdk({ show: { name: 'Mushtown', mainPlaylist: '2026' } });
    hub.state.failSaves = true;
    const el = await mount(<ShowSettingsPanel playlists={['2026', 'Pre-show']} />);
    await pick(playlistList(el)!, 'Pre-show');
    expect(playlistList(el)!.value).toBe('2026');
    expect(says(el, "That wasn't saved")).toBe(true);
    expect(hub.state.settings.show).toEqual({ name: 'Mushtown', mainPlaylist: '2026' });
  });
});
