import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * A DEDICATED gate config for CI that checks ONLY `react-hooks/rules-of-hooks`.
 *
 * Why this exists, measured: B1 shipped a Rules-of-Hooks violation in
 * `app/utilisateurs/[id]/page.tsx` that nine review seats missed. `tsc` passes on a
 * violation, `next build` does not run lint (confirmed in the shipped docs at
 * `.../upgrading/version-16.md`), and the `lint` script is not a gate.
 *
 * Why a separate config rather than using the main one: the main config reported five
 * errors and eight warnings that B2 did not cause:
 * - `react-hooks/set-state-in-effect` at `app/utilisateurs/[id]/page.tsx:45` and
 *   `app/utilisateurs/page.tsx:53` (changing behaviour, so off-limits for this gate)
 * - `react-hooks/immutability` at `app/attention/page.tsx:22`
 * - `react/no-unescaped-entities` at `app/page.tsx:38` and `:39`
 * - Eight `@typescript-eslint/no-unused-vars` warnings
 *
 * A plain `eslint` gate would fail on day one. `--rule` adds to the config rather than
 * replacing it, so that route fails too.
 *
 * 🛑 2026-09-04, Stage 6 piece C1 — RE-MEASURED, NOT INCREMENTED. `npm run lint -w
 * @revime/admin` now reports **17 problems (8 errors, 9 warnings)**: the thirteen above
 * plus four this piece added, all four already silenced by the deny-list below, so
 * `lint:gate` stays green:
 * - `react-hooks/set-state-in-effect` at `app/demandes/page.tsx:61`,
 *   `app/demandes/[id]/page.tsx:65` and `app/offres/page.tsx:47` (errors) — the same
 *   filter-state-in-effect shape as the two B2 rows, kept for consistency with them
 * - `@next/next/no-img-element` at `app/demandes/[id]/page.tsx:202` (warning)
 *
 * Why `@next/next/no-img-element` is `off` here rather than fixed: the fiche renders
 * demande photos from **signed URLs to a private Supabase bucket**. `next/image` would
 * need a `remotePatterns` entry hard-coding the storage host into `next.config`, and its
 * optimiser caches derivatives keyed on the URL — which carries an expiring signature, so
 * every re-sign would be a fresh cache entry for the same object. A plain `<img>` is the
 * correct call for signed, short-lived URLs. The warning is deliberate and still shows in
 * `npm run lint`; it is silenced only in this gate config.
 *
 * 🛑 CORRECTION, 2026-09-04: an earlier version of this comment said the config "disables
 * ALL rules except the one we need". That is FALSE and the difference matters. What the
 * block below actually is, is a **DENY-LIST of seven rules by name** layered over Next's
 * full `core-web-vitals` + `typescript` configs. Every other rule in those configs is
 * still live, so a construct that trips a rule nothing in `apps/admin` has tripped yet
 * will fail `lint:gate` even though the gate is nominally about Rules of Hooks — and the
 * failure will read as a hooks regression. The honest shape is an allow-list: compute
 * `off` for every rule in `[...nextVitals, ...nextTs]`, then turn `rules-of-hooks` back
 * on. That is a RECORDED FOLLOW-UP and deliberately NOT done in C1 (see
 * `PROJECT_ROADMAP.md` §4, "From Stage 6 piece C1"), because it is a change to a gate and
 * belongs in a slice that can prove the gate still catches a planted violation.
 *
 * 🛑 DO NOT fix, disable, or baseline any of the 17 problems. Thirteen pre-date C1; the
 * four C1 rows are recorded, not hidden, and all seventeen are deliberately out of this
 * gate's scope.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // A DENY-LIST, not "all rules": exactly the seven the imported configs report on
      // `apps/admin` today. Anything they would report tomorrow is still live here.
      "react/no-unescaped-entities": "off",
      "react-hooks/exhaustive-deps": "off",
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@next/next/no-img-element": "off",
      // Enable ONLY the rule we need
      "react-hooks/rules-of-hooks": "error",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
