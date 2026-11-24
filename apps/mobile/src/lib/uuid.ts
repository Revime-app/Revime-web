/**
 * Generate a syntactically valid UUID v4: 8-4-4-4-12 lowercase hex, with the
 * version nibble 4 and the variant nibble in [89ab].
 *
 * Uses Math.random(), which is acceptable here because `draftId` is only a
 * storage namespace and the tile `key` is only a React key. The sole
 * collision-sensitive identifier - the `objectId` inside the storage path - is
 * generated server-side with node:crypto and is untouched by this.
 *
 * Math.random() would NOT be acceptable for: authentication tokens, session IDs,
 * cryptographic nonces, or any identifier where collision has a security or
 * correctness consequence.
 */
export function generateUUID(): string {
  const hex = '0123456789abcdef';
  let uuid = '';
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) {
      uuid += '-';
    } else if (i === 14) {
      uuid += '4'; // version
    } else if (i === 19) {
      uuid += hex[(Math.random() * 4) | 8]; // variant: 8, 9, a, or b
    } else {
      uuid += hex[(Math.random() * 16) | 0];
    }
  }
  return uuid;
}
