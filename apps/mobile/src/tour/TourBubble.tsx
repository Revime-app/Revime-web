import type { Ref } from 'react';
import { Pressable, Text, View, type Text as TextType } from 'react-native';
import { useTheme } from '../theme';
import { TOUR_DONE, TOUR_NEXT, TOUR_SKIP, type TourStep } from '../lib/tour-copy';

/**
 * V8 E2: one help bubble, as the client's two mockups draw it (`docs/client-feedback/v8/screenshots/
 * E2-bulle-aide-mode-client.png`, `…-reparateur.png`): a white card, a bold title, one sentence, then a
 * row « Passer » · counter · action button, the button red in client mode and navy in repairer mode
 * (criterion 5: `accent.accent` IS `palette.red` / `palette.navy`).
 *
 * Measured (PIL against the shipped TTFs, from the repo root, 2026-11-17; V8 §4 E2 « Investigation » (3)):
 * the box is `bubbleWidth()` = 327pt on a 375pt iPhone SE, so 295pt of text after 16pt padding. Titles at
 * 17pt `GoogleSansFlex_700Bold` run 74.8 to 257.5pt, one line each; sentences at 14.5pt
 * `GoogleSansFlex_400Regular` wrap to 1 to 3 lines at line height 20. The control row needs « Passer »
 * 43.5pt + « 4 / 4 » 27.8pt + « Compris » 56.2pt + 36pt button padding, ~165pt of 295pt. Tallest bubble
 * ≈ 16 + 22 + 6 + 60 + 16 + 36 + 16 = 172pt; `TourOverlay` measures the real height on layout.
 *
 * Hook-free apart from `useTheme`, so specs call it as a function; the screen-reader announcement and the
 * focus move live in `TourOverlay`, which owns the step changes.
 */
export function TourBubble({
  step,
  counter,
  isLast,
  onSkip,
  onNext,
  titleRef,
}: {
  step: TourStep;
  counter: string;
  isLast: boolean;
  onSkip: () => void;
  onNext: () => void;
  titleRef?: Ref<TextType>;
}) {
  const { palette, accent } = useTheme();
  const [n, total] = counter.split(' / ');

  return (
    <View
      accessibilityViewIsModal
      accessibilityLiveRegion="polite"
      style={{ backgroundColor: palette.paper, borderRadius: 18, padding: 16 }}
    >
      <Text
        ref={titleRef}
        accessibilityRole="header"
        style={{ fontFamily: 'GoogleSansFlex_700Bold', fontSize: 17, lineHeight: 22, color: palette.ink }}
      >
        {step.title}
      </Text>
      <Text
        style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14.5, lineHeight: 20, color: palette.muted, marginTop: 6 }}
      >
        {step.body}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}>
        <Pressable accessibilityRole="button" onPress={onSkip} hitSlop={10} style={{ paddingVertical: 8 }}>
          <Text style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14.5, color: palette.faint }}>{TOUR_SKIP}</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
        <Text
          accessibilityLabel={`Étape ${n} sur ${total}`}
          style={{ fontFamily: 'GoogleSansFlex_400Regular', fontSize: 14.5, color: palette.faint, marginRight: 14 }}
        >
          {counter}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onNext}
          style={[{ backgroundColor: accent.accent, borderRadius: 12, height: 36, paddingHorizontal: 18, justifyContent: 'center' }]}
        >
          <Text style={{ fontFamily: 'GoogleSansFlex_600SemiBold', fontSize: 15, color: palette.paper }}>
            {isLast ? TOUR_DONE : TOUR_NEXT}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
