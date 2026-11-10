/** Small helpers for rendering a settings panel in jsdom and using it the
 *  way a person would: typing, leaving a field, picking from a list. */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Sdk = NonNullable<Window['__HS_SDK__']>;

let roots: Array<{ root: ReturnType<typeof createRoot>; el: HTMLElement }> = [];

/** Renders into the page and waits for the panel's first lookups to settle. */
export async function mount(node: React.ReactNode): Promise<HTMLElement> {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  roots.push({ root, el });
  await act(async () => { root.render(node); });
  return el;
}

export function unmountAll(): void {
  for (const { root, el } of roots) { act(() => root.unmount()); el.remove(); }
  roots = [];
}

/** Lets promises a click or a save started run to their end. */
export const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const setValue = (el: HTMLInputElement | HTMLSelectElement, value: string) => {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
};

/** Types into a field and leaves it, which is when these panels save. */
export async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    el.focus();
    setValue(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => { el.blur(); });
  await settle();
}

export async function pick(el: HTMLSelectElement, value: string): Promise<void> {
  await act(async () => {
    setValue(el, value);
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await settle();
}

export async function click(el: Element): Promise<void> {
  await act(async () => { (el as HTMLElement).click(); });
  await settle();
}

export const byLabel = <T extends Element = HTMLInputElement>(root: ParentNode, label: string): T => {
  const el = root.querySelector(`[aria-label="${label}"]`);
  if (!el) throw new Error(`Nothing labelled "${label}"`);
  return el as T;
};

export const button = (root: ParentNode, text: string): HTMLButtonElement => {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);
  if (!el) throw new Error(`No "${text}" button`);
  return el;
};

/**
 * A stand-in for the editor's SDK. Plugin settings are kept here the way the
 * hub keeps them; `failSaves` makes the next saves fail. `answer` is what the
 * hub's proxy gets back for an address (throw for one that does not answer),
 * and `others` holds the settings of other plugins, by plugin id.
 */
export function fakeSdk(
  settings: Record<string, unknown> = {},
  answer: (url: string) => unknown = () => { throw new Error('offline'); },
  others: Record<string, Record<string, unknown>> = {},
) {
  const state = { settings: { ...settings }, failSaves: false };
  const setPluginSettings = vi.fn(async (_id: string, updates: Record<string, unknown>) => {
    if (state.failSaves) return { ok: false, error: 'nope' };
    Object.assign(state.settings, updates);
    return { ok: true };
  });
  const sdk = {
    INPUT_CLASS: 'hs-input',
    getPluginSettings: (id: string) => structuredClone(id === 'fpp' ? state.settings : others[id] ?? {}),
    setPluginSettings,
    pluginFetch: async (_id: string, { url }: { url: string }) => {
      try {
        return new Response(JSON.stringify(answer(url)), { status: 200 });
      } catch {
        return new Response('', { status: 502 });
      }
    },
  } as unknown as Sdk;
  window.__HS_SDK__ = sdk;
  return { state, setPluginSettings };
}
