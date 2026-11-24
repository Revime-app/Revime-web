import React from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { accents, palette, radii, spacing } from '@revime/tokens';
import { findNodes, findNodesByType, findTextNodes } from './render-tree';

/** V8 E2: the bubble (criteria 3 to 5, 10) and the offer (criterion 1) as the client's two mockups draw them. */

const theme = vi.hoisted(() => ({ mode: 'client' as 'client' | 'pro' }));
vi.mock('../src/theme', async () => {
  const t = await import('@revime/tokens');
  return { useTheme: () => ({ palette: t.palette, accent: t.accents[theme.mode], radii: t.radii, spacing: t.spacing }) };
});

import { TourBubble } from '../src/tour/TourBubble';
import { TourOffer } from '../src/tour/TourOffer';
import { onTourBack } from '../src/lib/tour';

const step = { target: 'promoBanner' as const, title: 'Un objet cassé ?', body: 'Publiez une demande avec une photo.' };
const noop = () => {};
const src = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');
const pressables = (tree: unknown) => findNodesByType(tree, 'Pressable');
const flat = (style: unknown): Record<string, unknown> =>
  Array.isArray(style) ? Object.assign({}, ...style.flat(Infinity).filter(Boolean)) : ((style as Record<string, unknown>) ?? {});

describe('TourBubble', () => {
  it('shows the title, the sentence, « Passer », the counter and « Suivant »', () => {
    const tree = TourBubble({ step, counter: '1 / 4', isLast: false, onSkip: noop, onNext: noop });
    expect(findTextNodes(tree)).toEqual(['Un objet cassé ?', 'Publiez une demande avec une photo.', 'Passer', '1 / 4', 'Suivant']);
  });

  it('says « Compris » on the last bubble', () => {
    const tree = TourBubble({ step, counter: '4 / 4', isLast: true, onSkip: noop, onNext: noop });
    expect(findTextNodes(tree)).toContain('Compris');
    expect(findTextNodes(tree)).not.toContain('Suivant');
  });

  it('paints the action button red in client mode and navy in repairer mode', () => {
    theme.mode = 'client';
    let next = pressables(TourBubble({ step, counter: '1 / 4', isLast: false, onSkip: noop, onNext: noop }))[1];
    expect(flat(next.props.style).backgroundColor).toBe(palette.red);
    theme.mode = 'pro';
    next = pressables(TourBubble({ step, counter: '1 / 4', isLast: false, onSkip: noop, onNext: noop }))[1];
    expect(flat(next.props.style).backgroundColor).toBe(palette.navy);
    theme.mode = 'client';
  });

  it('« Passer » calls onSkip and the action button calls onNext', () => {
    const onSkip = vi.fn();
    const onNext = vi.fn();
    const [skip, next] = pressables(TourBubble({ step, counter: '1 / 2', isLast: false, onSkip, onNext }));
    skip.props.onPress();
    next.props.onPress();
    expect(onSkip).toHaveBeenCalledTimes(1);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('is a modal, announced region with labelled buttons (criterion 10)', () => {
    const tree = TourBubble({ step, counter: '2 / 4', isLast: false, onSkip: noop, onNext: noop });
    expect(tree.props.accessibilityViewIsModal).toBe(true);
    expect(tree.props.accessibilityLiveRegion).toBe('polite');
    for (const p of pressables(tree)) expect(p.props.accessibilityRole).toBe('button');
    const counter = findNodes(tree, (e) => e.props?.accessibilityLabel === 'Étape 2 sur 4');
    expect(counter).toHaveLength(1);
  });
});

describe('TourOffer', () => {
  it('offers the client tour with both buttons and the note', () => {
    const tree = TourOffer({ mode: 'CLIENT', onStart: noop, onLater: noop });
    expect(findTextNodes(tree)).toEqual([
      'Bienvenue sur Revime',
      "Une courte visite vous montre l'essentiel de chaque page, la première fois que vous l'ouvrez.",
      'Vous pourrez la lancer plus tard depuis Paramètres.',
    ]);
    const buttons = findNodesByType(tree, 'Button');
    expect(buttons.map((b) => [b.props.label, b.props.variant ?? 'primary'])).toEqual([
      ['Commencer la visite', 'primary'],
      ['Plus tard', 'text'],
    ]);
  });

  it('titles the repairer tour', () => {
    expect(findTextNodes(TourOffer({ mode: 'REPAIRER', onStart: noop, onLater: noop }))[0]).toBe('Bienvenue en mode réparateur');
  });

  it('wires the two buttons', () => {
    const onStart = vi.fn();
    const onLater = vi.fn();
    const [start, later] = findNodesByType(TourOffer({ mode: 'CLIENT', onStart, onLater }), 'Button');
    start.props.onPress();
    later.props.onPress();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onLater).toHaveBeenCalledTimes(1);
  });
});

describe('back button and placement in the app', () => {
  it('back is Passer on a bubble and Plus tard on the offer', () => {
    expect(onTourBack('bubble')).toBe('skip');
    expect(onTourBack('offer')).toBe('decline');
  });

  it('draws no RN Modal, so maintenance and re-acceptance stay on top (FND8-027 (1))', () => {
    for (const f of ['src/tour/TourOverlay.tsx', 'src/tour/TourProvider.tsx']) {
      expect(src(f)).not.toMatch(/<Modal\b/);
      expect(src(f)).not.toMatch(/import\s*\{[^}]*\bModal\b[^}]*\}\s*from\s*'react-native'/);
    }
  });

  it('nests TourProvider inside MaintenanceGate in the root layout', () => {
    expect(src('app/_layout.tsx')).toMatch(/<MaintenanceGate>\s*<TourProvider>\s*<Stack/);
  });
});

void radii;
void spacing;
void accents;

describe('review fixes I3 and screen-reader modality', () => {
  const provider = () => src('src/tour/TourProvider.tsx');

  it('ignores « Suivant », « Passer » and back while a step is still being measured', () => {
    for (const fn of ['const onNext = useCallback(() => {', 'const onSkip = useCallback(() => {']) {
      const body = provider().slice(provider().indexOf(fn), provider().indexOf('}, [', provider().indexOf(fn)));
      expect(body).toMatch(/if \(busy\.current\) return;/);
    }
    const back = provider().slice(provider().indexOf("addEventListener('hardwareBackPress'"));
    expect(back.slice(0, 200)).toMatch(/if \(busy\.current\) return true;/);
  });

  it('ending a run invalidates any step still in flight', () => {
    const body = provider().slice(provider().indexOf('const end = useCallback('), provider().indexOf('const showStep'));
    expect(body).toMatch(/generation\.current \+= 1;/);
  });

  it('makes the whole overlay modal and hides the app beneath from screen readers', () => {
    expect(src('src/tour/TourOverlay.tsx')).toMatch(/<View accessibilityViewIsModal style=\{StyleSheet\.absoluteFill\}>/);
    expect(provider()).toMatch(/importantForAccessibility=\{showing \? 'no-hide-descendants' : 'auto'\}/);
  });
});
