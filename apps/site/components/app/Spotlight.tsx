'use client';

import { useEffect } from 'react';

/**
 * Light that follows the pointer over a card (`.ap-spot`): sets --mx / --my on the card under the
 * mouse, the CSS draws the glow. One passive listener for the whole site; nothing on touch screens.
 */
export function Spotlight() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const move = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('.ap-spot') as HTMLElement | null;
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    document.addEventListener('pointermove', move, { passive: true });
    return () => document.removeEventListener('pointermove', move);
  }, []);
  return null;
}
