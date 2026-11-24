import React from 'react';
import type { LucideIcon } from 'lucide-react';

export interface IconProps {
  /** The Lucide component to draw, e.g. `as={Package}`. */
  as: LucideIcon;
  /** Defaults to `1em`, so the icon takes the size of the text it sits in. */
  size?: number | string;
  /** Spoken label. Without one the icon is decorative and hidden from screen readers. */
  label?: string;
  style?: React.CSSProperties;
}

/**
 * ISS-123: the single way the admin draws an icon. It replaces the emoji that used to sit in
 * strings; the size follows the surrounding font, the stroke is the same everywhere, and the
 * glyph is aligned to the text baseline so it can lead a line of text without a flex wrapper.
 */
export function Icon({ as: Glyph, size = '1em', label, style }: IconProps) {
  return (
    <Glyph
      size={size}
      strokeWidth={2}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ verticalAlign: '-0.125em', flexShrink: 0, ...style }}
    />
  );
}
