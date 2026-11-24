/** What the operator reads after saving a category: the modal used to close with no word. */
export function categorySavedMessage(mode: 'create' | 'edit'): string {
  return mode === 'create' ? 'Catégorie créée.' : 'Catégorie enregistrée.';
}
