import React from 'react';
import { Medal } from 'lucide-react';
import { Icon } from './Icon';

const MEDALS: Record<number, { label: string; color: string }> = {
  1: { label: '1er rang', color: 'var(--amber-deep, #b54708)' },
  2: { label: '2ème rang', color: 'var(--muted, #6b7280)' },
  3: { label: '3ème rang', color: 'var(--red-text, #bd0e26)' },
};

/** The medal for ranks 1 to 3 (gold, silver, bronze); nothing from rank 4 on. */
export function RankMedal({ rank, size = 20 }: { rank: number; size?: number }) {
  const medal = MEDALS[rank];
  if (!medal) return null;
  return <Icon as={Medal} size={size} label={medal.label} style={{ color: medal.color }} />;
}
