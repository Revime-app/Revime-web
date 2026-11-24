/**
 * Table sorting utilities for Revime Admin lists (UI8).
 */

export type SortDirection = 'asc' | 'desc';

export interface SortState<K extends string = string> {
  key: K | null;
  direction: SortDirection;
}

/**
 * Pure comparator for two values given a sort direction.
 * Safely handles null, undefined, numbers, strings, and dates.
 */
export function compareValues(a: unknown, b: unknown, direction: SortDirection): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return 1;
  if (b === null || b === undefined) return -1;

  let comparison = 0;

  if (typeof a === 'number' && typeof b === 'number') {
    comparison = a - b;
  } else if (a instanceof Date && b instanceof Date) {
    comparison = a.getTime() - b.getTime();
  } else {
    // Check if both are valid date strings
    const strA = String(a).trim();
    const strB = String(b).trim();
    const timeA = Date.parse(strA);
    const timeB = Date.parse(strB);

    if (!isNaN(timeA) && !isNaN(timeB) && strA.length > 8 && strB.length > 8) {
      comparison = timeA - timeB;
    } else {
      comparison = strA.localeCompare(strB, 'fr', { sensitivity: 'base', numeric: true });
    }
  }

  return direction === 'asc' ? comparison : -comparison;
}

/**
 * Sorts an array of items by a key or an accessor function.
 * Returns a new shallow array copy without mutating the original array.
 */
export function sortItems<T>(
  items: T[],
  key: keyof T | ((item: T) => unknown) | null,
  direction: SortDirection
): T[] {
  if (!key) return [...items];

  const accessor = typeof key === 'function' ? key : (item: T) => item[key];

  return [...items].sort((a, b) => {
    return compareValues(accessor(a), accessor(b), direction);
  });
}

/**
 * Determines the next sort state when a column header is clicked.
 * If clicking the active column: toggles asc <-> desc.
 * If clicking a new column: defaults to 'asc'.
 */
export function toggleSort<K extends string>(
  currentKey: K | null,
  newKey: K,
  currentDirection: SortDirection
): { key: K; direction: SortDirection } {
  if (currentKey === newKey) {
    return {
      key: newKey,
      direction: currentDirection === 'asc' ? 'desc' : 'asc',
    };
  }
  return {
    key: newKey,
    direction: 'asc',
  };
}

/**
 * Returns the WAI-ARIA aria-sort attribute value for a table header cell.
 */
export function getAriaSort(
  columnKey: string,
  activeKey: string | null,
  direction: SortDirection
): 'ascending' | 'descending' | 'none' {
  if (columnKey !== activeKey) return 'none';
  return direction === 'asc' ? 'ascending' : 'descending';
}

/**
 * Returns a visual indicator glyph for the active sort column.
 */
export function getSortGlyph(
  columnKey: string,
  activeKey: string | null,
  direction: SortDirection
): string {
  if (columnKey !== activeKey) return ' ↕';
  return direction === 'asc' ? ' ▲' : ' ▼';
}
