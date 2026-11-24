import React from 'react';
import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { RankMedal } from '../components/RankMedal';

// ISS-123: replaces the 🥇🥈🥉 emoji. The three ranks must stay tellable apart, by colour and by
// the spoken label, since the emoji carried both.
describe('RankMedal', () => {
  it('draws a medal with the spoken rank for ranks 1 to 3', () => {
    expect(renderToString(<RankMedal rank={1} />)).toContain('aria-label="1er rang"');
    expect(renderToString(<RankMedal rank={2} />)).toContain('aria-label="2ème rang"');
    expect(renderToString(<RankMedal rank={3} />)).toContain('aria-label="3ème rang"');
    expect(renderToString(<RankMedal rank={1} />)).toContain('lucide-medal');
  });

  it('gives each of the three ranks a different colour', () => {
    const colour = (r: number) => renderToString(<RankMedal rank={r} />).match(/color:([^;"]+)/)?.[1];
    const c = [colour(1), colour(2), colour(3)];
    expect(c.every(Boolean)).toBe(true);
    expect(new Set(c).size).toBe(3);
  });

  it('draws nothing from rank 4 on, where the caller shows the number', () => {
    expect(renderToString(<RankMedal rank={4} />)).toBe('');
  });
});
