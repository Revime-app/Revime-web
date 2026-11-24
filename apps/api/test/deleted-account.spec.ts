import { describe, expect, it } from 'vitest';
import { DELETED_USER_NAME } from '@revime/shared';
import { isDeletedAccount } from '../src/admin/deleted-account.js';

describe('isDeletedAccount', () => {
  it('reads the profile tombstone', () => {
    expect(isDeletedAccount({ name: 'Alice', profile: { deletedAt: new Date() } })).toBe(true);
  });

  it('reads the replaced name when the profile row is gone', () => {
    expect(isDeletedAccount({ name: DELETED_USER_NAME, profile: null })).toBe(true);
  });

  it('keeps a live account live', () => {
    expect(isDeletedAccount({ name: 'Alice', profile: { deletedAt: null } })).toBe(false);
    expect(isDeletedAccount({ name: null, profile: null })).toBe(false);
  });
});
