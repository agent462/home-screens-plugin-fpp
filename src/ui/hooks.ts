import React from 'react';

/** The current time, refreshed every `ms` while `active`. */
export function useNow(ms: number, active = true): number {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms, active]);
  return now;
}

/** The element's content box, kept current with a ResizeObserver. */
export function useBox(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const apply = (w: number, h: number) => setBox((b) => (Math.round(b.w) === Math.round(w) && Math.round(b.h) === Math.round(h) ? b : { w, h }));
    apply(el.clientWidth, el.clientHeight);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r) apply(r.width, r.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}
