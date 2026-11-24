/**
 * Helpers for specs that call a screen function directly and read the element tree it returns
 * (no renderer): find elements by component name or by a predicate, and collect the text they carry.
 */

type ElementLike = { type?: unknown; props?: { children?: unknown } } | null | undefined;

function childrenOf(node: ElementLike): unknown[] {
  const children = node?.props?.children;
  return Array.isArray(children) ? children : children === undefined ? [] : [children];
}

function nameOf(node: NonNullable<ElementLike>): string | undefined {
  // The react-native mock's components carry their name in `displayName` (their function is `Comp`).
  const type = node.type as { name?: string; displayName?: string } | string | undefined;
  return typeof type === 'string' ? type : (type?.displayName ?? type?.name);
}

export function findNodes(node: unknown, matches: (element: any) => boolean): any[] {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap((item) => findNodes(item, matches));
  const element = node as NonNullable<ElementLike>;
  const own = matches(element) ? [element] : [];
  return [...own, ...childrenOf(element).flatMap((child) => findNodes(child, matches))];
}

export function findNodesByType(node: unknown, typeName: string): any[] {
  return findNodes(node, (element) => nameOf(element) === typeName);
}

export function findTextNodes(node: unknown): string[] {
  if (node === null || node === undefined || node === false) return [];
  if (typeof node === 'string') return [node];
  if (typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap((item) => findTextNodes(item));
  return childrenOf(node as ElementLike).flatMap((child) => findTextNodes(child));
}
