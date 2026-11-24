import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { palette, spacing } from '@revime/tokens';
import { Text } from 'react-native';

vi.mock('../src/theme', () => ({
  useTheme: () => ({
    palette,
    spacing,
  }),
}));

function evaluateTree(node: any): any {
  if (!node) return node;
  if (Array.isArray(node)) {
    return node.map(evaluateTree);
  }
  if (typeof node !== 'object') return node;
  if (typeof node.type === 'function') {
    return evaluateTree(node.type(node.props));
  }
  if (node.props && 'children' in node.props) {
    return {
      ...node,
      props: {
        ...node.props,
        children: evaluateTree(node.props.children),
      },
    };
  }
  return node;
}

function findNode(node: any, predicate: (n: any) => boolean): any | null {
  if (!node) return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNode(item, predicate);
      if (found) return found;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (predicate(node)) return node;
  const children = node.props?.children;
  return findNode(children, predicate);
}

function nodeMatchesText(node: any, matcher: string | RegExp): boolean {
  if (!node || typeof node !== 'object') return false;
  const children = node.props?.children;
  if (typeof children === 'string') {
    if (typeof matcher === 'string') {
      return children === matcher || children.trim() === matcher;
    }
    return matcher.test(children);
  }
  return false;
}

vi.mock('@testing-library/react-native', () => ({
  render: (element: React.ReactElement) => {
    const tree = evaluateTree(element);
    return {
      getByText: (matcher: string | RegExp) => {
        const found = findNode(tree, (n) => nodeMatchesText(n, matcher));
        if (!found) {
          throw new Error(`Unable to find element with text matching ${matcher}`);
        }
        return found;
      },
      tree,
    };
  },
}));

// @ts-expect-error - mocked via in-tree vitest mock above
import { render } from '@testing-library/react-native';
import { LegalDocumentScreen } from '../src/components/LegalDocumentScreen';
import type { LegalDocument } from '../src/lib/legal/types';

describe('LegalDocumentScreen Typography & Formatting', () => {
  const sampleDoc: LegalDocument = {
    title: 'CONDITIONS GÉNÉRALES D’UTILISATION — REVIME',
    updated: 'Dernière mise à jour : 10 octobre 2026',
    sections: [
      {
        heading: '1. OBJET',
        level: 1,
        body: [
          'Premier paragraphe explicatif.',
          'Responsable du traitement :',
          '• Premier point à puce avec retour à la ligne',
          'Adresse professionnelle :\n21 Rue Curnonsky\n75017 Paris\nFrance',
        ],
      },
      {
        heading: '1.1 Rôle de la plateforme',
        level: 2,
        body: ['Sous-clause explicative.'],
      },
    ],
  };

  it('renders document title and updated date', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    expect(getByText('CONDITIONS GÉNÉRALES D’UTILISATION — REVIME')).toBeTruthy();
    expect(getByText('Dernière mise à jour : 10 octobre 2026')).toBeTruthy();
  });

  it('renders bullet items with hanging indent bullet character', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    const bulletSym = getByText('•');
    expect(bulletSym).toBeTruthy();
    expect(bulletSym.props.style.width).toBe(16);
    expect(bulletSym.props.style.color).toBe(palette.navy);

    const bulletBody = getByText('Premier point à puce avec retour à la ligne');
    expect(bulletBody).toBeTruthy();
    expect(bulletBody.props.style.flex).toBe(1);
  });

  it('renders address block with distinct line breaks', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    const addressElement = getByText(/21 Rue Curnonsky/);
    expect(addressElement.props.children).toContain('\n');
    expect(addressElement.props.children).not.toContain('21 Rue Curnonsky75017 ParisFrance');
  });

  it('renders level 1 heading with 17px Bold, palette.navy, and accessibilityRole="header"', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    const heading = getByText('1. OBJET');
    expect(heading.props.accessibilityRole).toBe('header');
    expect(heading.props.style.fontSize).toBe(17);
    expect(heading.props.style.color).toBe(palette.navy);
    expect(heading.props.style.fontFamily).toBe('GoogleSansFlex_700Bold');
  });

  it('renders level 2 heading with 15px SemiBold, palette.ink, and accessibilityRole="header"', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    const heading = getByText('1.1 Rôle de la plateforme');
    expect(heading.props.accessibilityRole).toBe('header');
    expect(heading.props.style.fontSize).toBe(15);
    expect(heading.props.style.color).toBe(palette.ink);
    expect(heading.props.style.fontFamily).toBe('GoogleSansFlex_600SemiBold');
  });

  it('renders key labels (shorter than 60 chars ending in :) with GoogleSansFlex_600SemiBold and tight margin', () => {
    const { getByText } = render(
      <LegalDocumentScreen document={sampleDoc} onBack={() => {}} />
    );
    const label = getByText('Responsable du traitement :');
    expect(label.props.style.fontFamily).toBe('GoogleSansFlex_600SemiBold');
    expect(label.props.style.marginBottom).toBe(spacing.xs);
  });

  it('renders footer slot when passed', () => {
    const { getByText } = render(
      <LegalDocumentScreen
        document={sampleDoc}
        onBack={() => {}}
        footer={<Text>Pied de page légal</Text>}
      />
    );
    expect(getByText('Pied de page légal')).toBeTruthy();
  });
});
