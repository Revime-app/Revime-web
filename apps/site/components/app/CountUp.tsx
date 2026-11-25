'use client';

import { useEffect, useRef, useState } from 'react';
import { euroFmt } from './ui';

/**
 * A figure that counts up to its value once it is on screen (0.9 s, ease-out). The final value is
 * in the HTML from the start for screen readers and for anyone who asked for less motion.
 */
export function CountUp({ value, money = false }: { value: number; money?: boolean }) {
  const [shown, setShown] = useState(value);
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      return;
    }
    let raf = 0;
    const start = from.current;
    const run = () => {
      const t0 = performance.now();
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / 900);
        const eased = 1 - Math.pow(1 - k, 3);
        setShown(Math.round(start + (value - start) * eased));
        if (k < 1) raf = requestAnimationFrame(tick);
        else from.current = value;
      };
      raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => {
      if (e?.isIntersecting) {
        io.disconnect();
        run();
      }
    });
    setShown(start);
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value]);

  const text = money ? euroFmt(shown) : String(shown);
  return (
    <span ref={ref} aria-label={money ? euroFmt(value) : String(value)}>
      <span aria-hidden="true">{text}</span>
    </span>
  );
}
