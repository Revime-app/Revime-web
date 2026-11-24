import { describe, expect, it } from 'vitest';
import type { DisputeStatusType } from '@revime/shared';
import {
  canWriteSpace,
  renderSupportBody,
  spaceTabs,
  visibleToLabel,
} from '../lib/dispute-spaces';

describe('Admin Dispute Spaces Helpers (CF4-32)', () => {
  describe('visibleToLabel', () => {
    it('returns exact visibility label for each space', () => {
      expect(visibleToLabel('MAIN')).toBe('Visible par : client et réparateur');
      expect(visibleToLabel('CLIENT')).toBe('Visible par : client uniquement');
      expect(visibleToLabel('REPAIRER')).toBe('Visible par : réparateur uniquement');
    });
  });

  describe('spaceTabs', () => {
    it('preserves the exact tab order and labels', () => {
      expect(spaceTabs).toEqual([
        { id: 'MAIN', label: 'Conversation principale' },
        { id: 'CLIENT', label: 'Espace client (confidentiel)' },
        { id: 'REPAIRER', label: 'Espace réparateur (confidentiel)' },
      ]);
    });
  });

  describe('canWriteSpace', () => {
    const activeStatuses: DisputeStatusType[] = ['OPEN', 'IN_REVIEW'];
    const resolvedStatuses: DisputeStatusType[] = [
      'RESOLVED_REFUNDED',
      'RESOLVED_RELEASED',
      'RESOLVED_DISMISSED',
    ];

    it('allows writing to all spaces when OPEN or IN_REVIEW', () => {
      for (const status of activeStatuses) {
        expect(canWriteSpace('MAIN', status)).toBe(true);
        expect(canWriteSpace('CLIENT', status)).toBe(true);
        expect(canWriteSpace('REPAIRER', status)).toBe(true);
      }
    });

    it('allows writing to MAIN space when resolved, but disallows CLIENT and REPAIRER spaces', () => {
      for (const status of resolvedStatuses) {
        expect(canWriteSpace('MAIN', status)).toBe(true);
        expect(canWriteSpace('CLIENT', status)).toBe(false);
        expect(canWriteSpace('REPAIRER', status)).toBe(false);
      }
    });
  });

  describe('renderSupportBody', () => {
    it('strips SUPPORT_PREFIX from prefixed messages', () => {
      expect(renderSupportBody('REVIME — Support : Bonjour')).toBe('Bonjour');
    });

    it('leaves unprefixed messages unchanged', () => {
      expect(renderSupportBody('Message ordinaire')).toBe('Message ordinaire');
    });
  });
});
