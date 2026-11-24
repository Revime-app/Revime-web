/**
 * Stripe Identity `last_error.code` values, grouped by what they mean for the non-biometric
 * route. Read from Stripe's own "Handle verification outcomes" table on 2026-09-02.
 *
 * 🛑 THIS FILE IS DELIBERATELY IN `apps/api` AND NOT IN `packages/shared`. The app must not hold
 * these sets or reason about `lastErrorCode` at all - the server derives
 * `documentOnlyAvailable` and `documentOnlyRecommended` into `IdentityStatusResponse` instead.
 * An app re-deriving them would be `CF-10`'s Critical defect again: answering a server question
 * with data that does not contain the answer. See the spec's §4.5.
 */

/**
 * The face did not match the document, or the image was doctored. **These ARE the signal the
 * selfie check exists to produce**, so the document-only route is refused after them - otherwise
 * a suspected fraudster is routed around the control that just caught him, and because both
 * variants grant `IDENTITY` he lands verified.
 *
 * The legal position, because this looks like it weakens the obligation and does not: the
 * always-available control discharges Stripe's « offer it if they request it » guidance for
 * everyone who has not tripped one of these. The duty is about consent and coverage.
 */
export const SELFIE_FRAUD_CODES: ReadonlySet<string> = new Set([
  'selfie_face_mismatch',
  'selfie_manipulated',
]);

/**
 * Codes for which document-only is genuinely the remedy, so the alternative is PROMOTED rather
 * than merely available.
 *
 * 🛑 THIS SET DECIDES PROMINENCE, NEVER AVAILABILITY. Everyone whose account is not
 * fraud-signalled sees the quiet control regardless. Deliberately EXCLUDED, and each for a
 * reason rather than an oversight:
 *   - `selfie_unverified_other` - Stripe could not verify the selfie; that is not evidence the
 *     user is entitled to skip it, and it is indistinguishable from a failed fraud attempt.
 *   - `document_expired`, `document_unverified_other`, `document_type_not_supported` - the
 *     DOCUMENT failed. Dropping the selfie changes nothing.
 *   - `under_supported_age`, `country_not_supported` - outside Identity's coverage entirely.
 * Promoting the alternative for any of those would be the defect `apps/mobile/AGENTS.md` records
 * twice: the app pointing at a place that cannot answer.
 */
export const DOCUMENT_ONLY_REMEDY_CODES: ReadonlySet<string> = new Set([
  'consent_declined',
  'selfie_document_missing_photo',
]);
