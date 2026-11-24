import { EMPTY_THROTTLE_STATE, type ThrottleState } from '../../src/auth/throttle/policy.js';
import type { ThrottleScope, ThrottleStore } from '../../src/auth/throttle/store.js';

/** The Prisma store's contract, in memory, for specs that drive a real Better Auth instance. */
export class MemoryThrottleStore implements ThrottleStore {
  readonly rows = new Map<string, ThrottleState>();

  private id(scope: ThrottleScope, key: string): string {
    return `${scope}|${key}`;
  }

  async read(scope: ThrottleScope, key: string): Promise<ThrottleState> {
    return this.rows.get(this.id(scope, key)) ?? EMPTY_THROTTLE_STATE;
  }

  async mutate<T>(
    scope: ThrottleScope,
    key: string,
    fn: (state: ThrottleState) => { state: ThrottleState; result: T },
  ): Promise<T> {
    const { state, result } = fn(await this.read(scope, key));
    this.rows.set(this.id(scope, key), state);
    return result;
  }

  async remove(scope: ThrottleScope, key: string): Promise<void> {
    this.rows.delete(this.id(scope, key));
  }

  async prune(): Promise<void> {}
}
