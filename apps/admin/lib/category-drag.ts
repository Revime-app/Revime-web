/**
 * P22 « ordre par glisser-déposer ». Dropping a row on another row of the SAME sibling group moves it to
 * that row's position; anything else (another group, itself, an unknown row) is not a move. The group is
 * always the complete one the API requires (all the roots, or all the subcategories of one root).
 */
export function dropMove(
  group: readonly { id: string }[],
  draggedId: string | null,
  targetId: string,
): { from: number; to: number } | null {
  if (!draggedId || draggedId === targetId) return null;
  const from = group.findIndex((c) => c.id === draggedId);
  const to = group.findIndex((c) => c.id === targetId);
  return from === -1 || to === -1 ? null : { from, to };
}

/**
 * The group after moving `from` to `to`, numbered exactly as the API does (`reorderCategories`:
 * `sortOrder = (index + 1) * 10`), so the « Ordre » column is right as soon as the move is.
 */
export function moveAndRenumber<T extends { sortOrder: number }>(group: readonly T[], from: number, to: number): T[] {
  const moved = group[from]!;
  const reordered = group.filter((_, i) => i !== from);
  reordered.splice(to, 0, moved);
  return reordered.map((c, i) => ({ ...c, sortOrder: (i + 1) * 10 }));
}
