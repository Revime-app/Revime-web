import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { UserDeleteZone } from '../components/UserDeleteZone';
import { CategoryTaxonomyView } from '../app/categories/CategoryTaxonomyView';
import { categorySavedMessage } from '../lib/category-feedback';

describe('ISS-118 / FND-636: the delete button cannot be hit by a layout shift', () => {
  it('keeps « Supprimer le compte » inside a collapsed section, like the forms above it', () => {
    const html = renderToString(<UserDeleteZone busy={false} onOpen={() => {}} />);
    const details = html.match(/<details(?![^>]*\sopen)[^>]*>[\s\S]*<\/details>/);
    expect(details, 'expected a closed <details>').not.toBeNull();
    expect(details![0]).toContain('data-testid="open-delete-user-modal"');
    expect(details![0]).toContain('<summary');
  });

  it('keeps the button disabled while busy', () => {
    const html = renderToString(<UserDeleteZone busy onOpen={() => {}} />);
    expect(html).toMatch(/data-testid="open-delete-user-modal"[^>]*disabled=""|disabled=""[^>]*data-testid="open-delete-user-modal"/);
  });
});

describe('ISS-118 / FND-637: saving a category says so', () => {
  it('words the creation and the edit', () => {
    expect(categorySavedMessage('create')).toBe('Catégorie créée.');
    expect(categorySavedMessage('edit')).toBe('Catégorie enregistrée.');
  });

  it('shows the confirmation as a status banner', () => {
    const html = renderToString(<CategoryTaxonomyView initialCategories={[]} initialActionSuccess="Catégorie créée." />);
    expect(html).toMatch(/role="status"[^>]*>Catégorie créée\./);
  });

  it('shows no banner by default', () => {
    const html = renderToString(<CategoryTaxonomyView initialCategories={[]} />);
    expect(html).not.toContain('role="status"');
  });
});
