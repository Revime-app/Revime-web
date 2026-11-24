import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle, StyleSheet, View, type Text as TextType } from 'react-native';
import Svg, { Defs, Mask, Rect as SvgRect } from 'react-native-svg';
import { useTheme } from '../theme';
import { bubblePlacement, bubbleWidth, type Rect, type TourRun, type Viewport } from '../lib/tour';
import type { TourMode } from '../lib/tour-copy';
import { counterLabel } from '../lib/tour';
import { TourBubble } from './TourBubble';
import { TourOffer } from './TourOffer';

/**
 * The scrim: the client's `#010524` (Bleu prusse, his B1 text colour) at 55 %. rgba cannot read a token,
 * so it is written here once, as `accents.*.fabShadow` is in `packages/tokens`.
 */
export const TOUR_SCRIM = 'rgba(1, 5, 36, 0.55)';
/** The lit area around a target, and the white ring on its edge, as both mockups draw it. */
const HOLE_PAD = 8;
const HOLE_RADIUS = 26; // radii.card (20) + 6, so the ring follows a card's own corner
const RING = 3;
const ARROW = 14;
const BUBBLE_ESTIMATE = 172; // TourBubble.tsx header; replaced by the real height on first layout

export type TourShowing =
  | { kind: 'offer'; mode: TourMode }
  | { kind: 'bubble'; run: TourRun; rect: Rect; viewport: Viewport };

/**
 * V8 E2: draws whatever `TourProvider` is showing, over the screens and UNDER `MaintenanceGate`'s two
 * blocking screens: a plain absolute view, never an RN `Modal` (`FND8-027` (1)). Every rect it receives is
 * in WINDOW coordinates; `origin` is this overlay's own window position (the staff banner can push it
 * down), subtracted only when drawing.
 */
export function TourOverlay({
  showing,
  origin,
  windowWidth,
  windowHeight,
  onNext,
  onSkip,
  onStart,
  onLater,
}: {
  showing: TourShowing;
  origin: { x: number; y: number };
  windowWidth: number;
  windowHeight: number;
  onNext(): void;
  onSkip(): void;
  onStart(): void;
  onLater(): void;
}) {
  const { palette } = useTheme();
  const titleRef = useRef<TextType>(null);
  const [bubbleHeight, setBubbleHeight] = useState(BUBBLE_ESTIMATE);

  const step = showing.kind === 'bubble' ? showing.run.steps[showing.run.index]! : null;

  // Criterion 10: say the new bubble aloud and move the reader onto it.
  useEffect(() => {
    if (!step) return;
    AccessibilityInfo.announceForAccessibility(`${step.title}. ${step.body}`);
    const handle = titleRef.current ? findNodeHandle(titleRef.current) : null;
    if (handle) AccessibilityInfo.setAccessibilityFocus(handle);
  }, [step]);

  // Swallows every touch that misses the bubble: the screen under the scrim must not react.
  const catcher = <View style={StyleSheet.absoluteFill} onStartShouldSetResponder={() => true} />;

  if (showing.kind === 'offer') {
    return (
      <View accessibilityViewIsModal style={[StyleSheet.absoluteFill, { backgroundColor: TOUR_SCRIM, justifyContent: 'center', paddingHorizontal: 24 }]}>
        {catcher}
        <TourOffer mode={showing.mode} onStart={onStart} onLater={onLater} />
      </View>
    );
  }

  const { rect, viewport, run } = showing;
  const hole = {
    x: rect.x - HOLE_PAD - origin.x,
    y: rect.y - HOLE_PAD - origin.y,
    w: rect.width + 2 * HOLE_PAD,
    h: rect.height + 2 * HOLE_PAD,
  };
  const place = bubblePlacement(rect, bubbleHeight, viewport);
  const width = bubbleWidth(windowWidth);
  const left = (windowWidth - width) / 2 - origin.x;

  // Criterion 10: the overlay root is modal (iOS hides the navigator, its sibling, from VoiceOver);
  // TourProvider hides the app from TalkBack while the tour shows.
  return (
    <View accessibilityViewIsModal style={StyleSheet.absoluteFill}>
      <Svg width={windowWidth} height={windowHeight} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <Mask id="tour-cutout" x="0" y="0" width={windowWidth} height={windowHeight} maskUnits="userSpaceOnUse">
            <SvgRect x="0" y="0" width={windowWidth} height={windowHeight} fill="white" />
            <SvgRect x={hole.x} y={hole.y} width={hole.w} height={hole.h} rx={HOLE_RADIUS} ry={HOLE_RADIUS} fill="black" />
          </Mask>
        </Defs>
        <SvgRect x="0" y="0" width={windowWidth} height={windowHeight} fill={TOUR_SCRIM} mask="url(#tour-cutout)" />
        <SvgRect
          x={hole.x}
          y={hole.y}
          width={hole.w}
          height={hole.h}
          rx={HOLE_RADIUS}
          ry={HOLE_RADIUS}
          fill="none"
          stroke={palette.paper}
          strokeWidth={RING}
        />
      </Svg>
      {catcher}
      <View
        style={{ position: 'absolute', left, top: place.top - origin.y, width }}
        onLayout={(e) => setBubbleHeight(e.nativeEvent.layout.height)}
      >
        <View
          style={{
            position: 'absolute',
            left: place.arrowX - ARROW / 2,
            [place.side === 'below' ? 'top' : 'bottom']: -ARROW / 2 + 1,
            width: ARROW,
            height: ARROW,
            backgroundColor: palette.paper,
            transform: [{ rotate: '45deg' }],
          }}
        />
        <TourBubble
          step={step!}
          counter={counterLabel(run)}
          isLast={run.index === run.steps.length - 1}
          onSkip={onSkip}
          onNext={onNext}
          titleRef={titleRef}
        />
      </View>
    </View>
  );
}
