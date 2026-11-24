import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * REVIME_APP_PUBLICATION_PREPARATION.md PUB-33, DECP-23 (unit U7): the API marks the two store-review
 * accounts `marker: 'review'`. Every screen that tells an operator « this is a fixture » must also tell
 * him « this is a store-review account », or he would read the reviewer's activity as a real person's.
 */
const app = path.resolve(__dirname, '..', 'app');
const SCREENS = [
  'utilisateurs/page.tsx',
  'utilisateurs/[id]/page.tsx',
  'verifications/BusinessDecisionPanel.tsx',
  'verifications/VerificationsList.tsx',
];

describe('the review-account label', () => {
  for (const rel of SCREENS) {
    it(`${rel} labels a review account wherever it labels a fixture`, () => {
      const src = readFileSync(path.join(app, rel), 'utf8');
      const fixtures = src.match(/marker === 'fixture'/g)?.length ?? 0;
      const reviews = src.match(/marker === 'review' && ' · [Cc]ompte de revue'/g)?.length ?? 0;
      expect(fixtures).toBeGreaterThan(0);
      expect(reviews).toBe(fixtures);
    });
  }
});
