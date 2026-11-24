import { describe, it, expect } from 'vitest';
import {
  formatEuros,
  formatCount,
  formatPercentage,
  formatResponseTime,
  getTrendSentiment,
  renderTrendBadge,
} from '../app/statistiques/StatsKpiCards';

describe('Stats KPI formatting helpers', () => {
  describe('formatEuros', () => {
    it('formats cents into EUR currency string', () => {
      // Non-breaking spaces may be used by Intl in French locale
      const normalized100 = formatEuros(10000).replace(/\u202F|\u00A0/g, ' ');
      expect(normalized100).toBe('100,00 €');

      const normalizedZero = formatEuros(0).replace(/\u202F|\u00A0/g, ' ');
      expect(normalizedZero).toBe('0,00 €');

      const normalizedFraction = formatEuros(1250).replace(/\u202F|\u00A0/g, ' ');
      expect(normalizedFraction).toBe('12,50 €');
    });
  });

  describe('formatCount', () => {
    it('formats integer counts with French thousand separators', () => {
      expect(formatCount(0)).toBe('0');
      expect(formatCount(42)).toBe('42');
      const normalizedLarge = formatCount(1234567).replace(/\u202F|\u00A0/g, ' ');
      expect(normalizedLarge).toBe('1 234 567');
    });
  });

  describe('formatPercentage', () => {
    it('formats numbers to one decimal place followed by % in French format (with comma)', () => {
      expect(formatPercentage(0)).toBe('0,0 %');
      expect(formatPercentage(45.67)).toBe('45,7 %');
      expect(formatPercentage(84.9)).toBe('84,9 %');
      expect(formatPercentage(100)).toBe('100,0 %');
    });
  });

  describe('formatResponseTime', () => {
    it('returns 0 min for zero or negative values', () => {
      expect(formatResponseTime(0)).toBe('0 min');
      expect(formatResponseTime(-10)).toBe('0 min');
    });

    it('formats values under 60 minutes in minutes', () => {
      expect(formatResponseTime(1)).toBe('1 min');
      expect(formatResponseTime(45)).toBe('45 min');
      expect(formatResponseTime(59.4)).toBe('59 min');
    });

    it('formats values of 60 minutes or more in hours', () => {
      expect(formatResponseTime(60)).toBe('1 h');
      expect(formatResponseTime(90)).toBe('1.5 h');
      expect(formatResponseTime(120)).toBe('2 h');
      expect(formatResponseTime(145)).toBe('2.4 h');
    });
  });

  describe('getTrendSentiment', () => {
    it('handles standard metrics where increase is positive', () => {
      expect(getTrendSentiment(15.2, false)).toBe('positive');
      expect(getTrendSentiment(-10.5, false)).toBe('negative');
      expect(getTrendSentiment(0, false)).toBe('neutral');
      expect(getTrendSentiment(null, false)).toBe('na');
    });

    it('handles inverted metrics (e.g. response time) where decrease is positive', () => {
      expect(getTrendSentiment(15.2, true)).toBe('negative');
      expect(getTrendSentiment(-10.5, true)).toBe('positive');
      expect(getTrendSentiment(0, true)).toBe('neutral');
      expect(getTrendSentiment(null, true)).toBe('na');
    });
  });

  describe('renderTrendBadge', () => {
    it('renders global history badge when period is "all"', () => {
      const badge = renderTrendBadge(10, 'all');
      expect(badge.props.children).toBe('Historique global');
    });

    it('renders n/a badge when changePct is null', () => {
      const badge = renderTrendBadge(null, '30d');
      expect(badge.props.children).toBe('vs période précédente : n/a');
    });

    it('renders positive trend badge for standard positive change', () => {
      const badge = renderTrendBadge(12.5, '30d', false);
      expect(badge.props['data-sentiment']).toBe('positive');
      expect(badge.props.children[0].props.children).toBe('↑');
      expect(badge.props.children[1].props.children.join('')).toContain('+12,5 %');
    });

    it('renders negative trend badge for standard negative change', () => {
      const badge = renderTrendBadge(-8.3, '30d', false);
      expect(badge.props['data-sentiment']).toBe('negative');
      expect(badge.props.children[0].props.children).toBe('↓');
      expect(badge.props.children[1].props.children.join('')).toContain('-8,3 %');
    });

    it('renders negative trend badge for inverted positive change (e.g. higher response time)', () => {
      const badge = renderTrendBadge(15.0, '30d', true);
      expect(badge.props['data-sentiment']).toBe('negative');
      expect(badge.props.children[0].props.children).toBe('↑');
      expect(badge.props.children[1].props.children.join('')).toContain('+15,0 %');
    });

    it('renders positive trend badge for inverted negative change (e.g. faster response time)', () => {
      const badge = renderTrendBadge(-20.0, '30d', true);
      expect(badge.props['data-sentiment']).toBe('positive');
      expect(badge.props.children[0].props.children).toBe('↓');
      expect(badge.props.children[1].props.children.join('')).toContain('-20,0 %');
    });
  });
});
