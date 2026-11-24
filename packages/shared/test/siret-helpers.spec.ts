import { describe, it, expect } from 'vitest';
import {
  extractSiretFromFilename,
  extractSirenFromFilename,
  compareSiret,
  formatLegalForm,
  INSEE_LEGAL_FORMS,
} from '../src/index.js';

describe('Bug B4: SIRET extraction and comparison helpers', () => {
  describe('extractSiretFromFilename', () => {
    it('extracts 14-digit SIRET from real client feedback filename', () => {
      const filename = 'Avis_de_situation_97923317800040_08_09_2026 08_57_43.pdf';
      expect(extractSiretFromFilename(filename)).toBe('97923317800040');
    });

    it('extracts 14-digit SIRET with prefix or suffix separators', () => {
      expect(extractSiretFromFilename('kbis_80835976400020.pdf')).toBe('80835976400020');
      expect(extractSiretFromFilename('80835976400020-justificatif.pdf')).toBe('80835976400020');
      expect(extractSiretFromFilename('avis_situation_808 359 764 00020.pdf')).toBe('80835976400020');
      expect(extractSiretFromFilename('kbis.808.359.764.00020.pdf')).toBe('80835976400020');
    });

    it('returns null when filename has no 14-digit SIRET', () => {
      expect(extractSiretFromFilename('kbis.pdf')).toBeNull();
      expect(extractSiretFromFilename('justificatif_immatriculation_2026.pdf')).toBeNull();
      expect(extractSiretFromFilename('')).toBeNull();
    });

    it('ignores a 14-digit timestamp whose first nine digits fail the Luhn check', () => {
      expect(extractSiretFromFilename('document_20260908123456.pdf')).toBeNull();
    });

    it('ignores a 14-digit timestamp even when its first nine digits PASS the Luhn check', () => {
      // Luhn alone lets about one timestamp in eleven through (RU-12 review): 20260921031140 is
      // 21 Sep 2026 03:11:40 and its first nine digits, 202609210, are Luhn-valid.
      expect(extractSiretFromFilename('scan_20260921031140.pdf')).toBeNull();
      expect(extractSiretFromFilename('scan_20260717211219.pdf')).toBeNull();
    });

    it('still reads a real SIRET that sits next to a timestamp', () => {
      expect(extractSiretFromFilename('97923317800040_20260921031140.pdf')).toBe('97923317800040');
    });
  });

  describe('extractSirenFromFilename', () => {
    it('extracts 9-digit SIREN from filename when no SIRET is present', () => {
      expect(extractSirenFromFilename('kbis_979233178.pdf')).toBe('979233178');
      expect(extractSirenFromFilename('extrait_insee_808359764.pdf')).toBe('808359764');
    });

    it('returns null when no valid 9-digit SIREN exists', () => {
      expect(extractSirenFromFilename('kbis.pdf')).toBeNull();
      expect(extractSirenFromFilename('facture_12345.pdf')).toBeNull();
    });
  });

  describe('compareSiret', () => {
    it('flags mismatch between declared 80835976400020 and filename with 97923317800040', () => {
      const res = compareSiret({
        declaredSiret: '80835976400020',
        filename: 'Avis_de_situation_97923317800040_08_09_2026 08_57_43.pdf',
      });

      expect(res.mismatch).toBe(true);
      expect(res.match).toBe(false);
      expect(res.declaredSiret).toBe('80835976400020');
      expect(res.extractedSiret).toBe('97923317800040');
      expect(res.reason).toContain('97923317800040');
      expect(res.reason).toContain('80835976400020');
    });

    it('detects match when declared SIRET matches filename SIRET', () => {
      const res = compareSiret({
        declaredSiret: '808 359 764 00020',
        filename: 'kbis_80835976400020.pdf',
      });

      expect(res.mismatch).toBe(false);
      expect(res.match).toBe(true);
      expect(res.extractedSiret).toBe('80835976400020');
    });

    it('does not flag mismatch when filename contains no SIRET (generic name)', () => {
      const res = compareSiret({
        declaredSiret: '80835976400020',
        filename: 'justificatif_immatriculation.pdf',
      });

      expect(res.mismatch).toBe(false);
      expect(res.match).toBe(true);
      expect(res.extractedSiret).toBeNull();
      expect(res.hasExtractedSiret).toBe(false);
    });

    it('flags mismatch when declared SIREN does not match filename SIRET', () => {
      const res = compareSiret({
        declaredSiren: '808359764',
        filename: 'Avis_de_situation_97923317800040.pdf',
      });

      expect(res.mismatch).toBe(true);
      expect(res.match).toBe(false);
    });

    it('flags mismatch when declared SIRET does not match filename SIREN', () => {
      const res = compareSiret({
        declaredSiret: '80835976400020',
        filename: 'kbis_979233178.pdf',
      });

      expect(res.mismatch).toBe(true);
      expect(res.match).toBe(false);
    });

    it('handles missing filename or missing declared identifiers gracefully', () => {
      expect(compareSiret({ declaredSiret: '80835976400020', filename: null }).mismatch).toBe(false);
      expect(compareSiret({ declaredSiret: null, filename: 'kbis_80835976400020.pdf' }).mismatch).toBe(false);
    });
  });

  describe('formatLegalForm', () => {
    it('maps INSEE code 8310 from client screenshot to its full label', () => {
      expect(formatLegalForm('8310')).toBe('Comité social économique d’entreprise');
    });

    it('maps common commercial company codes', () => {
      expect(formatLegalForm('1000')).toBe('Entrepreneur individuel');
      // Official INSEE labels (cj_septembre_2022.xls). A plain SARL is 5499; 5410 is the « nationale » one.
      expect(formatLegalForm('5410')).toBe('SARL nationale');
      expect(formatLegalForm('5499')).toBe('Société à responsabilité limitée (sans autre indication)');
      expect(formatLegalForm('5710')).toBe('SAS, société par actions simplifiée');
      expect(formatLegalForm('5720')).toBe(
        'Société par actions simplifiée à associé unique ou société par actions simplifiée unipersonnelle',
      );
      expect(formatLegalForm('5599')).toBe("SA à conseil d'administration (s.a.i.)");
      expect(formatLegalForm('6540')).toBe('Société civile immobilière');
      // The codes the first hand-typed table got wrong.
      expect(formatLegalForm('6532')).toBe("Société civile d'intérêt collectif agricole (SICA)");
      expect(formatLegalForm('6533')).toBe("Groupement agricole d'exploitation en commun (GAEC)");
      expect(formatLegalForm('5306')).toBe('Société en commandite simple');
      expect(formatLegalForm('9220')).toBe('Association déclarée');
    });

    it('preserves already readable strings', () => {
      expect(formatLegalForm('Micro-entreprise / Auto-entrepreneur')).toBe('Micro-entreprise / Auto-entrepreneur');
      expect(formatLegalForm('SAS')).toBe('SAS');
      expect(formatLegalForm('SARL')).toBe('SARL');
    });

    it('handles empty / null / undefined gracefully', () => {
      expect(formatLegalForm(null)).toBe('—');
      expect(formatLegalForm(undefined)).toBe('—');
      expect(formatLegalForm('')).toBe('—');
      expect(formatLegalForm('   ')).toBe('—');
    });

    it('handles unknown 4-digit codes with their INSEE family', () => {
      expect(formatLegalForm('9999')).toBe('Autre personne morale de droit privé (9999)');
      expect(formatLegalForm('8399')).toBe("Comité d'entreprise (8399)");
    });

    it('shows a code of no known family as such, never as a guessed label', () => {
      expect(formatLegalForm('0123')).toBe('Autre forme juridique (0123)');
    });

    it('carries the whole official level III nomenclature (260 codes) plus the retired 5720', () => {
      const codes = Object.keys(INSEE_LEGAL_FORMS);
      expect(codes).toHaveLength(261);
      for (const code of codes) expect(code).toMatch(/^\d{4}$/);
      expect(INSEE_LEGAL_FORMS['8310']).toBe('Comité social économique d’entreprise');
      expect(INSEE_LEGAL_FORMS['5710']).toBe('SAS, société par actions simplifiée');
    });
  });
});
