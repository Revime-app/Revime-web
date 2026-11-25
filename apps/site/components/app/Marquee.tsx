/**
 * A band that scrolls on its own, endlessly (CSS only): the content twice, the second copy hidden
 * from screen readers and from the keyboard. It pauses under the mouse or the keyboard focus, and
 * becomes an ordinary horizontal rail for anyone who asked for less motion.
 */
export function Marquee({
  children,
  reverse = false,
  seconds = 50,
  label,
}: {
  children: React.ReactNode;
  reverse?: boolean;
  seconds?: number;
  label: string;
}) {
  return (
    <div className="ap-marquee" role="region" aria-label={label} style={{ '--dur': `${seconds}s` } as React.CSSProperties}>
      <div className={reverse ? 'ap-marquee__track is-reverse' : 'ap-marquee__track'}>
        <div className="ap-marquee__set">{children}</div>
        <div className="ap-marquee__set" aria-hidden="true" inert>
          {children}
        </div>
      </div>
    </div>
  );
}
