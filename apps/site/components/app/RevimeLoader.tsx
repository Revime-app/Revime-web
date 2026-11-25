'use client';

import { useEffect, useRef } from 'react';

/**
 * The app's loader (apps/mobile/src/components/lottie/RevimeLoader.tsx): the REVIME logo drawn by
 * its Lottie animation, the same files (public/lottie, copied from the app's assets). lottie-web's
 * light SVG player is loaded only when a loader is shown, so pages that never wait pay nothing.
 * With reduced motion the logo stands still at its last frame.
 */
type Variant = 'fill' | 'wire' | 'intro';
const FILES: Record<Variant, string> = {
  fill: '/lottie/revime_chargement_remplissage.json',
  wire: '/lottie/revime_chargement_fil.json',
  intro: '/lottie/revime_intro.json',
};

export function RevimeLottie({ variant = 'fill', size = 72, loop = true }: { variant?: Variant; size?: number; loop?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let anim: { destroy: () => void; goToAndStop: (f: number, isFrame: boolean) => void; totalFrames: number } | null = null;
    let dead = false;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    void import('lottie-web/build/player/lottie_light').then(({ default: lottie }) => {
      if (dead || !box.current) return;
      anim = lottie.loadAnimation({
        container: box.current,
        renderer: 'svg',
        loop: still ? false : loop,
        autoplay: !still,
        path: FILES[variant],
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' },
      });
      if (still) (anim as unknown as { addEventListener: (e: string, f: () => void) => void }).addEventListener('DOMLoaded', () => anim?.goToAndStop(anim.totalFrames - 1, true));
    });
    return () => {
      dead = true;
      anim?.destroy();
    };
  }, [variant, loop]);
  return <div ref={box} className="ap-lottie" style={{ width: size, height: size }} aria-hidden="true" />;
}

export function RevimeLoader({ text, size = 72 }: { text?: string; size?: number }) {
  return (
    <div className="ap-loader" role="status" aria-live="polite">
      <RevimeLottie variant="fill" size={size} />
      <span className={text ? 'ap-loader__text' : 'ap-sr'}>{text ?? 'Chargement…'}</span>
    </div>
  );
}
