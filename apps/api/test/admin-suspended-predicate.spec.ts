import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { ACCOUNT_SUSPENDED_WHERE, isRepairerSuspended } from '../src/admin/admin-constants.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Follow-up #9: one « suspendu » predicate. §8.1's KPI and §8.2's list computed this two
 * different ways (the KPI on banReason, the list on profile.deletedAt), and B2 adds a
 * third surface that needs it. This test asserts both call sites now share one constant.
 *
 * 🛑 Technique: read the source files and assert they reference the shared constants. A
 * mocked Prisma cannot show which object was passed, so this scans the literal imports
 * and usages. Same technique as Task 6, for the same reason.
 */
describe('Shared suspended predicates (follow-up #9)', () => {
  const overviewSource = readFileSync(
    resolve(__dirname, '../src/admin/admin-overview.service.ts'),
    'utf-8',
  );
  const usersSource = readFileSync(
    resolve(__dirname, '../src/admin/admin-users.service.ts'),
    'utf-8',
  );

  /**
   * 🛑 `toContain("import")` IS GONE FROM BOTH OF THESE, and it was not a weak assertion but a
   * VACUOUS one: no TypeScript file in this repo can fail it. What is asserted instead is the
   * thing that can actually regress - that the constant is imported FROM `admin-constants.js`
   * specifically, rather than redeclared locally under the same name, which is exactly how
   * follow-up #9's two definitions drifted in the first place.
   */
  const importsFromConstants = (source: string, name: string): boolean =>
    new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'\\./admin-constants\\.js'`, 's')
      .test(source);

  it('admin-overview.service.ts imports ACCOUNT_SUSPENDED_WHERE from admin-constants', () => {
    expect(importsFromConstants(overviewSource, 'ACCOUNT_SUSPENDED_WHERE')).toBe(true);
  });

  it('admin-users.service.ts imports ACCOUNT_SUSPENDED_WHERE from admin-constants', () => {
    expect(importsFromConstants(usersSource, 'ACCOUNT_SUSPENDED_WHERE')).toBe(true);
  });

  it('admin-overview.service.ts uses ACCOUNT_SUSPENDED_WHERE for the suspended count', () => {
    // 🛑 `whereArg` used to be assigned here and never read, so the `match` above proved only
    // that SOME `user.count({ where: <identifier> })` exists - a fact unrelated to the
    // assertion below. The name the call actually passes is now checked.
    const match = overviewSource.match(/this\.prisma\.user\.count\(\s*\{\s*where:\s*(\w+)/);
    expect(match, 'user.count call for suspended accounts not found').toBeTruthy();
    const whereArg = match?.[1] ?? '';

    // Either the call passes the constant directly, or it passes a local bound to it. Both are
    // acceptable; an inline object literal is not, which is what this rules out.
    expect(
      whereArg === 'ACCOUNT_SUSPENDED_WHERE' ||
        overviewSource.includes(`${whereArg} = ACCOUNT_SUSPENDED_WHERE`),
      `user.count was passed \`${whereArg}\`, which is not ACCOUNT_SUSPENDED_WHERE or bound to it`,
    ).toBe(true);
  });

  it('admin-users.service.ts uses ACCOUNT_SUSPENDED_WHERE for the suspended filter', () => {
    // The suspendu branch must compose: `and.push({ AND: [ACCOUNT_SUSPENDED_WHERE, ...] })`.
    // This test checks the predicate expression at the call site, not just the import.
    // Match the entire suspendu block from 'if' to the closing brace of the else-if
    const suspendedBlock = usersSource.match(
      /if\s*\(\s*query\.statut\s*===\s*['"]suspendu['"]\s*\)\s*\{[\s\S]*?and\.push\(([^;]+)\);[\s\S]*?\}\s*else/
    );
    expect(suspendedBlock, 'suspendu filter block not found').toBeTruthy();

    const pushArgument = suspendedBlock?.[1] ?? '';
    // Must use AND composition with ACCOUNT_SUSPENDED_WHERE as the first element
    expect(pushArgument).toMatch(/\{\s*AND:\s*\[\s*ACCOUNT_SUSPENDED_WHERE/);
  });

  it('ACCOUNT_SUSPENDED_WHERE uses the KPI original form: banReason, not a relation traversal', () => {
    // The shared constant must use the KPI's original form to avoid the optional-relation trap.
    // A filter on `profile: { deletedAt: null }` nests on an optional to-one, which Prisma
    // reads as "a Profile row exists AND deletedAt is null" - excluding a banned orphan.
    const constantsSource = readFileSync(
      resolve(__dirname, '../src/admin/admin-constants.ts'),
      'utf-8',
    );

    const constantDef = constantsSource.match(
      /export\s+const\s+ACCOUNT_SUSPENDED_WHERE\s*=\s*({[^;]+})/s
    );
    expect(constantDef, 'ACCOUNT_SUSPENDED_WHERE definition not found').toBeTruthy();

    const constantBody = constantDef?.[1] ?? '';
    expect(constantBody).toContain('banned');
    expect(constantBody).toContain('true');
    expect(constantBody).toContain('banReason');
    // Must NOT contain a profile relation traversal at this level
    expect(constantBody).not.toContain('profile');
  });

  /**
   * 🛑 `REPAIRER_SUSPENDED_WHERE exists for réparateur-mode suspension` USED TO BE HERE AND IS
   * DELETED WITH THE CONSTANT. It asserted only that a constant existed, which is why nothing
   * noticed that nothing filtered on it: `admin-users.service.ts` imported it and never used it,
   * and its own header justified keeping two forms because *« a list that FILTERS on one
   * definition while DISPLAYING another »* is the drift this piece removed - a rationale that
   * requires something to filter.
   *
   * 🛑 MEASURED WHILE REMOVING IT: `isRepairerSuspended` had NO test anywhere - the only
   * reference to it in `apps/api/test` was that constant's existence check, which did not
   * exercise it. So deleting the dead half would have left the LIVE half uncovered, on a
   * function whose one subtlety decides whether an account with no `Profile` row reads as
   * suspended. The existence check is replaced by the behaviour, not merely dropped.
   *
   * A `statut=reparateur-suspendu` filter would be the reason to bring the fragment back. It is
   * NEW SCOPE - `admin-constants.ts` records what it would cost - not something to build here.
   */
  describe('isRepairerSuspended, the one live form', () => {
    it('is true when repairerSuspendedAt holds a date', () => {
      expect(isRepairerSuspended({ repairerSuspendedAt: new Date('2026-09-01T10:00:00Z') })).toBe(true);
    });

    it('is false when repairerSuspendedAt is null', () => {
      expect(isRepairerSuspended({ repairerSuspendedAt: null })).toBe(false);
    });

    /**
     * 🛑 THE `!= null` VS `!== null` CASE, AND IT IS THE REASON THE FUNCTION EXISTS. The field is
     * selected conditionally (`repairerSuspendedAt: isRepairerList`), and the relation is
     * optional, so `undefined` is reachable on both. Under a strict `!== null` both of these
     * would report an account as SUSPENDED on the strength of a field nobody asked for.
     */
    it('is false for an absent field and for an absent profile', () => {
      expect(isRepairerSuspended({})).toBe(false);
      expect(isRepairerSuspended({ repairerSuspendedAt: undefined })).toBe(false);
      expect(isRepairerSuspended(null)).toBe(false);
      expect(isRepairerSuspended(undefined)).toBe(false);
    });
  });

  it('the list composes with a live-profile requirement at the call site', () => {
    // The list must exclude a banned orphan (no Profile row) because it renders profile
    // fields and must agree with KPI #1. The composition must use AND with explicit `is:`
    // so nothing can clobber the base predicate.
    const suspendedBlock = usersSource.match(
      /if\s*\(\s*query\.statut\s*===\s*['"]suspendu['"]\s*\)\s*\{[\s\S]*?and\.push\(([^;]+)\);[\s\S]*?\}\s*else/
    );
    expect(suspendedBlock, 'suspendu filter block not found').toBeTruthy();
    const pushArgument = suspendedBlock?.[1] ?? '';

    expect(pushArgument).toContain('AND');
    expect(pushArgument).toContain('ACCOUNT_SUSPENDED_WHERE');
    expect(pushArgument).toContain('profile');
    expect(pushArgument).toContain('is:');
    expect(pushArgument).toContain('deletedAt');
  });

  it('ACCOUNT_SUSPENDED_WHERE includes a banned orphan (no Profile row)', () => {
    // The Critical: a banned user with NO Profile row must be counted by the KPI. The
    // predicate must not nest a filter on the optional profile relation, or Prisma reads
    // it as "Profile row exists AND...", excluding the orphan. This is the one case where
    // the KPI and the list provably differ - the list excludes him via composition.
    const predicate = ACCOUNT_SUSPENDED_WHERE;

    // Structurally: the predicate must have banned:true at the top level
    expect(predicate.banned).toBe(true);

    // Structurally: the predicate must NOT have a nested profile filter
    expect('profile' in predicate).toBe(false);

    // The banReason condition must be at the top level, not nested
    expect('OR' in predicate).toBe(true);
    const orConditions = predicate.OR as unknown[];
    expect(orConditions.length).toBeGreaterThan(0);
  });

  /**
   * 🛑 Mutation probes verified by the reviewer (four passed):
   * 1. Renaming ACCOUNT_SUSPENDED_WHERE to a different name → fails (import test catches)
   * 2. Inlining the predicate at the overview call site → fails (usage test catches)
   * 3. Using a different constant at the users call site → fails (composition test catches)
   * 4. Removing the banReason field from the constant → fails (shape test catches)
   *
   * These probes prove the scans distinguish presence from absence and detect the right properties.
   * No vacuity detected - the tests genuinely enforce what they claim.
   */
});
