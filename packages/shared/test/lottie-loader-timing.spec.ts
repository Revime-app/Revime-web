import { describe, expect, it } from 'vitest';
import {
  computeLoaderTiming,
  type LoaderTimingDecision,
} from '../src/lottie-loader-timing.js';

describe('computeLoaderTiming', () => {
  const DEFAULT_DELAY_MS = 300;
  const DEFAULT_MIN_DURATION_MS = 1500;

  describe('when isLoading is true', () => {
    it('does not display if loading has just started before delay (hasDisplayed = false)', () => {
      const decision: LoaderTimingDecision = computeLoaderTiming(
        true,
        false,
        null,
        1000,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: DEFAULT_DELAY_MS,
      });
    });

    it('uses custom delayMs when provided and hasDisplayed = false', () => {
      const customDelay = 500;
      const decision = computeLoaderTiming(
        true,
        false,
        null,
        1000,
        customDelay,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: customDelay,
      });
    });

    it('displays once loading duration exceeds delay (hasDisplayed = true)', () => {
      const decision = computeLoaderTiming(
        true,
        true,
        1300,
        1500,
      );

      expect(decision).toEqual({
        shouldDisplay: true,
        remainingMs: 0,
      });
    });
  });

  describe('when isLoading is false', () => {
    it('does not display and has 0 remainingMs if it never displayed (hasDisplayed = false)', () => {
      const decision = computeLoaderTiming(
        false,
        false,
        null,
        2000,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: 0,
      });
    });

    it('does not display and has 0 remainingMs if displayStartTimestamp is null', () => {
      const decision = computeLoaderTiming(
        false,
        true,
        null,
        2000,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: 0,
      });
    });

    it('enforces min duration of 1500ms if loading finishes early after being displayed (e.g. displayed for 500ms -> remaining 1000ms)', () => {
      const start = 1000;
      const now = 1500; // displayed for 500ms
      const decision = computeLoaderTiming(
        false,
        true,
        start,
        now,
      );

      expect(decision).toEqual({
        shouldDisplay: true,
        remainingMs: 1000,
      });
    });

    it('respects custom minDurationMs when enforcing display duration', () => {
      const start = 1000;
      const now = 1400; // displayed for 400ms
      const customMinDuration = 800;
      const decision = computeLoaderTiming(
        false,
        true,
        start,
        now,
        DEFAULT_DELAY_MS,
        customMinDuration,
      );

      expect(decision).toEqual({
        shouldDisplay: true,
        remainingMs: 400,
      });
    });

    it('allows dismissal when loading finishes and min duration has elapsed (e.g. displayed for 1600ms -> remaining 0ms)', () => {
      const start = 1000;
      const now = 2600; // displayed for 1600ms >= 1500ms
      const decision = computeLoaderTiming(
        false,
        true,
        start,
        now,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: 0,
      });
    });

    it('allows dismissal exactly when now - displayStartTimestamp equals minDurationMs', () => {
      const start = 1000;
      const now = 2500; // displayed exactly 1500ms
      const decision = computeLoaderTiming(
        false,
        true,
        start,
        now,
      );

      expect(decision).toEqual({
        shouldDisplay: false,
        remainingMs: 0,
      });
    });

    it('handles clock skew where now is earlier than displayStartTimestamp without negative displayed time', () => {
      const start = 2000;
      const now = 1900; // clock skew or jitter
      const decision = computeLoaderTiming(
        false,
        true,
        start,
        now,
      );

      // displayedTime = Math.max(0, 1900 - 2000) = 0 -> remaining = 1500 - 0 = 1500
      expect(decision).toEqual({
        shouldDisplay: true,
        remainingMs: DEFAULT_MIN_DURATION_MS,
      });
    });
  });
});
